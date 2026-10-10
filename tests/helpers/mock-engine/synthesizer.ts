import { catalogById } from "@/lib/orchestration/catalog";
import { sleep } from "@/lib/orchestration/sleep";
import { consensusSummary } from "@/lib/orchestration/synthesizer";
import { pickScript, simpleAnswer, type AnswerContext } from "./scenarios";
import { UNCLASSIFIED } from "@/lib/orchestration/comparator";
import type { ConsultedModel, Disagreement, Source, Synthesizer } from "@/lib/orchestration/types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Demo synthesizer. A real one prompts the judge-tier model with the verified
 * claims, the positions and the disagreement resolution, and streams its
 * answer. Here the scripted markdown is streamed in small chunks.
 */
export class MockSynthesizer implements Synthesizer {
  /**
   * Draft for the verifier: the leading position and any dissent, or the lead
   * live response. A real synthesizer writes a full draft with the judge-tier model.
   */
  async draft({ req, results, comparison }: Parameters<NonNullable<Synthesizer["draft"]>>[0]) {
    const script = pickScript(req.prompt);
    const live = results.find((r) => r.ok && r.stance === UNCLASSIFIED);
    if (live && live.ok) return live.text;
    return comparison.positions
      .map((p, i) => `${i === 0 ? "Leading position" : "Dissent"}: ${script.positions[p.stance]?.summary ?? p.summary}`)
      .join("\n");
  }

