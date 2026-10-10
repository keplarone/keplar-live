/**
 * Live, judge-tier synthesizer.
 *
 * - draft(): the judge-tier model writes a short draft from the extracted
 *   positions and claims (with how many models support each). The verifier
 *   reviews this draft against the individual responses. If the latency budget
 *   is nearly spent, a structured draft (positions + claims) is used instead.
 * - synthesize(): the judge-tier model writes the final answer from the
 *   positions, the claims and their support, the reviewer's findings and the
 *   draft. It weighs evidence and reasoning, not headcount, and states the
 *   disagreement when there is one. If the call fails, a structured answer
 *   built from the positions is shown (never one model's response verbatim).
 *
 * Nothing here fetches or checks external sources. URLs the models cited are
 * listed as "Cited by models" and are not opened by Keplar.
 */
import { GENERIC_RESOLUTION } from "@/lib/disagreement-view";
import { catalogById } from "./catalog";
import { UNCLASSIFIED } from "./comparator";
import { isBudgetAbort, LatencyBudget } from "./latency";
import { spentUsd } from "./pricing";
import { sleep } from "./sleep";
import { fmtClock, hasMedia, textOnlyMediaNote } from "./media";
import type { createRegistry } from "./providers";
import { consensusSummary } from "./synthesizer";
import type { Comparison, ConsultedModel, Disagreement, ModelSpec, ProviderResult, Source, Synthesizer } from "./types";
import { identityPrompt } from "@/lib/identity";
import { VOICE_PROMPT, guardVoice } from "@/lib/persona";
import { HUMAN_TONE_PROMPT, polish } from "@/lib/persona-tone";
import { guardDisagreement } from "./disagreement-guard";
import { RESEARCH_CRITIQUE_RULES, RESEARCH_SYNTH_RULES } from "./research";
import { CLARITY_STYLE, GROUNDING_STYLE } from "@/lib/style/clarity";

type Ok = Extract<ProviderResult, { ok: true }>;
const nameOf = (id: string) => catalogById.get(id)?.name ?? id;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A reviser that appends its own "OK" verdict line must not leak it into the answer. */
export const stripVerdict = (t: string) => t.replace(/\n+\s*OK\.?\s*$/i, "").trim();

export const DRAFT_SYSTEM_PROMPT = `You are Keplar's judge-tier synthesizer writing a DRAFT for a reviewer. You get a question, the positions independent models took (with how many models hold each) and the claims they made (with how many models support each).
Write a concise draft answer (at most 180 words). Weigh the evidence and reasoning behind each position, not the number of models. If the positions conflict, say which is better supported and why, and state the dissent. Use only the material given.`;

export const SYNTH_SYSTEM_PROMPT = `You are Keplar's judge-tier synthesizer. You get a user question, the positions independent models took, the claims behind them with how many models support each, a reviewer's findings, and a draft.
Write the final answer for the user in markdown:
- Lead with the direct answer. Then keep the shape the question calls for: if it asks for N things, options, ideas or steps, give exactly that as a numbered list (one bold lead and one concrete line each); keep every piece of code the responses agree on in a fenced code block with its language, complete enough to run, with the fix shown; a short table only for a real side-by-side comparison. Otherwise short paragraphs. Never squeeze a list into one paragraph.
- Include the key supporting points. Weigh the evidence and reasoning behind each claim, not how many models made it. Apply the reviewer's resolutions (drop removed claims, qualify revised ones).
- Only if the positions above show more than one stance, add a short "**Where the models disagree**" section naming each position fairly and saying which is better supported and why, or that it's genuinely unresolved. If every model took the same position, do NOT write that section and do not present an alternative as something a model argued. When the user asks for the strongest counterargument or for when another option would win, give it plainly in the answer itself, as the counterargument, not as a model disagreement.
- Say plainly when something is uncertain. Don't invent facts, numbers or sources, and don't claim that anything was checked against sources or the web.
- Refer to positions by what they say or by model name, never by ids like "P1". Don't mention the reviewer, the draft or this process, and never write "the material", "the responses" or "the perspectives provided": state the advice itself, to the user, in plain words.
- Be as long as the question needs and no longer: up to about 350 words, more only when code or a requested list needs it. No preamble, no closing offer.
- There are no outside sources here, only the models. Never write that "sources" or "studies" or "experts" differ. When models differ only in small details (a number, a name, a style), pick the better one and move on; do not report it as a disagreement.
- Math: LaTeX with \\( ... \\) for inline and $$ ... $$ on its own lines for display; never bare $...$; write money in plain text (for example $5).
If the question has several parts, answer each part in order and make sure none is skipped.
${CLARITY_STYLE}
${GROUNDING_STYLE}
After the answer, on its own final line, write: RESOLUTION: <one sentence on how the disagreement was resolved, or "No disagreement.">`;

