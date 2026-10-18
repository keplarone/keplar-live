/**
 * Free plan: ONE call that classifies, reviews and writes.
 *
 * The Free pool is a single shared OpenRouter key limited by REQUESTS (20/min, 50 or 1000/day), so the paid pipeline's separate
 * position extractor, reviewer and write-up (three more requests after the panel) are folded into one request here. The panel
 * itself is two models (router.ts FREE_MAX_PANEL), so a consensus question costs 3 requests instead of 6-7.
 *
 * What stays honest:
 *  - the same fields are produced (positions, claims, review checks, written answer), so agreement, disputes and the
 *    "where the models disagree" section are still derived from what the models actually said;
 *  - if the combined call fails or its output can't be read, NOTHING more is sent: the answer is the leading model's own reply and
 *    the answer card says agreement wasn't scored / the answer wasn't cross-checked;
 *  - with fewer than two panel answers there is nothing to compare: that model's reply is shown, labelled as a single model.
 * Paid plans never use this module.
 */
import { UNCLASSIFIED } from "./comparator";
import { applyExtraction, parseExtraction } from "./extractor";
import { isBudgetAbort, LatencyBudget } from "./latency";
import { hasMedia, textOnlyMediaNote } from "./media";
import { isGuideRequest } from "./answer-shape";
import { spentUsd } from "./pricing";
import type { createRegistry, RegistryResult } from "./providers";
import { parseChecks } from "./verifier";
import { GUIDE_SYNTH_RULES, SYNTH_SYSTEM_PROMPT } from "./live-synthesizer";
import { richHint } from "@/lib/rich-answer/prompt";
import { identityPrompt } from "@/lib/identity";
import { VOICE_PROMPT } from "@/lib/persona";
import { HUMAN_TONE_PROMPT } from "@/lib/persona-tone";
import type { Classification, KeplarRequest, ModelSpec, ProviderResult, Verification } from "./types";

type Ok = Extract<ProviderResult, { ok: true }>;

export const ANSWER_MARKER = "=====ANSWER=====";

export const MERGED_SYSTEM_PROMPT = `You are Keplar's combined reviewer: three jobs in one reply. You get a user question and independent model responses labeled R1, R2, ...
JOB 1, CLASSIFY. Group the responses by their BOTTOM-LINE position: responses that lead the user to the same answer share a position even if worded differently; responses that give a different answer, number, recommendation or conclusion take different positions. Use as FEW positions as the responses allow.
JOB 2, REVIEW. Look for reasoning that doesn't hold, contradictions (within a response or between responses), and claims only some responses support. Use only the responses; no outside sources.
JOB 3, WRITE the final answer for the user.

Reply in exactly this shape:
1. One line of JSON, nothing else on it:
{"topic":string,"positions":[{"id":"P1","label":string,"summary":string}],"responses":[{"id":"R1","kind":"answer"|"declined"|"off-topic","position":"P1"|null}],"claims":[{"text":string,"responses":["R1"]}],"checks":[{"kind":"reasoning"|"contradiction"|"unsupported","finding":string,"models":string[],"outcome":"held"|"revised"|"removed"|"kept-as-dissent","resolution":string}],"disputed":string[]}
 - label: at most 8 words. summary: one sentence. declined/off-topic responses get position null. claims: at most 8, each listing every response that makes it. checks: at most 5, one sentence per field, [] if nothing needs flagging. disputed: claims still unresolved (max 3).
2. A line containing exactly: ${ANSWER_MARKER}
3. The final answer, following these writing rules (the "positions, claims and reviewer findings" are the ones you just produced):
${SYNTH_SYSTEM_PROMPT}`;

export type MergedOutcome = {
  results: ProviderResult[];
  topic?: string;
  summaries: Record<string, string>;
  verification: Verification;
  /** The written answer (with its RESOLUTION line), or null when none could be read. */
  written: { text: string; by: string } | null;
  notes: string[];
};

/** Pure: split the reply into its JSON part and its written answer. */
export function splitMerged(text: string): { json: string; answer: string } {
  const i = text.indexOf(ANSWER_MARKER);
  if (i < 0) return { json: text, answer: "" };
  return { json: text.slice(0, i), answer: text.slice(i + ANSWER_MARKER.length).trim() };
}

export class MergedFreeReview {
  spentUsd = 0;
  /** The longest the combined call may take (Free hosts are slow; past this the leading reply is shown). */
  capMs = 20_000;

  constructor(
    private readonly registry: ReturnType<typeof createRegistry>,
    private readonly model: ModelSpec,
    private readonly budget?: LatencyBudget,
  ) {}

