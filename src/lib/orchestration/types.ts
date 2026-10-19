/**
 * Keplar-One orchestration contracts.
 *
 * The pipeline is: classify → route → run providers in parallel → compare →
 * (judge on disagreement) → verify → synthesize. Every step is an interface so
 * a real implementation can replace the demo one without touching the UI or
 * the route handler. Nothing in this file knows about React or HTTP.
 */

import type { ImageInput, MediaInput } from "./media";
import type { RichAnswer } from "@/lib/rich-answer/types";
import type { Quiz, QuizVerdict } from "@/lib/quiz/types";

/* ───────────────────────────── catalog ───────────────────────────── */

export type ModelRole = "judge" | "primary" | "fast-cheap" | "specialist" | "verifier";

/** A price window. `from` is inclusive (ISO date); null means "since listing". */
export type PriceWindow = {
  from: string | null;
  until?: string | null;
  inputPer1M: number;
  outputPer1M: number;
  note?: string;
};

/** Surcharge applied when the prompt exceeds a threshold. */
export type LongContextTier = {
  aboveTokens: number;
  inputPer1M: number;
  outputPer1M: number;
};

/**
 * Provider API behaviour that the orchestrator must respect. These come from
 * the model research (see catalog.ts for sources). Flags are conservative:
 * absence means "not known to be restricted", not "guaranteed supported".
 */
export type ModelCapabilities = {
  /** Custom temperature returns an error. Strip it before calling. */
  rejectsTemperature?: boolean;
  /** Custom top_p returns an error. */
  rejectsTopP?: boolean;
  /** Requesting logprobs returns an error. */
  rejectsLogprobs?: boolean;
  /** Logprobs are accepted but silently ignored. Never use them for confidence. */
  ignoresLogprobs?: boolean;
  /** Reasoning cannot be disabled; latency and cost have a higher floor. */
  alwaysReasons?: boolean;
  /** Raw reasoning is never returned (summaries or encrypted only). */
  hiddenReasoning?: boolean;
  /** Can end with an explicit refusal; treat as a missing vote. */
  mayRefuse?: boolean;
  /** Provider requires data retention for this model (no zero-retention option). */
  requiresProviderRetention?: boolean;
};

export type ModelSpec = {
  id: string;
  name: string;
  provider: string;
  /** Model family used for independence (never two votes from one family by default). */
  family: string;
  role: ModelRole;
  strengths: string[];
  contextWindow: number | null;
  openWeights: boolean;
  verified: boolean;
  releaseDate: string | null;
  sourceUrl: string;
  pricing: PriceWindow[];
  longContext?: LongContextTier[];
  /** Price multiplier outside the provider's peak window (e.g. 0.5). Not applied by default. */
  offPeakMultiplier?: number;
  capabilities: ModelCapabilities;
  /** False when price or API id is unknown: kept for display, never routed. */
  routable: boolean;
  /**
   * Live roster only (live-catalog.ts): the model id on each provider that can
   * serve it. Providers only take a live model when their route is present.
   */
  routes?: Partial<Record<LiveRoute, string>>;
  /**
   * Input modalities the model accepts (OpenRouter `architecture.input_modalities`,
   * e.g. ["text","image","video"]). Recorded for the live and free rosters and
   * refreshed by the catalog sync. Undefined = unknown (research catalog).
   */
  inputModalities?: string[];
};

/** Live provider routes. OpenRouter is the primary multi-family gateway. */
export type LiveRoute = "openrouter" | "openai" | "nvidia";

/* ─────────────────────────── classification ─────────────────────────── */

export type TaskKind =
  | "general"
  | "factual"
  | "code"
  | "analysis"
  | "strategy"
  | "finance"
  | "research"
  | "writing"
  | "creation"
  | "agent";

export type Complexity = "simple" | "moderate" | "complex";

/** Human-facing capability names shown as chips while Keplar selects intelligence. */
export type Capability =
  | "Reasoning"
  | "Research"
  | "Coding"
  | "Finance"
  | "Market Analysis"
  | "Writing"
  | "Data Analysis"
  | "Risk"
  | "Regulatory"
  | "Verification"
  | "Creation"
  | "Planning"
  /** Images or video frames attached: vision models only. */
  | "Vision";