/** The last pass on hard (DEEP) questions: one editor check for completeness, overclaiming and tone. Replies "OK" when nothing needs changing. */
export const CRITIQUE_SYSTEM_PROMPT = `You are Keplar's final editor. You get the question, the answer that is about to be shown, and the material it was written from.
Check it once:
1. Does it answer every part of the question, directly, in the first lines?
2. Is any claim not supported by the material, or stated with more certainty than the material allows? Fix or soften it. Do not add new facts.
3. Is it easy to follow: the answer in the first sentence, plain words, short sentences and paragraphs, any needed technical term explained in a few words, nothing over-explained?
4. Does it read like a thoughtful, warm person talking (natural phrasing, no boilerplate, matched to the person's mood) while staying concise and exact for code, math and facts?
If it is already good, reply with exactly: OK
Otherwise reply with the corrected final answer only (same markdown format, no commentary, no preface, about the same length or shorter).`;

/** An edited answer must still be the same answer: most of its content words come from the original (never an unrelated reply). */
export function sameAnswer(original: string, edited: string): boolean {
  const w = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
  const a = w(original), b = w(edited);
  if (!a.size || !b.size) return false;
  const shared = [...b].filter((x) => a.has(x)).length;
  return shared / b.size >= 0.45;
}

function positionsBlock(comparison: Comparison, summaries: Record<string, string>) {
  return comparison.positions
    .map((p, i) => `P${i + 1} "${p.stance}" — held by ${plural(p.modelIds.length, "model", "models")} (${p.modelIds.map(nameOf).join(", ")}). ${summaries[p.stance] ?? ""}`.trim())
    .join("\n");
}

function claimsBlock(results: ProviderResult[]) {
  const ok = results.filter((r): r is Ok => r.ok);
  const byText = new Map<string, Set<string>>();
  for (const r of ok) for (const c of r.claims) byText.set(c.text, (byText.get(c.text) ?? new Set()).add(r.modelId));
  return [...byText].map(([t, s]) => `- ${t} (${s.size} of ${ok.length} models)`).join("\n");
}

function structuredDraft(comparison: Comparison, summaries: Record<string, string>, results: ProviderResult[]) {
  return `Positions:\n${positionsBlock(comparison, summaries)}\n\nClaims:\n${claimsBlock(results)}`;
}

export class ModelSynthesizer implements Synthesizer {
  spentUsd = 0;
  /** Position label → one-sentence summary, filled from the response classifier. */
  summaries: Record<string, string> = {};
  topic = "";
  notes: string[] = [];
  /** Model that actually wrote the last synthesis call (a free fallback may stand in). */
  writer: string | null = null;
  /** Free plan (live): no separate draft call. The reviewer runs alongside the position extraction and reads the responses themselves; the final writer gets the structured positions and claims. */
  draftless = false;
  /**
   * Free plan, combined review (free-merged.ts): the answer was already written by the one combined call. When set it is used instead
   * of a write-up request, and `noExtraCalls` makes sure no further request (write-up, self-critique) is ever sent: if nothing usable
   * is on hand the leading panel model's own reply is shown, with the note saying so.
   */
  prewritten: { text: string; by: string } | null = null;
  noExtraCalls = false;
  /** Deep Research ran and found pages (research.ts): the writer may use them and cites them as [n]; the brief rides in req.memory. */
  research = false;

  constructor(
    private readonly registry: ReturnType<typeof createRegistry>,
    private readonly model: ModelSpec,
    private readonly budget?: LatencyBudget,
  ) {}

