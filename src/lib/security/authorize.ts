/**
 * Central permission and approval gate.
 *
 * `getSession` answers "who is this?". `authorize` answers the next question: given that actor, may this action run,
 * must a person approve it first, or is it refused? Call it before anything that leaves the workspace (a tool call,
 * a send, a publish, a charge). The MCP tool call is the first caller (`authorize-mcp.ts` → `callTool`).
 *
 * Built-in checks, in order, after an action policy has had its say:
 *   1. Team role (`roleCan`) when `teamAction` is set.
 *   2. Plan entitlement (`ENTITLEMENTS`) when `entitlement` is set.
 *   3. AI Firewall (`inspectAction`) when an outbound payload is set. A blocked payload is a deny. An automatic send
 *      the firewall will not auto-send becomes `require_approval`.
 *   4. Registered security gates. A gate may only tighten the decision: deny beats require_approval beats allow.
 *      A gate cannot turn a refusal into an allow. This is the plug for another engineer's gate (see
 *      docs/architecture/authorize.md).
 *
 * Every decision writes one structured log line (`authorize.decision`), one `security_events` row (kind `agent.action`),
 * and one `biz_audit` row through the existing `audit()` helper. A failure to write those never changes the decision.
 *
 * On allow, the result carries a permit. `callTool` accepts only a live permit for that exact server, tool and
 * arguments, so a later tool cannot reach the network by skipping this function.
 */
import { logEvent } from "@/lib/ops/log";
import { securityEvent } from "@/lib/security/events";
import { inspectAction, type Risk } from "@/lib/business/firewall";
import type { OutboundAction } from "@/lib/business/types";
import { ENTITLEMENTS, type Entitlements, type PlanId } from "@/lib/create/platform/plans";
import { roleCan, type TeamAction, type TeamRole } from "@/lib/team/policy";
import { hashOf } from "@/lib/mcp/schema";

export type AuthorizeActor = {
  /** Stable id. Never an email address. */
  id: string;
  kind: "owner" | "agent" | "chat" | "system";
  /** Set when the action is inside a team workspace. */
  role?: TeamRole;
};

/** The fields the built-in checks read. Callers may pass a full workspace; only these are required. */
export type AuthorizeWorkspace = { id: string; plan: PlanId };

export type AuthorizeResource = { type: string; id: string };

/**
 * Subject of an MCP tool call. Present only when `action` is `mcp.call`. The MCP policy
 * (`authorize-mcp.ts`) reads it; a gate may read it and must not log the arguments.
 */
export type McpCallSubject = {
  serverId: string;
  tool: string;
  args: Record<string, unknown>;
  idempotencyKey: string;
  agentId: string | null;
  via: "approval" | "auto" | "manual";
  approvalId?: string;
};

export type AuthorizeRequest = {
  actor: AuthorizeActor;
  workspace: AuthorizeWorkspace;
  /** Stable action name, for example `mcp.call` or `site.publish`. */
  action: string;
  resource?: AuthorizeResource;
  /** When set, `roleCan(actor.role, teamAction)` must pass. A missing role is a deny. */
  teamAction?: TeamAction;
  /** When set, `ENTITLEMENTS[plan][entitlement]` must be on (or greater than zero). */
  entitlement?: keyof Entitlements;
  /** Outbound payload for the firewall. The MCP policy fills this from the stored tool row. */
  outbound?: OutboundAction;
  /** True when the caller wants to run without a person. High-risk firewall verdicts then require approval. */
  intendsAutoSend?: boolean;
  mcpCall?: McpCallSubject;
};

export type AuthorizeDeny = {
  outcome: "deny";
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
  /** Set when the denial is a plan limit, so the caller can rethrow `EntitlementError`. */
  entitlement?: boolean;
  upgradeTo?: PlanId;
  state?: unknown;
};

export type AuthorizeApproval = {
  outcome: "require_approval";
  reasons: string[];
  risk?: Risk;
  message: string;
  state?: unknown;
};

export type Permit = {
  readonly action: string;
  readonly workspaceId: string;
  readonly resourceId: string | null;
  /** Hash of the action's subject. `callTool` recomputes it and refuses a mismatch. */
  readonly binding: string;
};