export type ComposerModes = {
  web: boolean;
  deepResearch: boolean;
  create: boolean;
  agent: boolean;
  /** Set on a picture follow-up (regenerate, variation, edit). Not a composer mode. Client routing only. */
  image?: boolean;
  /** Debate (BETA, debate.ts): the panel argues in rounds and reads each other's arguments before Keplar writes one answer. */
  debate?: boolean;
  /** Study chip: Keplar answers, then the answer (or the attached documents) becomes a study set (study/from-chat.ts). Client routing only. */
  study?: boolean;
  /** Slides chip: the message is the brief for a deck from the Slides studio (slides/from-chat.ts). Client routing only; no panel answer. */
  slides?: boolean;
  /** Reason chip: careful step-by-step work with visible checks (personalize/turn.ts); paid plans also get the thorough panel. */
  reason?: boolean;
  /** Live Research depth the person picked in the Keplar One desktop app (unset: the desktop recommends one). Client only; the route drops it. */
  liveDepth?: LiveDepth;
};

/** `id` is a client key so two files with the same name and size keep separate extracted text. The ask route does not store it. */
export type Attachment = { id?: string; name: string; size: number; type: string };

/**
 * One connected-app (MCP) tool use in a chat turn, shown to the user as a safe visible state ("Using DeepWiki: read_wiki_structure").
 * Never contains model reasoning, secrets or raw server output beyond a short sanitized preview.
 */
export type ToolUse = {
  id: string;
  app: string;
  tool: string;
  status: "running" | "done" | "error" | "awaiting_approval" | "blocked" | "skipped";
  /** read: ran on its own (all four auto-run conditions held). approval: waits for / ran after the owner's approval. */
  kind: "read" | "write" | "unknown";
  /** Short, sanitized arguments preview. */
  args?: string;
  /** Our own sentence about the outcome. */
  message?: string;
  receiptId?: string;
  approvalId?: string;
  durationMs?: number;
};

export type KeplarRequest = {
  prompt: string;
  /** Prior turns of this conversation, oldest first. The route turns them into `memory` (recent turns word for word, older ones shortened). */
  history?: { role: "user" | "keplar"; text: string }[];
  /** The chat this message belongs to (the app's thread id). Used to save a short summary of the chat; never trusted for anything else. */
  chatId?: string;
  /** The saved project this chat sits in. Only a request: the route checks it belongs to the signed-in owner and applies the Free privacy gate before using it. */
  projectId?: string;
  /** The user's IANA time zone, for "yesterday" in recall answers. */
  tz?: string;
  attachments?: Attachment[];
  /** Text of attached documents (PDF, text, code, CSV), read for this message only. Never stored with the chat; only the file name is. */
  docs?: { name: string; text: string; truncated?: boolean; source?: "file" | "link" | "transcript"; url?: string }[];
  /**
   * Everything sent ahead of the question besides the question itself (set server-side only, never copied from the client body):
   * the conversation so far, and for signed-in users with memory on: saved notes, summaries of recent chats, relevant past-chat snippets.
   * All of it is fenced data (context.ts), ends with "The question:", and is token-capped.
   */
  memory?: string;
  /**
   * Images and sampled video frames (validated data URLs, media.ts). Sent only
   * to models that accept image input; held in memory for this request only.
   */
  media?: MediaInput;
  modes?: Partial<ComposerModes>;
  /** Conversation opt-in for connected-app tools. The server still checks plan, connections, grants and policy; the client value alone grants nothing. */
  tools?: boolean;
  /** Private chat: no memory read or written, no learning; the client keeps it out of saved history. */
  private?: boolean;
  /** The person's saved specialist for this chat (looked up server-side in their own workspace). */
  specialistId?: string;
  /**
   * Live Research from the Keplar One desktop app (src/lib/research/live-request.ts): pages the desktop searched for and read on the person's
   * computer, as its numbered brief plus the source list. Client-supplied and untrusted: the route validates and caps it, fences it as data,
   * and never presents it as checked by Keplar's servers. When present, server-side web research and source checks are skipped.
   */
  liveResearch?: LiveResearchInput;
  /**
   * Answer recovery (turn-recovery.ts): a random key per send, reused by a retry after a dropped connection so the saved answer is
   * replayed instead of a second run. Validated in the route ([A-Za-z0-9_-]{16,64}); ignored for private chats, API keys and embeds.
   */
  turnKey?: string;
  routing?: RoutingPreferences;
  /** Remaining Keplar Usage in the caller's allowance. Set server-side from the ledger; never trusted from the client. */
  computeRemaining?: number;
  /** Caller's plan, set server-side. Free routes to $0 `:free` models only. */
  plan?: "free" | "lite" | "plus" | "pro" | "business";
  /** Plan limits for one question (limits.ts). Set server-side; the engine refuses a plan that would cost more. */
  limits?: { maxRequestUsd: number; maxDeepResearchUsd: number };
  /** ISO date used for dated pricing; defaults to now. */
  at?: string;
  /** Set server-side by query understanding (understand.ts); never read from the client body. */
  understanding?: { intent: string; crossCheck: boolean; mood: string; interpretation: string | null; play?: { kind: string; fixed?: string; hint?: string } };
};

