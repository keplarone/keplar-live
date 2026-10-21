/**
 * Pure mappings from each executor's own records onto the ledger's RunView (src/lib/runs/types.ts).
 * No I/O here; src/lib/runs/ledger.ts loads the records. Only person-facing fields are copied: never a Core job's context,
 * scratch work or tool arguments.
 */
import type { CoreJob } from "@/lib/core/jobs";
import type { CoreCheck, CoreStepStatus, StopReason } from "@/lib/core/types";
import type { AgentRun, Approval } from "@/lib/business/types";
import type { McpReceipt } from "@/lib/mcp/types";
import { previewAction } from "@/lib/business/chat-flow";
import type { Outcome, RunStatus, RunStep, RunView, StepState } from "./types";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------- Core jobs ("Keep working" on a deep answer) ---------- */

const STEP_STATE: Record<CoreStepStatus, StepState> = { pending: "pending", active: "active", done: "done", revised: "done", failed: "failed", skipped: "skipped" };
const STOPPED: Partial<Record<StopReason, string>> = {
  budget: "Stopped at its spending limit before the review passed",
  time: "Stopped at its time limit before the review passed",
  pool: "Stopped early because the free model pool was busy",
  cancelled: "Stopped by you",
};
/** Checks that ran something or compared with read material count as verified; a second model's opinion is only reviewed. */
const RUN_CHECKS = new Set<CoreCheck["kind"]>(["execution", "syntax", "grounding"]);

export function checkOutcome(c: CoreCheck): Outcome {
  const evidence = c.detail ? clip(c.detail, 200) : undefined;
  if (c.outcome === "failed") return { kind: "open", text: `Check failed: ${c.label}`, ...(evidence ? { evidence } : {}) };
  if (c.outcome === "inconclusive") return { kind: "open", text: `Could not confirm: ${c.label}`, ...(evidence ? { evidence } : {}) };
  const fixed = c.outcome === "fixed" ? "Fixed after the first attempt failed" : undefined;
  return { kind: RUN_CHECKS.has(c.kind) ? "verified" : "reviewed", text: c.label, ...(evidence || fixed ? { evidence: evidence ?? fixed } : {}) };
}