export type AuthorizeAllow = {
  outcome: "allow";
  permit: Permit;
  state?: unknown;
};

export type AuthorizeDecision = AuthorizeDeny | AuthorizeApproval | AuthorizeAllow;

/** What a policy or a plug-in gate is shown. An allow here has no permit yet. */
export type BuiltInDecision =
  | { outcome: "allow" }
  | { outcome: "require_approval"; reasons: string[]; risk?: Risk; message: string }
  | { outcome: "deny"; status: number; code: string; message: string };

/** Returned by an action policy. `continue` means the shared checks still run. A policy cannot skip the firewall by returning allow. */
export type ActionPolicyResult =
  | { outcome: "continue"; outbound?: OutboundAction; intendsAutoSend?: boolean; state?: unknown; binding?: string }
  | AuthorizeApproval
  | AuthorizeDeny;

export type ActionPolicy = (input: AuthorizeRequest) => Promise<ActionPolicyResult> | ActionPolicyResult;

/**
 * Opinion of a plug-in security gate. `null` and `allow` leave the built-in decision alone.
 * `deny` and `require_approval` can only make it stricter.
 */
export type SecurityGateOpinion =
  | { decision: "allow" }
  | { decision: "deny"; code: string; message: string; status?: number }
  | { decision: "require_approval"; reasons?: string[]; message?: string };

export type SecurityGate = {
  /** Short stable name, logged if the gate throws. Not a secret. */
  name: string;
  evaluate(input: AuthorizeRequest, builtIn: BuiltInDecision): Promise<SecurityGateOpinion | null> | SecurityGateOpinion | null;
};

const ACTION_NAME = /^[a-z][a-z0-9._-]{0,63}$/;
const policies = new Map<string, ActionPolicy>();
const gates: SecurityGate[] = [];
const livePermits = new WeakSet<object>();

/** The message the MCP call path already shows when the firewall will not auto-send. */
export const AUTO_SEND_APPROVAL_MESSAGE = "The AI Firewall rated this call high risk, so it needs your approval before it runs.";

/** Register the checks for one action name. A later registration for the same name replaces the earlier one. */
export function registerActionPolicy(action: string, policy: ActionPolicy): () => void {
  policies.set(action, policy);
  return () => {
    if (policies.get(action) === policy) policies.delete(action);
  };
}

/**
 * Plug a security gate into every `authorize` call. The returned function removes that gate.
 * Gates run in registration order and may only tighten the decision.
 */
export function registerSecurityGate(gate: SecurityGate): () => void {
  gates.push(gate);
  return () => {
    const i = gates.indexOf(gate);
    if (i >= 0) gates.splice(i, 1);
  };
}

/** Binding `callTool` recomputes. Same server URL, tool name and arguments, or the permit does not match. */
export function mcpCallBinding(serverUrl: string, tool: string, args: unknown): string {
  return hashOf({ v: 1, serverUrl, tool, args: args ?? {} });
}

/** True only for a permit `authorize` just issued for this action and binding. */
export function permitMatches(permit: unknown, expect: { action: string; binding: string }): boolean {
  if (!permit || typeof permit !== "object" || !livePermits.has(permit)) return false;
  const p = permit as Permit;
  return p.action === expect.action && p.binding === expect.binding;
}

function cleanId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 200 || /[\u0000-\u001f]/.test(s)) return null;
  return s;
}

function deny(status: number, code: string, message: string, extra?: Pick<AuthorizeDeny, "extra" | "entitlement" | "upgradeTo">): AuthorizeDeny {
  return { outcome: "deny", status, code, message, ...extra };
}

function viewOf(d: AuthorizeDeny | AuthorizeApproval | { outcome: "allow" }): BuiltInDecision {
  if (d.outcome === "allow") return { outcome: "allow" };
  if (d.outcome === "require_approval") return { outcome: "require_approval", reasons: d.reasons, risk: d.risk, message: d.message };
  return { outcome: "deny", status: d.status, code: d.code, message: d.message };
}

