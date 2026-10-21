/**
 * The Run ledger: one read-only view of every piece of work Keplar is doing or has done for a person.
 *
 * It is a projection, not a new store. Each executor keeps writing its own records (Core jobs in `core_jobs`, agent runs in
 * `biz_agent_runs`, approvals in `biz_approvals`, connected-app calls in `mcp_receipts`), and the ledger reads them and maps
 * them onto one shape. Nothing here runs, approves or sends anything, so it cannot fake progress: every step and outcome line
 * comes from a record the executor wrote.
 *
 * Every outcome line says what kind of claim it is, so the person can tell a draft from a checked result from a finished action.
 */

export type RunSource = "core" | "agent" | "tools";

export type RunStatus =
  | "running"
  /** Waiting on the person: an approval, or a paused answer they can continue. */
  | "needs_you"
  | "done"
  | "failed"
  | "stopped";

export type StepState = "done" | "active" | "pending" | "failed" | "skipped";
export type RunStep = { text: string; state: StepState; at?: string };

/**
 * What an outcome line is:
 *   done       an action was carried out, and a record says so (a sent approval, a successful tool receipt)
 *   proposed   an action is drafted and waits for the person's approval; nothing has been sent
 *   verified   checked by running it (sandbox) or against the material it read
 *   reviewed   checked by another model: an opinion, not proof
 *   generated  written by a model and not checked
 *   open       not done: failed, refused, blocked, or could not be confirmed
 */
export type OutcomeKind = "done" | "proposed" | "verified" | "reviewed" | "generated" | "open";
export type Outcome = { kind: OutcomeKind; text: string; evidence?: string };

/** The one next move the person can make, if any. `view` is an /app tab; `keepWorking` continues a paused Core job. */
export type RunNext = { label: string; view?: "approvals" | "agents" | "apps"; keepWorking?: true };

export type RunView = {
  /** `<source>.<executor id>`, for example `core.cj_123` or `agent.run_456`. */
  id: string;
  source: RunSource;
  title: string;
  /** Short context line: what started it, or which agent. */
  detail?: string;
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  steps: RunStep[];
  outcomes: Outcome[];
  next?: RunNext;
  /** A Core answer that finished: its markdown, clipped (detail endpoint only). */
  result?: string;
};

export const OUTCOME_ORDER: OutcomeKind[] = ["done", "proposed", "verified", "reviewed", "generated", "open"];
