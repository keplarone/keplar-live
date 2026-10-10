/**
 * Fix generation: turn a failure cluster into a candidate change. Prompt-strategy, retrieval-hint and tool-setting changes
 * become variants that go through guard → offline eval against the champion → canary → promote/rollback. Anything that
 * needs new code becomes a proposal (a diff sketch plus the evidence) in the admin review queue and is never applied.
 */
import { id as newId, now } from "@/lib/create/platform/ids";
import { checkVariant } from "./guard";
import type { GapCluster, ProposalRow, VariantParams, VariantRow, VariantTarget } from "./types";

export type Draft = { target: VariantTarget; label: string; text: string; params: VariantParams };
/** Optional model-written strategy (free models in the scheduled job). Must return plain text or null. */
export type Writer = (prompt: string) => Promise<string | null>;

const DOMAIN_HINTS: Record<string, string[]> = {
  law: ["official statute text", "court ruling"],
  health: ["clinical guideline", "systematic review"],
  finance: ["official filing", "regulator guidance"],
  code: ["official documentation", "release notes"],
  science: ["peer reviewed", "review article"],
  tax: ["official tax authority", "current year rules"],
};

const domainOf = (c: GapCluster) => c.tags.find((t) => t.startsWith("domain:"))?.slice(7);

/** Deterministic fixes, used when no model is available (and as the safe default). */
export function templateDraft(c: GapCluster): Draft | null {
  const d = domainOf(c);
  if (c.need === "retrieval") {
    const hints = (d && DOMAIN_HINTS[d]) || (c.tags.includes("long-context") ? null : ["primary source", "official"]);
    if (!hints) return { target: "step", label: `Quote the passage (${c.label})`, text: "When the answer depends on attached material or earlier messages, find the exact passage first and quote the key line before using it. Say plainly when the material does not contain the answer.", params: {} };
    return { target: "retrieval", label: `Search hints: ${hints.join(", ")}`, text: "", params: { searchHints: hints.slice(0, 3) } };
  }
  if (c.need === "tool") {
    if (c.tags.includes("tool:execution-failed")) return { target: "tools", label: "Longer check time", text: "", params: { sandboxMs: 3500, eagerMath: true } };
    return { target: "step", label: `Compute, don't estimate (${c.label})`, text: "For every number the answer depends on, write a short JavaScript check in a ```js block that prints the result, and use the printed value. Keep units explicit.".replace("```js", "js"), params: { eagerMath: true } };
  }
  if (c.need === "prompt") {
    if (c.tags.includes("stopped:budget") || c.tags.includes("stopped:time")) return { target: "planner", label: `Fewer, larger steps (${c.label})`, text: "Prefer two to four substantial steps over many small ones. Merge steps that use the same information.", params: {} };
    return { target: "critic", label: `Check the question was answered (${c.label})`, text: "First check that the answer addresses exactly what was asked, including every part of a multi-part question, before judging anything else.", params: {} };
  }
  return null;
}

const WRITER_PROMPT = (c: GapCluster, target: VariantTarget) =>
  `Keplar is an assistant that answers by planning, solving and checking steps with several AI models. Answers in this group often go wrong:\n` +
  `Group: ${c.label}\nBad outcome rate: ${Math.round(c.badRate * 100)}% of ${c.turns} turns\n${c.examples.length ? `Topic words: ${c.examples.join("; ")}\n` : ""}` +
  `Write ONE short instruction (max 300 characters, plain sentences, no lists, no links) to add to Keplar's ${target === "critic" ? "reviewer" : target === "planner" ? "planner" : "step solver"} prompt that would most likely fix this. Reply with the instruction only.`;

export async function draftFor(c: GapCluster, write?: Writer): Promise<Draft | null> {
  const base = templateDraft(c);
  if (!base || c.need !== "prompt" || !write || base.target === "retrieval" || base.target === "tools") return base;
  try {
    const t = (await write(WRITER_PROMPT(c, base.target)))?.trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ") ?? "";
    if (t.length >= 20 && t.length <= 400) {
      const d: Draft = { ...base, label: `Learned: ${c.label}`.slice(0, 80), text: t };
      if (checkVariant(d).ok) return d;
    }
  } catch { /* fall back to the template */ }
  return base;
}

export function toCandidate(d: Draft, c: GapCluster): VariantRow {
  return { id: newId("var"), workspaceId: "system", target: d.target, label: d.label.slice(0, 80), text: d.text, params: d.params, status: "candidate", origin: "auto", cluster: c.key, createdAt: now(), stats: { turns: 0, good: 0, bad: 0 } };
}

/** A capability that needs new code: a reviewable sketch and the evidence. Never applied by the pipeline. */
export function proposalFor(c: GapCluster): Omit<ProposalRow, "id" | "workspaceId" | "at" | "status"> {
  if (c.tags.includes("tool:search-unavailable")) {
    return {
      title: "Web search unavailable for questions that need it",
      gap: c.label,
      diff: [
        "--- a/src/lib/core/tools.ts",
        "+++ b/src/lib/core/tools.ts",
        "@@ webSearch @@",
        "-  if (!retriever?.research) return null;",
        "+  // Fall back to the configured search provider when the research retriever is not available on this plan.",
        "+  if (!retriever?.research) return fallbackSearch(query, { signal }); // new: src/lib/research/fallback-search.ts",
      ].join("\n"),
      evidence: `${c.turns} turns in this group, ${Math.round(c.badRate * 100)}% with a bad outcome. Search was unavailable when the plan called for it. Requires a search provider key and a cost decision.`,
    };
  }
  return {
    title: `New capability needed: ${c.label}`,
    gap: c.label,
    diff: `# No automatic prompt or setting change fits this gap.\n# Suggested: add a specialist tool for "${c.label}" in src/lib/core/tools.ts and route the matching step kind to it in engine.ts (execStep).`,
    evidence: `${c.turns} turns, ${Math.round(c.badRate * 100)}% bad outcomes. Tags: ${c.tags.join(", ")}.`,
  };
}