export type Classification = {
  kind: TaskKind;
  complexity: Complexity;
  capabilities: Capability[];
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  needsWeb: boolean;
  /** Short, user-safe explanation of why Keplar treated the request this way. */
  rationale: string;
  /**
   * Set when the question is simple but a single model often gets it wrong: counting/arithmetic ("exact", Keplar also computes
   * the result itself) or an exact fact such as a year, number or distance ("fact"). Such questions get a small panel
   * (two models plus a check) instead of one model.
   */
  errorProne?: "exact" | "fact";
};

export interface Classifier {
  classify(req: KeplarRequest): Classification | Promise<Classification>;
}

/* ─────────────────────────────── routing ─────────────────────────────── */

export type RoutingStrategy = "auto" | "fast" | "balanced" | "thorough";

/** "standard" denies training; "sensitive" additionally requires zero data retention. */
export type DataTier = "standard" | "sensitive";

export type RoutingPreferences = {
  /** Keplar Core depth (src/lib/core): auto decides and escalates; quick is the fast path; thorough / exhaustive plan, check and revise. */
  depth?: import("@/lib/core/types").Depth;
  tier?: DataTier;
  strategy?: RoutingStrategy;
  /** Upper bound on independent panel models (1–6). */
  maxModels?: number;
  excludeProviders?: string[];
  preferOpenWeights?: boolean;
  excludeProviderRetention?: boolean;
};

export type RoutedModel = {
  model: ModelSpec;
  slot: "panel" | "verifier" | "judge";
  /** Capability this model covers in the panel, for the UI. */
  covers?: Capability;
  reason: string;
};

export type RoutingPlan = {
  mode: "single" | "consensus";
  panel: RoutedModel[];
  verifier: RoutedModel | null;
  /** Planned but only invoked if the panel disagrees. */
  judge: RoutedModel | null;
  estimate: ComputeEstimate;
  rationale: string;
};

export interface Router {
  route(c: Classification, req: KeplarRequest): RoutingPlan;
}

/* ────────────────────────────── providers ────────────────────────────── */

export type GenerationParams = {
  temperature?: number;
  topP?: number;
  logprobs?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  /** Ask a reasoning-capable model not to think first (OpenRouter `reasoning.enabled: false`). Faster, and the thinking tokens no longer eat the output budget. */
  reasoningOff?: boolean;
  maxOutputTokens?: number;
};

export type Claim = { id: string; text: string; supported?: boolean };

/** A source a model itself cited (URL in its text or a url_citation annotation). Never fetched or checked by Keplar. */
export type Citation = { url: string; title?: string };

export type ProviderResult =
  | {
      ok: true;
      modelId: string;
      /** Normalised position used for agreement clustering. */
      stance: string;
      claims: Claim[];
      text: string;
      latencyMs: number;
      usage: { inputTokens: number; outputTokens: number };
      /**
       * Actual cost reported by the gateway or provider for this call
       * (e.g. OpenRouter `usage.cost`). Catalog prices are only routing
       * estimates; when this is present it is what gets recorded.
       */
      actualCostUsd?: number;
      /** The model and upstream host that actually served the call (may differ after fallback). */
      servedBy?: { model: string; provider?: string; via: string };
      /** Sources the model cited in its own response (not opened or checked by Keplar). */
      citations?: Citation[];
    }
  | {
      ok: false;
      modelId: string;
      reason: "timeout" | "refusal" | "error" | "rate_limited";
      message: string;
      latencyMs: number;
    };