function rank(d: { outcome: "allow" | "require_approval" | "deny" }): number {
  if (d.outcome === "deny") return 2;
  if (d.outcome === "require_approval") return 1;
  return 0;
}

function entitlementBlocks(plan: PlanId, key: keyof Entitlements): boolean {
  const value = ENTITLEMENTS[plan][key];
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return !(value > 0);
  return !value;
}

function actorLabel(actor: AuthorizeActor): string {
  if (actor.kind === "owner") return "owner";
  if (actor.kind === "system") return "system";
  if (actor.kind === "chat") return "agent:chat";
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(actor.id) ? `agent:${actor.id}` : "agent";
}

function codeOf(d: AuthorizeDeny | AuthorizeApproval | { outcome: "allow" }): string {
  if (d.outcome === "allow") return "allow";
  if (d.outcome === "require_approval") return "require_approval";
  return d.code;
}

async function record(req: AuthorizeRequest, decision: AuthorizeDeny | AuthorizeApproval | { outcome: "allow" }): Promise<void> {
  const code = codeOf(decision).slice(0, 40);
  const action = (req.action || "unknown").slice(0, 64);
  logEvent(decision.outcome === "allow" ? "info" : "warn", "authorize.decision", {
    action,
    outcome: decision.outcome,
    code,
    actorKind: req.actor?.kind ?? null,
    resource: req.resource?.type?.slice(0, 40) ?? null,
  });
  securityEvent({
    kind: "agent.action",
    code: `authorize.${code}`.slice(0, 60),
    where: `authorize/${action}`.slice(0, 120),
    accountId: req.workspace?.id ?? null,
    status: decision.outcome === "deny" ? decision.status : decision.outcome === "require_approval" ? 403 : 200,
  });
  const workspaceId = cleanId(req.workspace?.id);
  if (!workspaceId) return;
  try {
    const { audit } = await import("@/lib/business/repo");
    await audit(workspaceId, actorLabel(req.actor), "authorize", req.resource?.id?.slice(0, 120), `${decision.outcome} ${action} ${code}`.slice(0, 300));
  } catch (e) {
    logEvent("error", "authorize.audit_failed", { action, name: e instanceof Error ? e.name : "error" });
  }
}

async function applyGates(req: AuthorizeRequest, decision: AuthorizeDeny | AuthorizeApproval | { outcome: "allow" }): Promise<AuthorizeDeny | AuthorizeApproval | { outcome: "allow" }> {
  let current = decision;
  for (const gate of [...gates]) {
    const name = String(gate?.name ?? "gate").replace(/[\u0000-\u001f]/g, "").slice(0, 40) || "gate";
    let opinion: SecurityGateOpinion | null;
    try {
      opinion = await gate.evaluate(req, viewOf(current));
    } catch (e) {
      logEvent("error", "authorize.gate_error", { gate: name, name: e instanceof Error ? e.name : "error" });
      // A gate that throws cannot open something the built-in checks already refused.
      if (current.outcome === "allow" || current.outcome === "require_approval") {
        current = deny(403, "gate_error", "A security gate couldn't complete, so this action was refused.");
      }
      continue;
    }
    if (!opinion || opinion.decision === "allow") continue;
    if (opinion.decision === "require_approval") {
      if (rank(current) >= rank({ outcome: "require_approval" })) continue;
      const reasons = Array.isArray(opinion.reasons) ? opinion.reasons.filter((r): r is string => typeof r === "string").slice(0, 8) : [];
      current = {
        outcome: "require_approval",
        reasons,
        message: typeof opinion.message === "string" && opinion.message.trim() ? opinion.message.replace(/[\u0000-\u001f]/g, " ").slice(0, 300) : "This action needs approval before it runs.",
      };
      continue;
    }
    if (current.outcome === "deny") continue;
    const status = typeof opinion.status === "number" && opinion.status >= 400 && opinion.status <= 499 ? opinion.status : 403;
    const code = typeof opinion.code === "string" && /^[a-z0-9._-]{1,40}$/.test(opinion.code) ? opinion.code : "gate_denied";
    const message = typeof opinion.message === "string" && opinion.message.trim() ? opinion.message.replace(/[\u0000-\u001f]/g, " ").slice(0, 300) : "This action was refused by a security gate.";
    current = deny(status, code, message);
  }
  return current;
}