  private async call(system: string, prompt: string, maxOutputTokens: number, share: number, signal: AbortSignal | undefined, req: { routing?: { tier?: "standard" | "sensitive" } }, classification: Parameters<Synthesizer["synthesize"]>[0]["classification"], capMs?: number) {
    const callSignal = this.budget ? LatencyBudget.signal(capMs ? Math.min(capMs, this.budget.stageMs(share)) : this.budget.stageMs(share), signal) : signal;
    try {
      const r = await this.registry.generate({ model: this.model, prompt, classification, params: this.reasoningOff ? { reasoningOff: true, maxOutputTokens } : { reasoningEffort: "low", maxOutputTokens }, tier: req.routing?.tier, slot: "judge", system: `${system}\n\n${identityPrompt()}\n\n${VOICE_PROMPT}\n\n${HUMAN_TONE_PROMPT}`, signal: callSignal });
      if (r.ok) this.spentUsd += spentUsd(this.model, r);
      else this.callFailure = r.reason === "timeout" ? "slow" : "unavailable";
      return r.ok ? { text: r.text, by: r.model.id } : null;
    } catch (e) {
      if (!isBudgetAbort(e, signal)) throw e;
      this.callFailure = "slow";
      return null;
    }
  }

  /**
   * The longest the written synthesis may take. A slow free model used to hold a finished panel for 25+ seconds (measured on the live site:
   * three answers in 4 s, synthesis done at 37 s); past this the answer from the best-supported model is shown instead, and says so.
   */
  synthCapMs = 20_000;
  /** Set by the last synthesize(): the leading model's own reply was kept (no separate write-up). */
  keptReply = false;
  /** Free: ask the model not to think first (see FREE_ROLES). */
  reasoningOff = false;
  private callFailure: "slow" | "unavailable" = "slow";

  async draft(input: Parameters<NonNullable<Synthesizer["draft"]>>[0]) {
    this.lastDraft = await this.writeDraft(input);
    return this.lastDraft;
  }

  private async writeDraft({ req, results, comparison, signal }: Parameters<NonNullable<Synthesizer["draft"]>>[0]) {
    const structured = structuredDraft(comparison, this.summaries, results);
    if (!comparison.positions.length) {
      // Unscored (extraction failed): give the reviewer every response, not one of them.
      return results.filter((r): r is Ok => r.ok).map((r) => `${nameOf(r.modelId)}: ${r.text.slice(0, 1500)}`).join("\n\n");
    }
    if (this.draftless || (this.budget && this.budget.remaining() < 15_000)) return structured;
    const classification = { kind: "general" as const, complexity: "moderate" as const, capabilities: [], estimatedInputTokens: 1500, estimatedOutputTokens: 400, needsWeb: false, rationale: "" };
    const r = await this.call(DRAFT_SYSTEM_PROMPT, `Question:\n${req.memory ?? ""}${req.prompt}${textOnlyMediaNote(req.media)}\n\n${structured}`, 700, 0.25, signal, req, classification);
    return r?.text ?? structured;
  }