export interface Provider {
  /** Stable name for logs and fallback ordering, e.g. "openrouter", "direct:openai". */
  readonly name: string;
  /** True for real providers. Test doubles set false. */
  readonly live: boolean;
  /** Returns true if this provider can serve the model id. */
  supports(model: ModelSpec): boolean;
  /** False when this provider's API can't take image parts (the registry skips it for media calls). */
  readonly vision?: boolean;
  generate(input: {
    model: ModelSpec;
    prompt: string;
    classification: Classification;
    params: GenerationParams;
    /** Per-request privacy/routing tier; providers translate it to their own options. */
    tier?: DataTier;
    /** Panel, verifier or judge: lets a provider pin hosts for the judge call. */
    slot?: RoutedModel["slot"];
    /** System prompt override (verifier/judge calls). Defaults to the panel prompt. */
    system?: string;
    /** Images / video frames for vision models (panel calls on media questions only). */
    images?: ImageInput[];
    /** Text placed before the images (what was attached, how frames are labelled). */
    imagePreamble?: string;
    signal?: AbortSignal;
    /**
     * Real token streaming: when set, a provider that can stream asks for a streamed reply and calls this with each new piece of text
     * as it arrives (the final result is still the whole reply). Providers that cannot stream ignore it and the text arrives at once.
     */
    onToken?: (delta: string) => void;
  }): Promise<ProviderResult>;
}

/* ───────────────────────────── comparison ───────────────────────────── */

/**
 * consensus: a clear, evidence-weighted majority (score ≥ 80), dissent possible.
 * partial:   a leading position, but the evidence is split (60–79).
 * none:      no position holds a majority after verification.
 * single:    one model answered; there was nothing to compare.
 * unscored:  live answers arrived but no position extractor ran (see docs/orchestration.md).
 */
export type ConsensusLevel = "consensus" | "partial" | "none" | "single" | "unscored";

export type Position = {
  stance: string;
  summary: string;
  modelIds: string[];
};

export type Comparison = {
  level: ConsensusLevel;
  /**
   * Agreement after evidence weighting, 0–100. This measures how much the
   * consulted models agree. It is not an accuracy score.
   */
  score: number | null;
  agree: number;
  disagree: number;
  /** Refusals, timeouts and errors: missing votes, never counted as dissent. */
  missing: number;
  positions: Position[];
  majorityStance: string | null;
};

/**
 * Live only: classifies free-text panel responses into positions and claims
 * (one extractor call), so the comparator can score agreement. Responses that
 * decline or don't answer become missing votes, never dissent.
 */
export interface ResponseClassifier {
  readonly spentUsd: number;
  classify(input: { req: KeplarRequest; results: ProviderResult[]; classification: Classification; signal?: AbortSignal }): Promise<{ results: ProviderResult[]; topic?: string; note?: string }>;
}

export interface Comparator {
  /** Cluster answers by position. Counts only; no evidence weighting yet. */
  compare(results: ProviderResult[], c: Classification): Comparison | Promise<Comparison>;
  /** Re-score agreement once claims are verified. Majority is never truth by itself. */
  finalize(comparison: Comparison, verification: Verification, results: ProviderResult[]): Comparison;
}

/* ──────────────────────────── verification ──────────────────────────── */

/**
 * What the verifier (or judge) found when it reviewed the draft synthesis
 * against the individual responses. It never fetches external sources;
 * `web` checks come only from the optional Retriever (off by default).
 */
export type VerificationCheckKind =
  /** A step of reasoning that doesn't hold. */
  | "reasoning"
  /** Two statements that can't both be true (within a response, or draft vs. responses). */
  | "contradiction"
  /** A claim some models made that the others didn't support. */
  | "unsupported"
  /** Retriever only: a disputed claim checked against web sources. */
  | "web";

export type VerificationOutcome =
  /** The point held up; the synthesis keeps it. */
  | "held"
  /** The synthesis was reworded or qualified. */
  | "revised"
  /** The claim was left out of the answer. */
  | "removed"
  /** Kept, but presented as a minority view. */
  | "kept-as-dissent"
  /** Retriever outcomes. */
  | "supported"
  | "contradicted"
  | "inconclusive";

export type VerificationCheck = {
  kind: VerificationCheckKind;
  /** What was found, in one sentence. */
  finding: string;
  /** Display names of the models the finding concerns. */
  models: string[];
  outcome: VerificationOutcome;
  /** How the synthesis resolved it. */
  resolution: string;
  /** Retriever only: pages the claim was checked against. */
  sources?: { title: string; url: string }[];
};

