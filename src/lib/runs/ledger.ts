/**
 * Loads the Run ledger for one person (src/lib/runs/types.ts). Read only.
 *
 * Two workspaces can be involved: Core jobs and the connected-app calls Ask proposed live in the person's own workspace, while
 * agent runs live in the Business workspace they act in (their own, or the owner's when they are an invited teammate, the same
 * rule as /api/business/*). When both are the same workspace, each collection is read once.
 */
import { jobRows, type CoreJob } from "@/lib/core/jobs";
import { agents, approvals, mcpReceipts, runs } from "@/lib/business/repo";
import { CHAT_AGENT } from "@/lib/mcp/gateway";
import type { Approval } from "@/lib/business/types";
import type { McpReceipt } from "@/lib/mcp/types";
import { byRecent, fromAgentRun, fromChatTools, fromCoreJob } from "./project";
import type { RunView } from "./types";

export const LEDGER_LIMIT = 60;

export type LedgerScope = { personal: string; business: string | null };

const live = (j: CoreJob, at: number) => Date.parse(j.expiresAt) >= at;

async function receiptsFor(workspaceId: string, aps: Approval[]): Promise<Map<string, McpReceipt>> {
  const wanted = new Set(aps.filter((a) => a.action.type === "mcp.call" && a.status === "sent").map((a) => a.id));
  if (!wanted.size) return new Map();
  const rows = await mcpReceipts().list(workspaceId, (r) => !!r.approvalId && wanted.has(r.approvalId));
  return new Map(rows.map((r) => [r.approvalId!, r]));
}

function chatGroups(aps: Approval[]): Map<string, Approval[]> {
  const groups = new Map<string, Approval[]>();
  for (const a of aps) {
    if (a.agentId !== CHAT_AGENT) continue;
    const g = groups.get(a.runId);
    if (g) g.push(a);
    else groups.set(a.runId, [a]);
  }
  return groups;
}

export async function listRuns(scope: LedgerScope, at = Date.now()): Promise<RunView[]> {
  const biz = scope.business;
  const same = biz === scope.personal;
  const [jobs, personalAps, bizRuns, bizAps, bizAgents] = await Promise.all([
    jobRows().list(scope.personal),
    approvals().list(scope.personal),
    biz ? runs().list(biz) : Promise.resolve([]),
    biz && !same ? approvals().list(biz) : Promise.resolve(null),
    biz ? agents().list(biz) : Promise.resolve([]),
  ]);
  const agentAps = (bizAps ?? (same ? personalAps : [])).filter((a) => a.agentId !== CHAT_AGENT);
  const chat = chatGroups(personalAps);
  const [personalReceipts, bizReceipts] = await Promise.all([
    receiptsFor(scope.personal, [...chat.values()].flat().concat(same ? agentAps : [])),
    biz && !same ? receiptsFor(biz, agentAps) : Promise.resolve(null),
  ]);
  const names = new Map(bizAgents.map((a) => [a.id, a.name]));
  const out: RunView[] = [
    ...jobs.filter((j) => live(j, at)).map((j) => fromCoreJob(j)),
    ...bizRuns.map((r) => fromAgentRun(r, names.get(r.agentId), agentAps, bizReceipts ?? personalReceipts)),
    ...[...chat.entries()].map(([runId, aps]) => fromChatTools(runId, aps, personalReceipts)),
  ];
  return out.filter((r) => r.updatedAt).sort(byRecent).slice(0, LEDGER_LIMIT);
}

/** One run by its ledger id, from the workspace that owns its source. Null when it does not exist or is not this person's. */
export async function getRun(scope: LedgerScope, ledgerId: string, at = Date.now()): Promise<RunView | null> {
  const dot = ledgerId.indexOf(".");
  if (dot < 1) return null;
  const source = ledgerId.slice(0, dot);
  const id = ledgerId.slice(dot + 1, dot + 1 + 80);
  if (!id) return null;
  if (source === "core") {
    const j = await jobRows().get(scope.personal, id);
    return j && live(j, at) ? fromCoreJob(j, { withResult: true }) : null;
  }
  if (source === "agent") {
    if (!scope.business) return null;
    const run = await runs().get(scope.business, id);
    if (!run) return null;
    const [aps, agent] = await Promise.all([approvals().list(scope.business, (a) => a.runId === id), agents().get(scope.business, run.agentId)]);
    return fromAgentRun(run, agent?.name, aps, await receiptsFor(scope.business, aps));
  }
  if (source === "tools") {
    const aps = await approvals().list(scope.personal, (a) => a.agentId === CHAT_AGENT && a.runId === id);
    return aps.length ? fromChatTools(id, aps, await receiptsFor(scope.personal, aps)) : null;
  }
  return null;
}
