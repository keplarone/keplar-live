/**
 * Client state for a live research run: the plan, each step's progress and the pages read so far. Pure, so it is unit-tested.
 * Server Deep Research and Live Research (the Keplar One desktop app, via "desktop") share it; the desktop's run also brings its own
 * plain-language progress line (`label`) and depth.
 */
import type { LiveDepth, ResearchEvent, ResearchSource, ResearchStepId } from "@/lib/orchestration/types";

export type ResearchStepState = { status: "pending" | "active" | "done" | "skipped"; detail?: string };
export type LiveResearch = {
  queries: string[];
  steps: Record<ResearchStepId, ResearchStepState>;
  sources: ResearchSource[];
  /** No web research ran, and why (the report was researched by the models only). */
  off?: string;
  /** Live Research: the pages are being read by the Keplar One desktop app on this computer. */
  via?: "desktop";
  /** The desktop's own progress line, shown as-is ("Reading sources (3 of 9)…"). */
  label?: string;
  depth?: LiveDepth;
  /** General web search is set up on the desktop (false: reference, scholarly and news indexes only). */
  webSearch?: boolean;
  /** Pages the desktop has read so far (its count; sources appear as they are fetched). */
  read?: number;
};

export const RESEARCH_STEPS: { id: ResearchStepId; label: string }[] = [
  { id: "plan", label: "Plan the questions" },
  { id: "search", label: "Search the web" },
  { id: "read", label: "Read sources" },
  { id: "check", label: "Cross-check claims" },
  { id: "write", label: "Write the report" },
];

/** The same steps as Live Research runs them: the desktop searches and reads, Keplar's models write, the desktop checks the citations. */
export const LIVE_RESEARCH_STEPS: { id: ResearchStepId; label: string }[] = [
  { id: "plan", label: "Plan the searches" },
  { id: "search", label: "Search the web" },
  { id: "read", label: "Read sources" },
  { id: "write", label: "Write the answer" },
  { id: "check", label: "Check citations" },
];

const empty = (): LiveResearch => ({ queries: [], steps: { plan: { status: "pending" }, search: { status: "pending" }, read: { status: "pending" }, check: { status: "pending" }, write: { status: "pending" } }, sources: [] });

export function applyResearch(r: LiveResearch | undefined, e: ResearchEvent): LiveResearch {
  const s = r ?? empty();
  switch (e.phase) {
    case "reset":
      return empty();
    case "plan":
      return { ...s, queries: e.queries };
    case "step":
      return { ...s, steps: { ...s.steps, [e.step]: { status: e.status, detail: e.detail ?? s.steps[e.step]?.detail } } };
    case "source":
      return s.sources.some((x) => x.n === e.source.n) ? s : { ...s, sources: [...s.sources, e.source] };
    case "live":
      return { ...s, via: "desktop", label: e.label, ...(e.depth ? { depth: e.depth } : {}), ...(e.webSearch !== undefined ? { webSearch: e.webSearch } : {}), ...(e.read !== undefined ? { read: e.read } : {}), ...(e.sources ? { sources: e.sources } : {}) };
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