export function fromCoreJob(j: CoreJob, opts: { withResult?: boolean } = {}): RunView {
  const core = j.result?.core;
  const status: RunStatus = j.status === "paused" ? "needs_you" : j.status === "running" ? "running" : j.status === "done" ? "done" : "failed";
  const outcomes: Outcome[] = [];
  if (j.result) {
    const bits = [core ? plural(core.rounds, "round") : "", core?.confidence.words ?? ""].filter(Boolean);
    outcomes.push({ kind: "generated", text: "Answer written", ...(bits.length ? { evidence: bits.join(" · ") } : {}) });
  }
  const seen = new Set<string>();
  for (const c of core?.checks ?? j.checks) {
    const key = `${c.kind}:${c.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outcomes.push(checkOutcome(c));
  }
  const stopped = core ? STOPPED[core.stoppedBy] : undefined;
  if (stopped) outcomes.push({ kind: "open", text: stopped });
  if (j.error) outcomes.push({ kind: "open", text: clip(j.error, 200) });
  else if (j.status === "paused") outcomes.push({ kind: "open", text: "Paused before the checks passed" });
  return {
    id: `core.${j.id}`,
    source: "core",
    title: clip(j.prompt.trim() || "A deep answer", 120),
    detail: `${j.depth === "exhaustive" ? "Exhaustive" : "Thorough"} answer${j.slices ? ` · ${plural(j.slices, "background pass")}` : ""}`,
    status,
    startedAt: j.createdAt,
    updatedAt: j.updatedAt,
    endedAt: status === "done" || status === "failed" ? j.updatedAt : null,
    steps: j.steps.map((s) => ({ text: clip(s.title, 120), state: STEP_STATE[s.status] ?? "pending" })),
    outcomes,
    ...(status === "needs_you" ? { next: { label: "Keep working", keepWorking: true as const } } : {}),
    ...(opts.withResult && j.result?.markdown ? { result: clip(j.result.markdown, 12_000) } : {}),
  };
}

/* ---------- Approvals and connected-app receipts (shared by agents and chat tools) ---------- */

export function actionLabel(a: Approval["action"]): string {
  const p = previewAction(a);
  if (a.type === "email.send") return clip(`Email to ${a.to}: ${p.title}`, 140);
  if (a.type === "mcp.call") return clip(`${a.serverName || "Connected app"}: ${a.tool}`, 140);
  return clip(p.to && !p.title.includes(p.to) ? `${p.title} (${p.to})` : p.title, 140);
}

/** One approval's outcome line, or null for a decision that ended it (declined, cancelled), which shows as a step instead. */
export function approvalOutcome(a: Approval, receipt?: McpReceipt): Outcome | null {
  const label = actionLabel(a.action);
  switch (a.status) {
    case "pending":
      return { kind: "proposed", text: label, evidence: `Waiting for your approval${a.risk ? ` · ${a.risk} risk` : ""}` };
    case "approved":
    case "executing":
      return { kind: "open", text: label, evidence: "Approved; being sent now" };
    case "failed":
      return { kind: "open", text: `Not sent: ${label}`, ...(a.result ? { evidence: clip(a.result, 200) } : {}) };
    case "sent": {
      if (receipt && receipt.status !== "ok" && receipt.status !== "running") return { kind: "open", text: `Sent, but the app reported a problem: ${label}`, ...(receipt.error ? { evidence: clip(receipt.error, 200) } : {}) };
      const proof = receipt?.status === "ok" ? `Completed in ${(receipt.durationMs / 1000).toFixed(1)} s` : a.result ? clip(a.result, 200) : "Sent";
      return { kind: "done", text: label, evidence: proof };
    }
    default:
      return null;
  }
}

function approvalStep(a: Approval): RunStep {
  const label = actionLabel(a.action);
  const at = a.decidedAt ?? a.createdAt;
  if (a.status === "rejected") return { text: `You declined: ${label}`, state: "skipped", at };
  if (a.status === "cancelled") return { text: `Canceled: ${label}`, state: "skipped", at };
  if (a.status === "pending") return { text: `Drafted for your approval: ${label}`, state: "active", at: a.createdAt };
  if (a.status === "failed") return { text: `Could not send: ${label}`, state: "failed", at };
  if (a.status === "sent") return { text: `Sent: ${label}`, state: "done", at };
  return { text: `Sending: ${label}`, state: "active", at };
}

/** Status from the approvals themselves: a run that once waited is done once nothing is left pending. */
function statusFromApprovals(aps: Approval[]): RunStatus | null {
  if (!aps.length) return null;
  if (aps.some((a) => a.status === "pending")) return "needs_you";
  if (aps.some((a) => a.status === "approved" || a.status === "executing")) return "running";
  if (aps.some((a) => a.status === "sent")) return "done";
  if (aps.every((a) => a.status === "failed")) return "failed";
  return "stopped";
}

const latest = (...xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? "";

/* ---------- Business agent runs ---------- */

export function fromAgentRun(run: AgentRun, agentName: string | undefined, aps: Approval[], receipts: Map<string, McpReceipt> = new Map()): RunView {
  const mine = aps.filter((a) => a.runId === run.id).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const base: RunStatus = run.status === "running" ? "running" : run.status === "succeeded" ? "done" : run.status === "failed" ? "failed" : run.status === "stopped" ? "stopped" : "needs_you";
  const status = run.status === "running" || run.status === "failed" ? base : (statusFromApprovals(mine) ?? (base === "needs_you" ? "done" : base));
  const steps: RunStep[] = run.steps.map((s, i) => ({ text: clip(s.text, 160), at: s.at, state: run.status === "failed" && i === run.steps.length - 1 ? "failed" : "done" }));
  steps.push(...mine.filter((a) => a.status !== "pending").map(approvalStep));
  const outcomes: Outcome[] = [];
  for (const a of mine) {
    const o = approvalOutcome(a, receipts.get(a.id));
    if (o) outcomes.push(o);
  }
  for (const n of run.needs ?? []) outcomes.push({ kind: "open", text: n.problem === "tool_off" ? `${n.label} is connected, but this tool is turned off` : `Connect ${n.label} to run this` });
  if (run.status === "failed" && run.error && !run.needs?.length) outcomes.push({ kind: "open", text: clip(run.error, 200) });
  if (run.status === "succeeded" && !mine.length) outcomes.push({ kind: "done", text: "Run finished with nothing to send", evidence: plural(run.units, "usage unit") });
  return {
    id: `agent.${run.id}`,
    source: "agent",
    title: agentName ? clip(agentName, 120) : "Agent run",
    detail: `Agent · ${run.trigger === "manual" ? "started by you" : run.trigger.startsWith("schedule") ? "on its schedule" : run.trigger === "chat" ? "started from a chat" : `started by ${clip(run.trigger, 40)}`}`,
    status,
    startedAt: run.startedAt,
    updatedAt: latest(run.endedAt, run.steps.at(-1)?.at, ...mine.map((a) => a.decidedAt ?? a.createdAt), run.startedAt),
    endedAt: status === "running" || status === "needs_you" ? null : (run.endedAt ?? latest(...mine.map((a) => a.decidedAt))) || null,
    steps,
    outcomes,
    ...(status === "needs_you" && mine.some((a) => a.status === "pending") ? { next: { label: "Review in Approvals", view: "approvals" as const } } : {}),
    ...(run.needs?.length ? { next: { label: "Open Agents", view: "agents" as const } } : {}),
  };
}

/* ---------- Connected-app calls Ask proposed in a chat (approvals with agentId "chat", grouped by turn) ---------- */

export function fromChatTools(runId: string, aps: Approval[], receipts: Map<string, McpReceipt> = new Map()): RunView {
  const mine = aps.filter((a) => a.runId === runId).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const apps = [...new Set(mine.map((a) => (a.action.type === "mcp.call" ? a.action.serverName || "Connected app" : previewAction(a.action).kind)))];
  const status = statusFromApprovals(mine) ?? "stopped";
  const outcomes: Outcome[] = [];
  for (const a of mine) {
    const o = approvalOutcome(a, receipts.get(a.id));
    if (o) outcomes.push(o);
  }
  return {
    id: `tools.${runId}`,
    source: "tools",
    title: mine.length === 1 ? actionLabel(mine[0].action) : `${plural(mine.length, "app action")} from a chat`,
    detail: `Connected apps · ${clip(apps.join(", "), 80)}`,
    status,
    startedAt: mine[0]?.createdAt ?? "",
    updatedAt: latest(...mine.map((a) => a.decidedAt ?? a.createdAt)),
    endedAt: status === "running" || status === "needs_you" ? null : latest(...mine.map((a) => a.decidedAt)) || null,
    steps: mine.map(approvalStep),
    outcomes,
    ...(status === "needs_you" ? { next: { label: "Review in Approvals", view: "approvals" as const } } : {}),
  };
}

/** Newest activity first. */
export function byRecent(a: RunView, b: RunView): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Counts for a header line, one per outcome kind and per status the person should notice. */
export function tally(runs: RunView[]) {
  return {
    needsYou: runs.filter((r) => r.status === "needs_you").length,
    running: runs.filter((r) => r.status === "running").length,
  };
}
