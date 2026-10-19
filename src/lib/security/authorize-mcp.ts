/**
 * MCP tool-call policy for `authorize`. Extracted from the gateway so the next tool goes through the same
 * approval steps instead of copying them. The order and the errors match the gateway's previous inline checks:
 * plan, enabled tool, arguments, halt, approval or auto-run, grant, then the shared firewall inside `authorize`.
 * Nothing here calls the remote server.
 */
import { approvals, audit } from "@/lib/business/repo";
import { HttpError } from "@/lib/create/platform/http";
import { EntitlementError, type PlanId } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import { argsHash, assertArgs, assertMcpAllowed, buildAction, CHAT_AGENT, chatAutoRunAllowed, grantCheck, haltedCheck, load } from "@/lib/mcp/gateway";
import type { McpServer, McpTool } from "@/lib/mcp/types";
import { authorize, mcpCallBinding, registerActionPolicy, type AuthorizeDecision, type AuthorizeDeny, type McpCallSubject, type Permit } from "./authorize";
import { registerToolCallSecurityGate } from "./tool-gate";

export type McpCallState = {
  loaded: { server: McpServer; tool: McpTool };
  args: Record<string, unknown>;
  agentId: string | null;
};

let registered = false;
function ensureRegistered() {
  if (registered) return;
  registered = true;
  registerActionPolicy("mcp.call", mcpCallPolicy);
  registerToolCallSecurityGate();
}
ensureRegistered();

async function mcpCallPolicy(req: Parameters<typeof authorize>[0]) {
  const call = req.mcpCall;
  if (!call) return { outcome: "deny" as const, status: 400, code: "invalid_request", message: "This action could not be authorized." };
  const ws = req.workspace as Workspace;
  try {
    assertMcpAllowed(ws);
    const loaded = await load(ws, call.serverId, call.tool);
    const args = assertArgs(loaded.tool, call.args);
    const agentId = call.agentId && call.agentId !== "owner" ? call.agentId : null;
    if (agentId) await haltedCheck(ws);
    if (call.via === "approval") {
      const ap = call.approvalId ? await approvals().get(ws.id, call.approvalId) : null;
      const a = ap?.action;
      if (!ap || ap.status !== "executing" || a?.type !== "mcp.call" || a.serverId !== loaded.server.id || a.tool !== loaded.tool.name || argsHash(a.args) !== argsHash(args)) {
        throw new HttpError(403, "No matching approval for this call.", "no_approval");
      }
    } else if (call.via === "auto") {
      if (loaded.tool.risk !== "read" || !loaded.tool.autoRun) throw new HttpError(403, "This tool needs your approval before it runs.", "needs_approval");
      if (!agentId) throw new HttpError(403, "This tool needs your approval before it runs.", "needs_approval");
      if (agentId === CHAT_AGENT && !(await chatAutoRunAllowed(ws.id))) throw new HttpError(403, "Ask isn't set to run tools without asking.", "needs_approval");
    } else if (loaded.tool.risk !== "read") {
      throw new HttpError(403, "This tool needs your approval before it runs.", "needs_approval");
    }
    if (agentId) await grantCheck(ws, agentId, loaded);
    const state: McpCallState = { loaded, args, agentId };
    return {
      outcome: "continue" as const,
      outbound: buildAction(loaded, args, call.idempotencyKey),
      intendsAutoSend: call.via === "auto",
      binding: mcpCallBinding(loaded.server.url, loaded.tool.name, args),
      state,
    };
  } catch (e) {
    if (e instanceof EntitlementError) return { outcome: "deny" as const, status: 402, code: "entitlement", message: e.message, entitlement: true, upgradeTo: e.upgradeTo };
    if (e instanceof HttpError) return { outcome: "deny" as const, status: e.status, code: e.code, message: e.message, ...(e.extra ? { extra: e.extra } : {}) };
    throw e;
  }
}

function actorFor(ws: Workspace, agentId: string | null): { id: string; kind: "owner" | "agent" | "chat" } {
  if (agentId === CHAT_AGENT) return { id: CHAT_AGENT, kind: "chat" };
  if (agentId) return { id: agentId, kind: "agent" };
  return { id: ws.userId ?? "owner", kind: "owner" };
}

/** Map a gate denial back to the error the gateway used to throw, including plan errors. */
function throwDecision(decision: AuthorizeDeny): never {
  if (decision.entitlement) throw new EntitlementError(decision.message, decision.upgradeTo as PlanId | undefined);
  throw new HttpError(decision.status, decision.message, decision.code, decision.extra);
}

/**
 * Run the MCP call through `authorize`. On allow, returns the permit `callTool` requires.
 * On require-approval or deny, throws the same errors the gateway threw before this extraction.
 */
export async function authorizeMcpCall(ws: Workspace, req: McpCallSubject): Promise<{ permit: Permit; loaded: McpCallState["loaded"]; args: Record<string, unknown>; agentId: string | null }> {
  ensureRegistered();
  const agentId = req.agentId && req.agentId !== "owner" ? req.agentId : null;
  const decision: AuthorizeDecision = await authorize({
    actor: actorFor(ws, agentId),
    workspace: ws,
    action: "mcp.call",
    resource: { type: "mcp.tool", id: `${req.serverId}/${req.tool}`.slice(0, 160) },
    mcpCall: { ...req, agentId },
  });
  const state = decision.state as McpCallState | undefined;
  if (decision.outcome === "require_approval") {
    const target = state ? `${state.loaded.server.id}/${state.loaded.tool.name}` : `${req.serverId}/${req.tool}`;
    const who = (state?.agentId ?? agentId) ? `agent:${state?.agentId ?? agentId}` : "owner";
    await audit(ws.id, who, "mcp.call.needs_approval", target, `${decision.risk ?? "high"} risk: ${decision.reasons.join("; ")}`.slice(0, 300));
    throw new HttpError(403, decision.message, "needs_approval");
  }
  if (decision.outcome === "deny") {
    if (decision.code === "firewall_blocked" && state) {
      const who = state.agentId ? `agent:${state.agentId}` : "owner";
      await audit(ws.id, who, "firewall.blocked", `${state.loaded.server.id}/${state.loaded.tool.name}`, decision.message);
    }
    throwDecision(decision);
  }
  if (!state?.loaded || !decision.permit) throw new HttpError(500, "This action could not be authorized.", "authorize_state");
  return { permit: decision.permit, loaded: state.loaded, args: state.args, agentId: state.agentId };
}