  async synthesize({ req, classification, plan, results, comparison, verification, preferredModelId, onDelta, signal }: Parameters<Synthesizer["synthesize"]>[0]) {
    const ok = results.filter((r): r is Ok => r.ok);
    const scored = comparison.positions.length > 0 && !ok.some((r) => r.stance === UNCLASSIFIED);
    const single = plan.mode === "single";

    let markdown: string;
    let resolution = "";
    if (single) {
      // One model answered a simple question: its answer is the answer (nothing to synthesize).
      markdown = ok[0]?.text ?? "No model returned an answer.";
    } else {
      const findings = verification.checks.filter((c) => c.kind !== "web").map((c) => `- [${c.kind}/${c.outcome}] ${c.finding} → ${c.resolution}`).join("\n") || "- No issues found.";
      const material = scored
        ? `Positions:\n${positionsBlock(comparison, this.summaries)}\n\nClaims:\n${claimsBlock(results)}`
        : `Responses (positions could not be extracted):\n${ok.map((r) => `### ${nameOf(r.modelId)}\n${r.text.slice(0, 3000)}`).join("\n\n")}`;
      const draft = this.lastDraft ?? "";
      // A quick factual lookup or an exact check needs a sentence or two, not 350 words: shorter output is also the fastest part to save.
      const quick = classification.kind === "factual" || classification.errorProne === "exact";
      // Free plan, every responding model took the same position, nothing was flagged, and the question is not an exact one (counting, arithmetic, exact facts): the reply the
      // person is already reading is the answer. A separate write-up would only take another 4-9 s (measured) to say the same thing.
      const keep = req.plan === "free" && scored && comparison.positions.length === 1 && ok.length >= 2 && !classification.errorProne
        && !verification.checks.some((c) => c.kind !== "web" && c.outcome !== "held")
        ? ok.find((r) => r.modelId === preferredModelId && r.text.trim().length > 0)
        : undefined;
      this.keptReply = Boolean(keep);
      if (this.noExtraCalls) this.callFailure = "unavailable";
      const synthSystem = `${SYNTH_SYSTEM_PROMPT}${this.research ? `\n${RESEARCH_SYNTH_RULES}` : ""}`;
      const out = keep ? { text: keep.text, by: keep.modelId } : this.prewritten ? this.prewritten : this.noExtraCalls ? null : await this.call(quick ? `${synthSystem}\nThis is a quick lookup: answer in at most 120 words (state the answer first, then at most two supporting points).` : synthSystem, `Question:\n${req.memory ?? ""}${req.prompt}${textOnlyMediaNote(req.media)}\n\n${material}\n\nReviewer findings:\n${findings}\n\nDraft:\n${draft.slice(0, 3000)}`, quick ? 500 : 1200, 1, signal, req, classification, this.synthCapMs);
      let text = out?.text;
      this.writer = out?.by ?? null;
      // Hard (DEEP) questions get one self-critique pass before the answer is shown: completeness, overclaiming, tone.
      this.critique = "skipped";
      if (text && !this.noExtraCalls && classification.complexity === "complex" && (!this.budget || this.budget.remaining() > 12_000)) {
        const body = (text.match(/\n?\s*RESOLUTION:\s*(.+)\s*$/i) ? text.slice(0, text.search(/\n?\s*RESOLUTION:/i)) : text).trim();
        const res = (text.match(/\n?\s*(RESOLUTION:\s*.+)\s*$/i)?.[1] ?? "").trim();
        const crit = await this.call(this.research ? `${CRITIQUE_SYSTEM_PROMPT}\n${RESEARCH_CRITIQUE_RULES}` : CRITIQUE_SYSTEM_PROMPT, `Question:\n${req.prompt}${textOnlyMediaNote(req.media)}\n\nAnswer about to be shown:\n${body}\n\nMaterial:\n${material.slice(0, 3000)}${this.research ? `\n\n${(req.memory ?? "").slice(0, 4000)}` : ""}`, 1200, 0.5, signal, req, classification);
        const fixed = crit?.text ? stripVerdict(crit.text) : undefined;
        if (!fixed) this.critique = "skipped";
        else if (/^OK\.?$/i.test(fixed)) this.critique = "ok";
        else if (fixed.length >= body.length * 0.4 && fixed.length <= body.length * 1.6 + 200 && !/^(?:the answer|this answer|i (?:would|changed|revised))\b/i.test(fixed) && sameAnswer(body, fixed)) {
          this.critique = "revised";
          text = res ? `${fixed}\n${res}` : fixed;
        } else this.critique = "ok";
      }
      if (text) {
        const m = text.match(/\n?\s*RESOLUTION:\s*(.+)\s*$/i);
        resolution = m ? m[1].trim() : "";
        markdown = (m ? text.slice(0, m.index) : text).trim();
      } else {
        // The synthesis was too slow: show the answer of a model that took the leading position (not a list of positions), and say so.
        const lead = (scored ? ok.find((r) => r.stance === comparison.positions[0]?.stance) : undefined) ?? ok[0];
        if (lead) this.notes.push(`The final write-up ${this.callFailure === "slow" ? "was slow" : "was not available"}, so this is the answer from ${nameOf(lead.modelId)}${scored ? ", which took the leading position" : ""}, not a combined one.`);
        markdown = lead?.text.trim() || "No model returned an answer.";
      }
    }

    // Disagreement is only ever shown when the detector found a split (scored, more than one position); never invented by the writer.
    if (!single) markdown = guardDisagreement(markdown, { positions: scored ? comparison.positions.length : 0 });

    // The voice never asserts as fact that Keplar is conscious, sentient, alive, superintelligent or AGI: code replaces any such sentence.
    // polish() drops stock openers/closers ("Certainly!", "I hope this helps") and replaces any claim to be human.
    markdown = polish(guardVoice(markdown));

    const words = markdown.split(/(?<=\s)/);
    for (let i = 0; i < words.length; i += 6) {
      onDelta(words.slice(i, i + 6).join(""));
      await sleep(8, signal);
    }

    const byId = new Map(results.map((r) => [r.modelId, r]));
    const models: ConsultedModel[] = [
      ...plan.panel.map((p): ConsultedModel => {
        const r = byId.get(p.model.id);
        const base = { id: p.model.id, name: p.model.name, provider: p.model.provider, slot: "panel" as const };
        if (!r) return { ...base, status: "failed", note: "No response." };
        if (!r.ok) return { ...base, status: r.reason === "refusal" ? "refused" : "failed", note: r.reason === "timeout" ? `${r.message} Excluded from consensus, not counted as dissent.` : `${r.message} Excluded from consensus.` };
        return { ...base, status: "responded", stance: r.stance === UNCLASSIFIED ? undefined : r.stance, note: p.reason?.startsWith("Stood in") ? p.reason : r.servedBy ? `Served via ${r.servedBy.via}.` : undefined };
      }),
      ...(plan.verifier
        ? [{ ...(verification.reviewer?.role === "verifier" ? { id: verification.reviewer.modelId, name: verification.reviewer.name, provider: catalogById.get(verification.reviewer.modelId)?.provider ?? plan.verifier.model.provider } : { id: plan.verifier.model.id, name: plan.verifier.model.name, provider: plan.verifier.model.provider }), slot: "verifier" as const, status: verification.reviewer?.role === "verifier" ? ("responded" as const) : ("not-needed" as const), note: verification.reviewer?.role === "verifier" ? "Reviewed the draft answer against each response." : "Not called." }]
        : []),
      ...(plan.judge
        ? [{ id: plan.judge.model.id, name: plan.judge.model.name, provider: plan.judge.model.provider, slot: "judge" as const, status: verification.reviewer?.role === "judge" ? ("responded" as const) : ("not-needed" as const), note: verification.reviewer?.role === "judge" ? "Reviewed the draft and weighed the competing positions." : "Held in reserve. The panel agreed, so the judge wasn't called." }]
        : []),
    ];

    // Sources: attachments, then what the models cited themselves. Keplar opened none of them.
    const sources: Source[] = [];
    for (const f of req.attachments ?? []) {
      const read = req.docs?.find((d) => d.name === f.name);
      sources.push({ kind: "attachment", title: f.name, detail: read ? `Text read by the models for this answer${read.truncated ? " (only the first part fit)" : ""}. Not stored after this answer.` : "Attached to this thread. File contents aren't read yet." });
    }
    if (hasMedia(req.media)) {
      const seen = ok.length;
      for (const i of req.media.images.filter((x) => !x.frame)) sources.push({ kind: "attachment", title: i.name, detail: `Image, looked at by ${plural(seen, "vision model", "vision models")}. Not stored after this answer.` });
      for (const v of req.media.videos) sources.push({ kind: "attachment", title: v.name, detail: `Video (${fmtClock(v.durationSec)}), sent as ${v.frames} still frames to ${plural(seen, "vision model", "vision models")}. Not stored after this answer.` });
    }
    const cited = new Map<string, { title?: string; by: Set<string> }>();
    for (const r of ok) for (const c of r.citations ?? []) {
      const e = cited.get(c.url) ?? { title: c.title, by: new Set<string>() };
      e.by.add(nameOf(r.modelId));
      if (!e.title && c.title) e.title = c.title;
      cited.set(c.url, e);
    }
    for (const [url, e] of [...cited].slice(0, 10)) {
      let host = url;
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
      sources.push({ kind: "model", title: e.title || host, url, detail: `Cited by ${[...e.by].join(", ")}. Keplar didn't open or check this page.` });
    }
    if (classification.needsWeb) sources.push({ kind: "note", title: "Web search", detail: "Web retrieval isn't live yet. No pages were fetched for this answer." });
    if (!sources.length) sources.push({ kind: "note", title: "No sources cited", detail: "None of the consulted models cited a source for this answer." });

    const disagreements: Disagreement[] =
      scored && comparison.positions.length > 1
        ? [{
            topic: this.topic || "The models' answers",
            positions: comparison.positions.map((p) => ({ stance: p.stance, models: p.modelIds.map(nameOf), summary: this.summaries[p.stance] || p.summary.slice(0, 300) })),
            resolution: resolution && !/^no disagreement/i.test(resolution) ? resolution : GENERIC_RESOLUTION,
          }]
        : [];

    const issues = verification.checks.filter((c) => c.kind !== "web").length;
    const verificationSummary =
      verification.mode === "not-needed" || single
        ? "No cross-model verification needed for this question."
        : `${verification.reviewer ? `${verification.reviewer.name} (${verification.reviewer.role})` : "The verifier"} reviewed the ${this.draftless ? "responses against each other" : `draft answer against the ${plural(ok.length, "response", "responses")}`}. ${issues ? `${plural(issues, "issue", "issues")} found, each resolved below.` : verification.notes.length ? "" : "No reasoning gaps, contradictions or unsupported claims found."}`.trim();

    return {
      markdown,
      consensus: {
        level: comparison.level,
        score: comparison.score,
        agree: comparison.agree,
        disagree: comparison.disagree,
        missing: comparison.missing,
        responded: ok.length,
        consulted: plan.panel.length,
        summary: consensusSummary(comparison.level, comparison.agree, comparison.disagree, comparison.missing),
      },
      models,
      sources,
      disagreements,
      verification: {
        mode: verification.mode === "not-needed" || single ? ("not-needed" as const) : ("cross-model" as const),
        summary: verificationSummary,
        reviewer: verification.reviewer ? `${verification.reviewer.name} (${verification.reviewer.role})` : undefined,
        checks: verification.checks,
        notes: verification.mode === "not-needed" ? [] : [...verification.notes, ...this.notes],
      },
      reasoning: this.reasoningSummary({ req, classification, plan, ok, comparison, scored, single, verification, issues }),
    };
  }

