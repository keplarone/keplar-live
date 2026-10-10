/** Client state for a live Deep Research run: the plan, each step's progress and the pages read so far. Pure, so it is unit-tested. */
import type { ResearchEvent, ResearchSource, ResearchStepId } from "@/lib/orchestration/types";

export type ResearchStepState = { status: "pending" | "active" | "done" | "skipped"; detail?: string };
export type LiveResearch = {
  queries: string[];
  steps: Record<ResearchStepId, ResearchStepState>;
  sources: ResearchSource[];
  /** No web research ran, and why (the report was researched by the models only). */
  off?: string;
};

export const RESEARCH_STEPS: { id: ResearchStepId; label: string }[] = [
  { id: "plan", label: "Plan the questions" },
  { id: "search", label: "Search the web" },
  { id: "read", label: "Read sources" },
  { id: "check", label: "Cross-check claims" },
  { id: "write", label: "Write the report" },
];

const empty = (): LiveResearch => ({ queries: [], steps: { plan: { status: "pending" }, search: { status: "pending" }, read: { status: "pending" }, check: { status: "pending" }, write: { status: "pending" } }, sources: [] });

export function applyResearch(r: LiveResearch | undefined, e: ResearchEvent): LiveResearch {
  const s = r ?? empty();
  switch (e.phase) {
    case "plan":
      return { ...s, queries: e.queries };
    case "step":
      return { ...s, steps: { ...s.steps, [e.step]: { status: e.status, detail: e.detail ?? s.steps[e.step]?.detail } } };
    case "source":
      return s.sources.some((x) => x.n === e.source.n) ? s : { ...s, sources: [...s.sources, e.source] };
    case "off":
      return {
        ...s,
        off: e.reason,
        steps: {
          ...s.steps,
          plan: s.steps.plan.status === "pending" ? { status: "skipped" } : s.steps.plan,
          search: s.steps.search.status === "pending" || s.steps.search.status === "active" ? { status: "skipped" } : s.steps.search,
          read: s.steps.read.status === "pending" || s.steps.read.status === "active" ? { status: "skipped" } : s.steps.read,
        },
      };
  }
}