function sharedChecks(req: AuthorizeRequest, outbound: OutboundAction | undefined, intendsAutoSend: boolean): AuthorizeDeny | AuthorizeApproval | { outcome: "allow" } {
  if (req.teamAction) {
    if (!req.actor.role || !roleCan(req.actor.role, req.teamAction)) return deny(403, "team_forbidden", "You don't have permission to do that.");
  }
  if (req.entitlement && entitlementBlocks(req.workspace.plan, req.entitlement)) {
    return deny(402, "entitlement", "Your plan doesn't include this.", { entitlement: true });
  }
  if (outbound) {
    const verdict = inspectAction(outbound);
    if (verdict.blocked) return deny(422, "firewall_blocked", verdict.blocked);
    if (intendsAutoSend && !verdict.autoSendAllowed) {
      return { outcome: "require_approval", reasons: verdict.reasons, risk: verdict.risk, message: AUTO_SEND_APPROVAL_MESSAGE };
    }
  }
  return { outcome: "allow" };
}

/**
 * Decide one action. Does not replace the session check and does not perform the action.
 * `state` on the result is whatever the action policy attached (the MCP path uses it to keep the loaded tool).
 */
export async function authorize(req: AuthorizeRequest): Promise<AuthorizeDecision> {
  const action = typeof req?.action === "string" ? req.action : "";
  const actorId = cleanId(req?.actor?.id);
  const workspaceId = cleanId(req?.workspace?.id);
  const plan = req?.workspace?.plan;
  if (!ACTION_NAME.test(action) || !actorId || !workspaceId || (plan !== "free" && plan !== "lite" && plan !== "plus" && plan !== "pro" && plan !== "business") || (req.actor.kind !== "owner" && req.actor.kind !== "agent" && req.actor.kind !== "chat" && req.actor.kind !== "system")) {
    const decision = deny(400, "invalid_request", "This action could not be authorized.");
    await record(req ?? { actor: { id: "invalid", kind: "system" }, workspace: { id: "", plan: "free" }, action: action || "invalid" }, decision);
    return decision;
  }

  // Loading the policy module registers it. A caller cannot pass `mcp.call` and skip the MCP steps.
  if (action === "mcp.call") await import("./authorize-mcp");

  let state: unknown;
  let binding = "";
  let outbound = req.outbound;
  let intendsAutoSend = req.intendsAutoSend === true;
  let preliminary: AuthorizeDeny | AuthorizeApproval | null = null;

  const policy = policies.get(action);
  if (policy) {
    const result = await policy(req);
    if (result.outcome === "continue") {
      state = result.state;
      if (result.outbound) outbound = result.outbound;
      if (typeof result.intendsAutoSend === "boolean") intendsAutoSend = result.intendsAutoSend;
      if (typeof result.binding === "string") binding = result.binding;
    } else if (result.outcome === "require_approval") {
      preliminary = { outcome: "require_approval", reasons: result.reasons, risk: result.risk, message: result.message };
    } else {
      preliminary = result;
    }
  }

  let decided: AuthorizeDeny | AuthorizeApproval | { outcome: "allow" } = preliminary ?? sharedChecks(req, outbound, intendsAutoSend);
  decided = await applyGates(req, decided);

  if (decided.outcome === "allow" && action === "mcp.call" && !binding) {
    decided = deny(403, "no_permit", "This call was not authorized.");
  }

  await record(req, decided);

  if (decided.outcome === "allow") {
    const permit: Permit = { action, workspaceId, resourceId: req.resource?.id?.slice(0, 160) ?? null, binding: binding || hashOf({ v: 1, action, workspaceId, resource: req.resource?.id ?? null }) };
    livePermits.add(permit);
    return state === undefined ? { outcome: "allow", permit } : { outcome: "allow", permit, state };
  }
  if (decided.outcome === "require_approval") {
    return state === undefined ? decided : { ...decided, state };
  }
  return state === undefined ? decided : { ...decided, state };
}