export type Verification = {
  /** "not-needed" for single-model answers: nothing to cross-check. */
  mode: "cross-model" | "not-needed";
  /** The model that reviewed the draft (catalog suggested_role verifier/judge). */
  reviewer?: { modelId: string; name: string; role: "verifier" | "judge" };
  checks: VerificationCheck[];
  /** Claims still disputed after review: the only candidates for retrieval. */
  disputed: Claim[];
  checked: number;
  supported: number;
  removed: Claim[];
  notes: string[];
  /** Judge output when the panel disagreed. */
  judgement?: { modelId: string; favoured: string; why: string };
  /** Billed cost of the review call(s), when a live provider reported it. */
  costUsd?: number;
  /** Quiz requests: which question keys the reviewer would keep, drop, or replace from the source. */
  quizVerdicts?: QuizVerdict[];
};

export interface Verifier {
  verify(input: {
    req: KeplarRequest;
    results: ProviderResult[];
    comparison: Comparison;
    plan: RoutingPlan;
    classification: Classification;
    /** Draft synthesis the reviewer checks against the individual responses. */
    draft: string;
    signal?: AbortSignal;
  }): Promise<Verification>;
}

/**
 * Optional retrieval step, OFF by default (KEPLAR_RETRIEVAL_ENABLED). Runs only
 * on claims the comparator/verifier left disputed, through OpenRouter web
 * search with the engine pinned (never a model maker's native search).
 */
export interface Retriever {
  readonly name: string;
  /** Live retrievers return real pages; demo ones never invent links. */
  readonly live: boolean;
  check(input: { req: KeplarRequest; claims: Claim[]; plan: RoutingPlan; signal?: AbortSignal }): Promise<{ checks: VerificationCheck[]; costUsd: number }>;
  /**
   * Deep Research (research.ts): one live web search for one planned query. A model reads the pages the search returned and writes
   * short notes; `sources` are exactly the pages the search returned (never invented). Optional: retrievers without it skip the research phase.
   */
  research?(input: { query: string; plan: RoutingPlan; signal?: AbortSignal }): Promise<{ sources: { url: string; title: string; snippet?: string }[]; notes: string; costUsd: number }>;
}

/* ───────────────────────────── deep research ───────────────────────────── */

export type ResearchStepId = "plan" | "search" | "read" | "check" | "write";
/** A page a live web search returned for this question and a model read. `n` is the number used for [n] citations in the report. */
export type ResearchSource = {
  n: number;
  title: string;
  url: string;
  host: string;
  snippet?: string;
  query: number;
  /** Live Research (desktop) only: the page's own provenance, as the desktop read it. Absent for server Deep Research. */
  publisher?: string;
  publishedAt?: string;
  retrievedAt?: string;
  kind?: string;
  /** Pages that share a group are copies or the same publisher: not independent confirmation. */
  group?: string;
  /** Carried over from earlier research in this conversation, with its original retrieval time. */
  fromEarlierTurn?: boolean;
  /** Short verbatim excerpts the answer leans on (set after the desktop checked the answer). */
  evidence?: string[];
  /** Plain-language notes on the source ("Press release…", "No publication date found."), never a score. */
  signals?: string[];
};
/** Live Deep Research events, in order: plan (the queries), step updates, one `source` per page read; `off` when no web research ran (and why). */
export type ResearchEvent =
  | { phase: "plan"; queries: string[] }
  | { phase: "step"; step: ResearchStepId; status: "active" | "done" | "skipped"; detail?: string }
  | { phase: "source"; source: ResearchSource }
  | { phase: "off"; reason: string }
  /** Live Research only, synthesized by the page from the desktop's progress (never sent by the server): its own words for what it is doing. */
  | { phase: "live"; label: string; depth?: LiveDepth; webSearch?: boolean; read?: number; /** The finished run's pages in their final numbering (replaces the card's list). */ sources?: ResearchSource[] }
  /** Client only: the card starts over (Keplar's own Deep Research taking over from a desktop run that couldn't finish). */
  | { phase: "reset" };