  /** At most ONE request. Never retries on another model beyond the registry's own Free fallback (which the pool governor limits). */
  async run({ req, results, classification, signal }: { req: Pick<KeplarRequest, "prompt" | "media" | "routing">; results: ProviderResult[]; classification: Classification; signal?: AbortSignal }): Promise<MergedOutcome> {
    const ok = results.filter((r): r is Ok => r.ok && r.stance === UNCLASSIFIED);
    const none: Verification = { mode: "not-needed", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] };
    if (ok.length < 2) {
      // One answer only: nothing to compare. Show that model's reply as it is and say it wasn't cross-checked.
      const only = results.find((r): r is Ok => r.ok);
      return {
        results,
        summaries: {},
        verification: { ...none, mode: "cross-model", notes: ["Only one model answered, so this answer wasn't compared or cross-checked."] },
        written: only ? { text: only.text, by: only.modelId } : null,
        notes: [],
      };
    }
    const ids = new Map(ok.map((r, i) => [r.modelId, `R${i + 1}`]));
    // How-to: the written part is a full guide (answer-shape.ts), so it needs each model's whole guide, more output and more time.
    const guide = classification.errorProne !== "exact" && !hasMedia(req.media) && isGuideRequest(req.prompt);
    const body = ok.map((r) => `### ${ids.get(r.modelId)}\n${r.text.slice(0, guide ? 7000 : 4000)}`).join("\n\n");
    const stage = this.budget ? this.budget.stageMs(0.5) : undefined;
    const cap = guide ? Math.max(this.capMs, 50_000) : this.capMs;
    const callSignal = stage !== undefined ? LatencyBudget.signal(Math.min(cap, stage), signal) : signal;
    let r: RegistryResult;
    try {
      r = await this.registry.generate({
        model: this.model,
        prompt: `Question:\n${req.prompt}${textOnlyMediaNote(req.media)}\n\nResponses:\n${body}${richHint(req.prompt) ? `\n\n${richHint(req.prompt)}` : ""}`,
        classification,
        params: { reasoningOff: true, maxOutputTokens: guide ? 5600 : 2400 },
        tier: req.routing?.tier,
        slot: "verifier",
        system: `${MERGED_SYSTEM_PROMPT}${guide ? `\n${GUIDE_SYNTH_RULES}` : ""}\n\n${identityPrompt()}\n\n${VOICE_PROMPT}\n\n${HUMAN_TONE_PROMPT}`,
        signal: callSignal,
      });
    } catch (e) {
      if (!isBudgetAbort(e, signal)) throw e;
      return this.failed(results, ok, "The combined review didn't finish within the latency budget, so agreement isn't scored and this answer wasn't cross-checked.");
    }
    if (!r.ok) return this.failed(results, ok, "The combined review didn't respond, so agreement isn't scored and this answer wasn't cross-checked.");
    this.spentUsd += spentUsd(r.model, r);
    const by = r.model;
    const { json, answer } = splitMerged(r.text);
    const ex = parseExtraction(json, [...ids.values()]);
    const parsed = parseChecks(json);
    const written = answer ? { text: answer, by: by.id } : null;
    if (!ex) {
      const base = this.failed(results, ok, "The combined review's output couldn't be read, so agreement isn't scored.");
      return { ...base, written: written ?? base.written, verification: { ...base.verification, reviewer: { modelId: by.id, name: by.name, role: "verifier" } } };
    }
    const applied = applyExtraction(results, ids, ex);
    const checks = parsed?.checks ?? [];
    const removedCount = checks.filter((c) => c.outcome === "removed").length;
    const verification: Verification = {
      mode: "cross-model",
      reviewer: { modelId: by.id, name: by.name, role: "verifier" },
      checks,
      disputed: (parsed?.disputed ?? []).map((text, i) => ({ id: `disputed-${i}`, text })),
      checked: checks.length,
      supported: checks.length - removedCount,
      removed: [],
      notes: parsed ? [] : ["The review's checks couldn't be read, so no checks are shown for this answer."],
      costUsd: spentUsd(by, r),
    };
    return { results: applied.results, topic: ex.topic, summaries: applied.summaries, verification, written, notes: [] };
  }

  private failed(results: ProviderResult[], ok: Ok[], note: string): MergedOutcome {
    void ok;
    return {
      results,
      summaries: {},
      verification: { mode: "cross-model", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [note] },
      // No second attempt: the leading panel model's own reply is what the person sees (the card says so).
      written: null,
      notes: [],
    };
  }
}