  async synthesize({ req, classification, plan, results, comparison, verification, onDelta, signal }: Parameters<Synthesizer["synthesize"]>[0]) {
    const script = pickScript(req.prompt);
    const failed = results.filter((r) => !r.ok).length;
    const labelOf = (stance: string) => script.positions[stance]?.label ?? stance;
    const ctx: AnswerContext = {
      level: comparison.level,
      majority: comparison.majorityStance,
      positions: comparison.positions.map((p) => ({ stance: p.stance, label: labelOf(p.stance), summary: script.positions[p.stance]?.summary ?? p.summary, count: p.modelIds.length })),
      req,
      modelCount: plan.panel.length,
      failed,
    };

    const live = results.some((r) => r.ok && r.stance === UNCLASSIFIED);
    const liveLead = live ? results.find((r): r is Extract<typeof r, { ok: true }> => r.ok) : undefined;
    // Live answers without a synthesis model: show one real response verbatim
    // rather than scripted text. (TODO: LLM synthesizer on the judge tier.)
    const markdown = liveLead
      ? liveLead.text
      : (plan.mode === "single" && simpleAnswer(req.prompt)) || script.answer(ctx);

    // Stream in word-ish chunks so the UI renders progressively.
    const words = markdown.split(/(?<=\s)/);
    for (let i = 0; i < words.length; i += 4) {
      onDelta(words.slice(i, i + 4).join(""));
      await sleep(16, signal);
    }

    const resultsById = new Map(results.map((r) => [r.modelId, r]));
    const models: ConsultedModel[] = [
      ...plan.panel.map((p): ConsultedModel => {
        const r = resultsById.get(p.model.id);
        if (!r) return { id: p.model.id, name: p.model.name, provider: p.model.provider, slot: "panel", status: "failed", note: "No response." };
        if (!r.ok) {
          return {
            id: p.model.id, name: p.model.name, provider: p.model.provider, slot: "panel",
            status: r.reason === "refusal" ? "refused" : "failed",
            note: r.reason === "timeout" ? "Timed out. Excluded from consensus, not counted as dissent." : `${r.message} Excluded from consensus.`,
          };
        }
        return { id: p.model.id, name: p.model.name, provider: p.model.provider, slot: "panel", status: "responded", stance: labelOf(r.stance), note: p.covers ? `Covered ${p.covers.toLowerCase()}.` : undefined };
      }),
      ...(plan.verifier
        ? [{
            id: plan.verifier.model.id, name: plan.verifier.model.name, provider: plan.verifier.model.provider, slot: "verifier" as const,
            status: verification.reviewer?.role === "verifier" ? ("responded" as const) : ("not-needed" as const),
            note: verification.reviewer?.role === "verifier" ? "Reviewed the draft answer against each response." : "Not called. The judge reviewed this answer because the panel disagreed.",
          }]
        : []),
      ...(plan.judge
        ? [{
            id: plan.judge.model.id, name: plan.judge.model.name, provider: plan.judge.model.provider, slot: "judge" as const,
            status: verification.reviewer?.role === "judge" ? ("responded" as const) : ("not-needed" as const),
            note: verification.reviewer?.role === "judge" ? "Reviewed the draft against each response and weighed the competing positions." : "Held in reserve. The panel agreed, so the judge wasn't called.",
          }]
        : []),
    ];

    const sources: Source[] = [];
    for (const f of req.attachments ?? []) {
      sources.push({ kind: "attachment", title: f.name, detail: "Attached to this thread. The demo records attachments but doesn't read their contents." });
    }
    // Demo mode: media is routed to vision models from the catalog, but the scripted answer doesn't look at it.
    for (const i of req.media?.images.filter((x) => !x.frame) ?? []) sources.push({ kind: "attachment", title: i.name, detail: "Image attached. Demo output: the scripted answer doesn't look at it." });
    for (const v of req.media?.videos ?? []) sources.push({ kind: "attachment", title: v.name, detail: `Video attached (${v.frames} frames). Demo output: the scripted answer doesn't look at it.` });
    if (classification.needsWeb) {
      sources.push({ kind: "note", title: "Web search", detail: "Web retrieval isn't live yet. No pages were fetched for this answer." });
    }
    if (!sources.length) {
      sources.push({ kind: "note", title: "No sources cited", detail: "None of the consulted models cited a source for this answer. When they do, those citations are listed here, labeled as cited by models." });
    }

    const disagreements: Disagreement[] =
      comparison.positions.length > 1
        ? [{
            topic: script.topic,
            positions: comparison.positions.map((p) => ({
              stance: labelOf(p.stance),
              models: p.modelIds.map((id) => catalogById.get(id)?.name ?? id),
              summary: script.positions[p.stance]?.summary ?? p.summary,
            })),
            resolution: script.resolution(ctx),
          }]
        : [];

    const responded = results.filter((r) => r.ok).length;
    const issues = verification.checks.filter((c) => c.kind !== "web").length;
    const verificationSummary =
      verification.mode === "not-needed" || plan.mode === "single"
        ? "No cross-model verification needed for this question."
        : `${verification.reviewer ? `${verification.reviewer.name} (${verification.reviewer.role})` : "The verifier"} reviewed the draft answer against the ${plural(responded, "response", "responses")}. ${
            issues ? `${plural(issues, "issue", "issues")} found, each resolved below.` : verification.notes.length && !verification.checks.length && !verification.checked ? "" : "No reasoning gaps, contradictions or unsupported claims found."
          }`.trim();

    return {
      demo: true,
      markdown,
      consensus: {
        level: comparison.level,
        score: comparison.score,
        agree: comparison.agree,
        disagree: comparison.disagree,
        missing: comparison.missing,
        responded: results.filter((r) => r.ok).length,
        consulted: plan.panel.length,
        summary: consensusSummary(comparison.level, comparison.agree, comparison.disagree, comparison.missing),
      },
      models,
      sources,
      disagreements,
      verification: {
        mode: verification.mode === "not-needed" || plan.mode === "single" ? ("not-needed" as const) : ("cross-model" as const),
        summary: verificationSummary,
        reviewer: verification.reviewer ? `${verification.reviewer.name} (${verification.reviewer.role})` : undefined,
        checks: verification.checks,
        notes: verification.mode === "not-needed" ? [] : [...verification.notes, ...(verification.judgement ? ["The judge favoured the position with the stronger evidence and reasoning, not the larger group."] : [])],
      },
      reasoning: liveLead
        ? `Live responses received from ${results.filter((r) => r.ok).length} of ${plan.panel.length} models. Showing ${catalogById.get(liveLead.modelId)?.name ?? liveLead.modelId}'s response; claim-level comparison is not enabled yet.`
        : plan.mode === "single" ? `${classification.rationale} Answered directly.` : script.reasoning(ctx),
    };
  }
}