/** On the finished answer: what the research read and which pages the report cites ([n] markers that really map to a read page). */
/** Server Deep Research's citation check (lib/research/citation-check.ts): words and numbers, not meaning. */
export type CitationCheck = {
  /** `conflicting`: absent on answers checked before conflicts were detected. */
  summary: { claims: number; supported: number; partiallySupported: number; conflicting?: number; notVerified: number };
  /** The statements that need a closer look, most serious first. */
  claims: LiveClaim[];
};
export type ResearchSummary = { queries: string[]; sources: ResearchSource[]; cited: number[]; off?: string; live?: LiveResearchMeta; check?: CitationCheck };

/* ───────────────────────────── live research (desktop) ───────────────────────────── */

export type LiveDepth = "fast" | "standard" | "deep";
/** One source the desktop read, as sent with the request (validated in live-request.ts). */
export type LiveSourceInput = { n: number; title: string; url: string; publisher?: string; publishedAt?: string; retrievedAt?: string; kind?: string; group?: string; fromEarlierTurn?: boolean };
/** The `liveResearch` request field after validation. */
export type LiveResearchInput = { runId: string; depth: LiveDepth; brief: string; queries: string[]; sources: LiveSourceInput[]; webSearch: boolean };
export type LiveClaimStatus = "supported" | "partially-supported" | "conflicting" | "not-verified";
/** How the desktop's citation check went for one statement (compact, persisted with the chat). The check compares words and numbers, not meaning. */
export type LiveClaim = { text: string; citations: number[]; status: LiveClaimStatus; quote?: string; conflict?: { n: number; quote: string }; note?: string };
/**
 * Live Research details on a finished answer. The server fills runId, depth and webSearch; the page adds `checked` after the desktop's
 * validate() ran (client-side, never signed, never shown as a server check) and `failed` from the run snapshot.
 */
export type LiveResearchMeta = {
  runId: string;
  depth: LiveDepth;
  /** General web search was configured on the desktop (false: only Wikipedia, Crossref and GDELT were searched). */
  webSearch: boolean;
  independentGroups?: number;
  failed?: { url: string; status: string; reason: string }[];
  checked?: {
    at: string;
    summary: { claims: number; supported: number; partiallySupported: number; conflicting: number; notVerified: number; removedCitations: number; removedLinks: number; uncitedFacts: number };
    claims: LiveClaim[];
  };
};

/* ───────────────────────────── synthesis ───────────────────────────── */

export type Source = {
  kind: "attachment" | "web" | "model" | "note";
  title: string;
  detail?: string;
  url?: string;
};

export type Disagreement = {
  topic: string;
  positions: { stance: string; models: string[]; summary: string }[];
  resolution: string;
};

export type ConsultedModel = {
  id: string;
  name: string;
  provider: string;
  slot: RoutedModel["slot"];
  status: "responded" | "failed" | "refused" | "not-needed";
  stance?: string;
  note?: string;
  /** Panel models that responded: the start of the model's own answer, shown when the reader opens "View Disagrees". Not in share snapshots. */
  excerpt?: string;
};

/** How well the pages Keplar actually retrieved back one claim from the answer. Only set from a real search that returned pages. */
export type SourceSupport = "supported" | "contradicted" | "unsettled" | "no_source";
export type SourceClaim = { text: string; support: SourceSupport; finding: string; sources: { title: string; url: string }[] };
/**
 * Verified answers (BETA): the key checkable claims of a factual answer, each searched on the web and judged against the pages found.
 * `checked` / `no_sources` mean a search really ran (and are signed by the server, so a shared page can show them); the other
 * states only explain why no check ran. A supporting page is evidence, not proof.
 */
export type Sourcing = {
  state: "checked" | "no_sources" | "nothing_to_check" | "free_plan" | "not_enabled" | "budget";
  /** Plain-language line for the card. */
  note: string;
  engine?: string;
  checkedAt?: string;
  claims: SourceClaim[];
  /** HMAC from the server over the answer id and this object (without `sig`). Missing = never shown on shared pages. */
  sig?: string;
};