  /** What the last self-critique pass did (DEEP questions only). */
  critique: "skipped" | "ok" | "revised" = "skipped";

  /** A short, real account of how this answer came about (shown under "Reasoning summary"). Plain sentences; no ids, no internals. */
  private reasoningSummary(i: { req: Parameters<Synthesizer["synthesize"]>[0]["req"]; classification: Parameters<Synthesizer["synthesize"]>[0]["classification"]; plan: Parameters<Synthesizer["synthesize"]>[0]["plan"]; ok: Ok[]; comparison: Comparison; scored: boolean; single: boolean; verification: Parameters<Synthesizer["synthesize"]>[0]["verification"]; issues: number }): string {
    const parts: string[] = [];
    const read = i.req.understanding?.interpretation?.replace(/\s*Tell me if you meant something else\.?$/i, "").trim();
    if (read) {
      const line = read.replace(/^Going by what we were just talking about, /, "Going by the conversation, ").replace(/^I'm reading/, "I read");
      parts.push(/[.?!]$/.test(line) ? line : `${line}.`);
    }
    if (i.single) {
      parts.push(`${i.ok[0] ? nameOf(i.ok[0].modelId) : "One model"} answered on its own, because the question was short and well defined.`);
      return parts.join(" ");
    }
    const names = i.ok.map((r) => nameOf(r.modelId));
    parts.push(`I asked ${plural(i.plan.panel.length, "model", "models")}${names.length ? ` (${names.join(", ")})` : ""}${i.ok.length < i.plan.panel.length ? ` and ${i.ok.length} answered` : ""}.`);
    parts.push(i.scored ? (i.comparison.positions.length > 1 ? `They took ${i.comparison.positions.length} different positions, so I weighed the evidence behind each rather than counting votes.` : "They took the same position.") : "I couldn't score how far they agreed.");
    if (i.verification.mode !== "not-needed" && i.verification.reviewer) parts.push(`${i.verification.reviewer.name} checked a draft against their answers and ${i.issues ? `${plural(i.issues, "issue", "issues")} were resolved` : "found no issues"}.`);
    parts.push(this.writer ? `${nameOf(this.writer)} wrote the final answer${this.critique === "revised" ? ", and a last self-review tightened it" : this.critique === "ok" ? ", and a last self-review found nothing to change" : ""}.` : "The writing step ran out of time, so the positions are listed without a written answer.");
    return parts.join(" ");
  }

  /** The draft handed to the reviewer, reused as input to the final synthesis. */
  lastDraft: string | null = null;
}
