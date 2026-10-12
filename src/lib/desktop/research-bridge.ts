/**
 * Live Research, the bridge the Keplar One desktop app exposes on keplar.one app pages (keplar-desktop: src/preload/preload.ts and
 * src/main/research; desktop app 0.2.0+, bridge version 1). On the person's computer the desktop searches the web, reads pages safely,
 * keeps each page's provenance, and checks an answer's citations against the pages it actually read. Keplar's own models (through
 * /api/keplar) write the answer. In a normal browser there is no bridge, and research questions run exactly as before.
 *
 * Every call resolves { ok: true, result } or { ok: false, error, code }, and `error` is written to be shown as-is. A rejected IPC call
 * (an older or broken build) is turned into { ok: false, code: "unavailable" } by `safe`, so callers never have to catch.
 * Types are hand-copied from keplar-desktop src/main/research/{types,engine,service}.ts and kept to what the page uses.
 */
export const RESEARCH_API_VERSION = 1;
/** The first desktop release with Live Research (copy only: the page detects the bridge, never a version number). */
export const MIN_RESEARCH_DESKTOP = "0.2.0";

export type ResearchDepth = "fast" | "standard" | "deep";
export type ResearchCode = "invalid" | "busy" | "disabled" | "not-found" | "forbidden" | "internal" | "unavailable";
export type ResearchResult<T> = { ok: true; result: T } | { ok: false; error: string; code: ResearchCode };

export type ResearchSignal = { kind: "strength" | "caution" | "info"; text: string };
export type ResearchCapabilities = {
  version: number;
  enabled: boolean;
  /** General web search is set up (a Brave Search or Tavily key). Without it the desktop still searches Wikipedia, Crossref and GDELT. */
  webSearch: boolean;
  providers: { id: string; label: string; kind: string; keyed: boolean; configured: boolean }[];
  depths: Record<ResearchDepth, { maxQueries: number; maxSources: number; seconds: number }>;
  /** What to do to turn general web search on, when it is off. */
  setup?: string;
};
export type ResearchDepthDecision = { recommended: ResearchDepth; selected: ResearchDepth; overridden: boolean; timeSensitive: boolean; reasons: string[]; modelSteps: string[] };
export type ResearchStage = "planning" | "searching" | "reading" | "following" | "checking" | "ready" | "failed" | "cancelled";
export type ResearchProgress = { runId: string; stage: ResearchStage; label: string; searched: number; found: number; read: number; failed: number };
export type ResearchRunSource = {
  n: number;
  id: string;
  url: string;
  title: string;
  publisher: string;
  author?: string;
  publishedAt?: string;
  modifiedAt?: string;
  retrievedAt: string;
  fromCache: boolean;
  fromEarlierTurn?: boolean;
  kind: string;
  signals: ResearchSignal[];
  group: string;
  description?: string;
  foundBy: { provider: string; query: string; rank: number };
};
export type ResearchFailedSource = { url: string; status: string; reason: string };
export type ResearchRun = {
  id: string;
  question: string;
  stage: ResearchStage;
  label: string;
  depth: ResearchDepthDecision;
  queries: string[];
  startedAt: string;
  finishedAt?: string;
  sources: ResearchRunSource[];
  failed: ResearchFailedSource[];
  notes: string[];
  independentGroups: number;
  error?: string;
};
export type ResearchEvidence = { n: number; sourceId: string; passageId: string; quote: string };
export type ResearchClaim = {
  text: string;
  citations: number[];
  status: "supported" | "partially-supported" | "conflicting" | "not-verified";
  strength: string;
  support: ResearchEvidence[];
  conflicts: ResearchEvidence[];
  independentSupport: number;
  derivativeRepeats: boolean;
  basis: "lexical";
  note?: string;
};
export type ResearchCitation = { n: number; url: string; title: string; publisher: string; publishedAt?: string; retrievedAt: string; fromEarlierTurn?: boolean; kind: string; signals: ResearchSignal[]; evidence: ResearchEvidence[] };
export type ResearchValidation = {
  answer: string;
  citations: ResearchCitation[];
  claims: ResearchClaim[];
  issues: { kind: string; text: string; detail: string }[];
  summary: { claims: number; supported: number; partiallySupported: number; conflicting: number; notVerified: number; removedCitations: number; removedLinks: number; uncitedFacts: number };
};
export type ResearchPreview = { n: number; title: string; publisher: string; url: string; publishedAt?: string; retrievedAt: string; fromEarlierTurn?: boolean; kind: string; signals: ResearchSignal[]; excerpt: string; excerptIsEvidence: boolean };
export type ResearchStartRequest = { question: string; depth?: ResearchDepth; queries?: string[]; previousRunIds?: string[]; fresh?: boolean };

export type ResearchBridge = {
  version: number;
  capabilities(): Promise<ResearchResult<ResearchCapabilities>>;
  classify(question: string, depth?: ResearchDepth): Promise<ResearchResult<ResearchDepthDecision>>;
  start(request: ResearchStartRequest): Promise<ResearchResult<ResearchRun>>;
  wait(runId: string): Promise<ResearchResult<ResearchRun>>;
  get(runId: string): Promise<ResearchResult<ResearchRun>>;
  cancel(runId: string): Promise<ResearchResult<ResearchRun>>;
  refresh(runId: string): Promise<ResearchResult<ResearchRun>>;
  brief(runId: string): Promise<ResearchResult<{ brief: string; chars: number; sourcesIncluded: number; passagesIncluded: number; run: ResearchRun }>>;
  validate(runId: string, answer: string): Promise<ResearchResult<ResearchValidation>>;
  preview(runId: string, n: number, statement?: string): Promise<ResearchResult<ResearchPreview>>;
  open(runId: string, url: string): Promise<ResearchResult<boolean>>;
  copy(runId: string, answer: string): Promise<ResearchResult<{ chars: number }>>;
  export(runId: string, answer: string, format?: "markdown" | "html"): Promise<ResearchResult<{ saved: boolean; name?: string }>>;
  onProgress(listener: (progress: ResearchProgress) => void): () => void;
};

/** The Live Research bridge when running inside the Keplar One desktop app (0.2.0+) on a keplar.one app page, else null. */
export function researchBridge(): ResearchBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { keplarResearch?: ResearchBridge }).keplarResearch;
  return b && (b.version ?? 0) >= RESEARCH_API_VERSION && typeof b.start === "function" && typeof b.brief === "function" && typeof b.validate === "function" && typeof b.onProgress === "function" ? b : null;
}

/** For useSyncExternalStore: the bridge never appears or goes away while a page is open, and the server render never has it. */
export const noSubscribe = () => () => {};
export const hasResearchBridge = () => Boolean(researchBridge());

/** Runs one bridge call; a rejected or malformed reply becomes an `unavailable` result instead of an exception. */
export async function safe<T>(call: () => Promise<ResearchResult<T>>): Promise<ResearchResult<T>> {
  try {
    const r = await call();
    if (r && typeof r === "object" && "ok" in r) return r;
  } catch {
    /* an older or broken desktop build */
  }
  return { ok: false, error: "The Keplar desktop app didn't answer. Restart it and try again.", code: "unavailable" };
}

/** The desktop's capabilities, or null when Live Research can't run here (no bridge, turned off, or an incompatible version). */
export async function researchCapabilities(bridge: ResearchBridge | null = researchBridge()): Promise<ResearchCapabilities | null> {
  if (!bridge) return null;
  const r = await safe(() => bridge.capabilities());
  return r.ok && r.result.enabled && r.result.version >= RESEARCH_API_VERSION ? r.result : null;
}