export type KeplarAnswer = {
  /** Keplar Core (src/lib/core): depth, plan and steps, checks, calibrated confidence, next steps. */
  core?: import("@/lib/core/types").CoreSummary;
  id: string;
  /** Casual chat answered by one free model: the UI shows a plain reply with no comparison panel. */
  smalltalk?: boolean;
  /** Markdown. A complete answer on its own. */
  markdown: string;
  /**
   * Optional structured view (ranking, comparison, timeline, steps, and so on).
   * Absent when the synthesis didn't emit a valid block. Agreement figures and
   * per-item quotes on it come from the real responses, not from the model JSON.
   */
  rich?: RichAnswer;
  /**
   * A quiz or flashcards built from the attached file (or the conversation, when there is no file).
   * Absent when the request wasn't a quiz, or the block, the markdown quiz, and one repair call all failed: the markdown is the answer.
   */
  quiz?: Quiz;
  consensus: {
    level: ConsensusLevel;
    score: number | null;
    agree: number;
    disagree: number;
    missing: number;
    /** Panel models that returned a usable answer, and how many were asked. */
    responded: number;
    consulted: number;
    summary: string;
    /** The stance the agreeing models took (the comparator's majority), so the reader can see who agreed and who did not. */
    majorityStance?: string | null;
  };
  models: ConsultedModel[];
  sources: Source[];
  disagreements: Disagreement[];
  verification: {
    mode: Verification["mode"];
    summary: string;
    /** Reviewer display name, e.g. "Muse Spark 1.3 (verifier)". */
    reviewer?: string;
    checks: VerificationCheck[];
    notes: string[];
  };
  reasoning: string;
  capabilities: Capability[];
  /** Keplar Usage only. Provider cost never leaves the server. */
  compute: { units: number; level: ComputeLevel };
  durationMs: number;
  /** Connected-app tools used (or proposed) for this answer, with receipts. */
  tools?: ToolUse[];
  /** A clarifying question that could not be resolved from the conversation: the UI shows each option as a chip that sends it. */
  clarify?: { question: string; options: string[] };
  /** Factual questions only: the web source check (BETA) or the reason none ran. Absent for other questions. */
  sourcing?: Sourcing;
  /** Debate mode (BETA): the rounds the models argued before this answer was written. Shown as a collapsible transcript. */
  debate?: DebateSummaryData;
  /** Deep Research: the queries searched, the pages read and which of them the report cites inline as [n]. */
  research?: ResearchSummary;
  /** How Keplar read a short or ambiguous message (also shown as an italic first line of the answer). */
  interpretation?: string;
};

export interface Synthesizer {
  /** Live synthesizers: provider USD spent on draft + final synthesis calls, for metering. */
  readonly spentUsd?: number;
  /** Draft synthesis for the verifier to review (not streamed to the user). */
  draft?(input: { req: KeplarRequest; plan: RoutingPlan; results: ProviderResult[]; comparison: Comparison; signal?: AbortSignal }): Promise<string>;
  /** Streams markdown deltas, then resolves the complete answer. */
  synthesize(input: {
    req: KeplarRequest;
    classification: Classification;
    plan: RoutingPlan;
    results: ProviderResult[];
    comparison: Comparison;
    verification: Verification;
    /** The model whose words are already on screen as the early draft (its reply finished). Lets the synthesizer keep that reply when every model took the same position. */
    preferredModelId?: string;
    onDelta: (text: string) => void;
    signal?: AbortSignal;
  }): Promise<Omit<KeplarAnswer, "id" | "durationMs" | "compute" | "capabilities">>;
}

/* ─────────────────────────────── compute ─────────────────────────────── */

export type ComputeLevel = "low" | "moderate" | "high" | "very-high";

/**
 * Internal cost estimate. `usd` stays server-side in production; the product
 * speaks only in Keplar Usage units and levels.
 */
export type ComputeEstimate = {
  usd: number;
  units: number;
  breakdown: { modelId: string; slot: RoutedModel["slot"]; usd: number; conditional?: boolean }[];
};

/* ───────────────────────────── stream events ───────────────────────────── */

export type StageId =
  | "understand"
  | "select"
  /** Debate mode (BETA): the models argue in rounds. */
  | "debate"
  | "compare"
  | "disagree"
  | "verify"
  | "synthesize";

export type DebateTurnUpdate = "held" | "refined" | "changed";

export type DebateSummaryData = {
  beta: true;
  /** Rounds actually run (a stopped or thinned-out debate can end early). */
  rounds: number;
  speakers: Array<{ seat: number; name: string }>;
  turns: Array<{ round: number; seat: number; name: string; ok: boolean; position: string; update: DebateTurnUpdate | null; why: string; text: string }>;
  /** Debaters who changed position at least once. */
  changed: number;
};

