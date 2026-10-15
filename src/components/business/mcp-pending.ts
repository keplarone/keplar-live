import type { ToolUse } from "@/lib/orchestration/types";
import { activeScopeHeaders } from "@/components/app-ui/state/scope";

/** Connected-app calls waiting for the owner's approval (the account's own approvals), as approval cards for ToolUses. */
export async function loadPendingMcpApprovals(): Promise<ToolUse[]> {
  const r = await fetch("/api/business/approvals", { cache: "no-store", headers: activeScopeHeaders() });
  if (!r.ok) throw new Error("Couldn't load pending approvals.");
  const data = await r.json() as { approvals?: { id: string; status: string; action?: { type?: string; serverName?: string; tool?: string; args?: unknown } }[] };
  return (data.approvals ?? [])
    .filter((a) => a.status === "pending" && a.action?.type === "mcp.call")
    .map((a): ToolUse => ({ id: a.id, app: a.action?.serverName ?? "Connected app", tool: a.action?.tool ?? "Action", status: "awaiting_approval", kind: "unknown", approvalId: a.id, args: JSON.stringify(a.action?.args ?? {}) }));
}
