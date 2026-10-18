/**
 * Verification: a verifier (or, when the panel disagreed, the judge) reviews the
 * DRAFT synthesis together with the individual responses and returns a short
 * list of checks:
 *   - reasoning that doesn't hold
 *   - internal contradictions (within a response, or draft vs. responses)
 *   - claims some models made that the others didn't support
 * and how the synthesis resolved each one.
 *
 * The verifier never fetches external sources. Web checks come only from the
 * optional Retriever (retriever.ts), which is off by default.
 */
import { catalogById } from "./catalog";
import { textOnlyMediaNote } from "./media";
import { spentUsd } from "./pricing";
import type { createRegistry } from "./providers";
import { quizAsk } from "@/lib/quiz/ask";
import { QUIZ_VERIFY_ADDON } from "@/lib/quiz/prompt";
import { parseQuizVerdicts } from "@/lib/quiz/build";
import type { Claim, ProviderResult, RoutedModel, Verification, VerificationCheck, Verifier } from "./types";

export type VerifyInput = Parameters<Verifier["verify"]>[0];

export const nameOf = (id: string) => catalogById.get(id)?.name ?? id;

export function uniqueClaims(results: ProviderResult[]): Claim[] {
  const out: Claim[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r.ok) continue;
    for (const c of r.claims) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/** Judge when the panel disagreed and one was planned; otherwise the verifier. */
export function reviewerFor(input: VerifyInput): { rm: RoutedModel; role: "verifier" | "judge" } | null {
  const { plan, comparison } = input;
  if (comparison.disagree > 0 && plan.judge) return { rm: plan.judge, role: "judge" };
  if (plan.verifier) return { rm: plan.verifier, role: "verifier" };
  return null;
}

export function notNeeded(): Verification {
  return { mode: "not-needed", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] };
}

/* ─────────────────────────────── live ─────────────────────────────── */

export const VERIFIER_SYSTEM_PROMPT = `You are Keplar's verifier. You receive a user question, several independent model responses, and a DRAFT synthesis.
Review the draft against the responses. Do not use or cite external sources; judge only the evidence and reasoning in the responses.
Return ONLY JSON: {"checks":[{"kind":"reasoning"|"contradiction"|"unsupported","finding":string,"models":string[],"outcome":"held"|"revised"|"removed"|"kept-as-dissent","resolution":string}],"disputed":string[]}
- reasoning: a step of reasoning that doesn't hold.
- contradiction: two statements that can't both be true (within a response, or draft vs. responses).
- unsupported: a claim some models made that the others didn't support.
- resolution: how the final answer should handle it, in one sentence.
- disputed: claims still unresolved after review (max 3), verbatim.
At most 5 checks. One sentence per field. If nothing needs flagging, return {"checks":[],"disputed":[]}.`;

const KINDS = new Set(["reasoning", "contradiction", "unsupported"]);
const OUTCOMES = new Set(["held", "revised", "removed", "kept-as-dissent"]);

/** Lenient parse of the reviewer's JSON; anything malformed is dropped, never guessed. */
export function parseChecks(text: string): { checks: VerificationCheck[]; disputed: string[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[0]) as { checks?: unknown[]; disputed?: unknown[] };
    const checks = (raw.checks ?? [])
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .filter((c) => KINDS.has(String(c.kind)) && OUTCOMES.has(String(c.outcome)) && typeof c.finding === "string")
      .slice(0, 5)
      .map((c) => ({
        kind: c.kind as VerificationCheck["kind"],
        finding: String(c.finding).slice(0, 400),
        models: Array.isArray(c.models) ? c.models.map(String).slice(0, 6) : [],
        outcome: c.outcome as VerificationCheck["outcome"],
        resolution: typeof c.resolution === "string" ? c.resolution.slice(0, 400) : "",
      }));
    const disputed = (raw.disputed ?? []).map(String).filter(Boolean).slice(0, 3);
    return { checks, disputed };
  } catch {
    return null;
  }
}

/**
 * Live verifier: one call to the plan's verifier (or judge) through the
 * provider registry, so it gets the same gateway defaults, retries and
 * fallback as panel calls. No web plugin is attached here.
 */
export class ModelVerifier implements Verifier {
  constructor(private readonly registry: ReturnType<typeof createRegistry>) {}

  async verify(input: VerifyInput): Promise<Verification> {
    const { req, results, plan, classification, draft, signal } = input;
    const reviewer = reviewerFor(input);
    if (plan.mode === "single" || !reviewer) return notNeeded();

    const responses = results
      .filter((r): r is Extract<ProviderResult, { ok: true }> => r.ok)
      .map((r) => `### ${nameOf(r.modelId)}\n${r.text.slice(0, 6000)}`)
      .join("\n\n");
    const quiz = quizAsk(req.prompt);
    const prompt = `Question:\n${req.memory ?? ""}${req.prompt}${textOnlyMediaNote(req.media)}\n\nResponses:\n${responses}\n\n${draft.trim() ? `Draft synthesis:\n${draft.slice(0, 6000)}` : "No draft yet: review the responses against each other (reasoning that doesn't hold, contradictions, claims only some models support)."}`;

    const r = await this.registry.generate({
      model: reviewer.rm.model,
      prompt,
      classification,
      params: { reasoningEffort: reviewer.role === "judge" ? "medium" : "low", maxOutputTokens: quiz ? 1600 : 1200 },
      tier: req.routing?.tier,
      slot: reviewer.role,
      system: quiz ? `${VERIFIER_SYSTEM_PROMPT}\n${QUIZ_VERIFY_ADDON}` : VERIFIER_SYSTEM_PROMPT,
      signal,
    });

    const parsed = r.ok ? parseChecks(r.text) : null;
    const quizVerdicts = r.ok && quiz ? parseQuizVerdicts(r.text) : [];
    // A substitute may have reviewed (Free plan fallback when the planned reviewer was busy): name the one that did.
    const by = r.ok ? r.model : reviewer.rm.model;
    const base = { mode: "cross-model" as const, reviewer: { modelId: by.id, name: by.name, role: reviewer.role } };
    if (!parsed) {
      // A failed or unparseable review is reported as such, never as "all clear".
      return {
        ...base,
        checks: [],
        disputed: [],
        checked: 0,
        supported: 0,
        removed: [],
        notes: [r.ok ? "The reviewer's output couldn't be read, so no checks are shown for this answer." : "The reviewer didn't respond, so this answer wasn't cross-checked."],
        costUsd: r.ok ? r.actualCostUsd : 0,
        ...(quizVerdicts.length ? { quizVerdicts } : {}),
      };
    }
    const removedCount = parsed.checks.filter((c) => c.outcome === "removed").length;
    return {
      ...base,
      checks: parsed.checks,
      disputed: parsed.disputed.map((text, i) => ({ id: `disputed-${i}`, text })),
      checked: parsed.checks.length,
      supported: parsed.checks.length - removedCount,
      removed: [],
      notes: [],
      costUsd: r.ok ? spentUsd(by, r) : undefined,
      ...(quizVerdicts.length ? { quizVerdicts } : {}),
    };
  }
}