/** Live Debate events (BETA). `seat` indexes `speakers` from the start event. */
export type DebateEvent =
  | { phase: "start"; rounds: number; speakers: Array<{ seat: number; name: string }> }
  | { phase: "round"; round: number; of: number }
  | { phase: "turn_start"; round: number; seat: number }
  /** Streamed text of a turn in progress (raw, protocol lines included; the finished `turn` replaces it). */
  | { phase: "delta"; round: number; seat: number; text: string }
  | { phase: "turn"; round: number; seat: number; name: string; status: "ok" | "failed"; position: string; update: DebateTurnUpdate | null; why: string; text: string }
  /** Debate was asked for but could not run (e.g. only one model available); the question is answered normally. */
  | { phase: "skipped"; reason: string }
  | { phase: "done"; rounds: number; changed: number };

export type KeplarEvent =
  | { type: "stage"; stage: StageId; status: "active" | "done"; detail?: string }
  | { type: "debate"; debate: DebateEvent }
  /** Deep Research: the research plan, step progress and each page read, live. */
  | { type: "research"; research: ResearchEvent }
  /** Keplar Core: depth chosen, the plan and each step's progress, verification rounds, budget used, next steps. */
  | { type: "core"; core: import("@/lib/core/types").CoreEvent }
  | { type: "capabilities"; items: Capability[]; mode: RoutingPlan["mode"]; modelCount: number }
  | { type: "model"; modelId: string; name: string; status: "responded" | "failed" | "refused"; note?: string }
  | { type: "disagreement"; summary: string }
  | { type: "smalltalk" }
  /**
   * The message asked for a clip. No model is called. The chat replaces this turn with the video card
   * (plan note, or shape, length and subject). A text answer must not say Keplar cannot make videos.
   */
  | { type: "video"; video: import("@/lib/video/chat-types").ChatVideo }
  /**
   * Answer recovery, always reporting a real state: "replayed" (this answer was saved by an earlier run of the same turn and is shown
   * again: no second run, no second charge), "recovering" (the browser lost the stream and is fetching the saved answer), "recovered"
   * (it got it), "lost" (nothing to recover: the run failed or never started). `headless`: the run finished after the browser left.
   */
  | { type: "recovery"; state: "replayed" | "recovering" | "recovered" | "lost"; headless?: boolean }
  | { type: "delta"; text: string }
  | { type: "answer"; answer: KeplarAnswer }
  /** A connected-app tool use started, finished, failed, or is waiting for the owner's approval. Upsert by `use.id`. */
  | { type: "tool"; use: ToolUse }
  /**
   * Signed-in users only, after the answer: whether memory is on, whether this turn saved new notes
   * (`saved`) and whether the chat's summary was refreshed. Drives the "Memory updated" hint.
   */
  | { type: "memory"; enabled: boolean; saved: number; summarized?: boolean; used?: number }
  /**
   * Free plan only: today's question meter. Sent when the question is accepted (so the count drops at once) and again
   * if the question ended without an answer (it is given back), so the UI always shows the true number.
   */
  | { type: "daily"; daily: { used: number; limit: number; left: number; resetsAt: string } }
  | {
      type: "limit";
      required: number;
      remaining: number;
      /** Set when a rolling 5-hour or weekly limit (not the monthly credits) is what stopped the question. */
      window?: { id: "fiveHour" | "weekly"; label: string; resetsAt: string; message: string };
      /** Set when the Free plan's questions for today are used up (the server refused before starting). */
      daily?: { limit: number; resetsAt: string };
      /**
       * Set when today's shared usage budget paused Free. Not this person's questions and not monthly credits.
       * `resetsAt` is the next 00:00 UTC.
       */
      budget?: "day";
      resetsAt?: string;
    }
  | {
      type: "error";
      /**
       * "no_response": the run ended with no model answering. It is never charged.
       * "plan_required": the request needs a feature the caller's plan doesn't include (Deep Research on Free and Lite); offer an upgrade.
       */
      code: "bad_request" | "internal" | "network" | "unavailable" | "no_response" | "plan_required";
      message: string;
      retryable: boolean;
      /** no_response only: show the Plus upgrade suggestion (Free and signed-out). */
      upgrade?: boolean;
      /** no_response only: always false, the run was not billed. */
      charged?: false;
    };

