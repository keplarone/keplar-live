# `authorize()` — permission and approval gate

`getSession` answers who is calling. `authorize` answers whether that actor may do this action, must wait for a person, or is refused. It lives in `src/lib/security/authorize.ts`, next to the security event log. It does not replace the session check, and it does not perform the action.

The first caller is the MCP tool path. `runToolCall` in `src/lib/mcp/gateway.ts` calls `authorizeMcpCall` (`src/lib/security/authorize-mcp.ts`), which calls `authorize`. The remote call (`callTool` in `src/lib/mcp/client.ts`) accepts only the permit an allow decision just issued, for that server URL, tool name and arguments. A new tool that imports `callTool` and skips `authorize` never reaches the network.

## Request

```ts
authorize({
  actor: { id: string, kind: "owner" | "agent" | "chat" | "system", role?: TeamRole },
  workspace: { id: string, plan: PlanId },
  action: string, // "mcp.call", "site.publish", ...
  resource?: { type: string, id: string },
  teamAction?: TeamAction,      // roleCan(actor.role, teamAction)
  entitlement?: keyof Entitlements,
  outbound?: OutboundAction,    // AI Firewall
  intendsAutoSend?: boolean,    // high-risk firewall verdict → require_approval
  mcpCall?: McpCallSubject,     // required in practice when action is "mcp.call"
})
```

`actor.id` is a stable id, never an email. `action` matches `^[a-z][a-z0-9._-]{0,63}$`.

## Decision

| Outcome | Meaning |
|---|---|
| `allow` | The action may proceed. The result includes a `permit`. |
| `require_approval` | Do not run it. Queue it for a person. `reasons` and `message` say why. |
| `deny` | Do not run it and do not queue it. `status`, `code` and `message` are safe to show. `entitlement: true` means the caller should throw `EntitlementError` (the MCP path does). |

Built-in checks, after the action policy:

1. **Team role.** If `teamAction` is set, `roleCan` must pass. A missing role is `team_forbidden` (403).
2. **Plan.** If `entitlement` is set, `ENTITLEMENTS[plan]` must be on, or greater than zero for a number. Otherwise `entitlement` (402).
3. **Firewall.** If `outbound` is set, `inspectAction` runs. A blocked payload is `firewall_blocked` (422) and the message is the firewall's own sentence. If `intendsAutoSend` is set and the verdict is not auto-sendable, the decision is `require_approval` with the existing sentence: "The AI Firewall rated this call high risk, so it needs your approval before it runs."
4. **Plug-in gates.** See below. They may only tighten the decision.

An action policy (one per `action` name) runs first. It may deny, require approval, or `continue`. It cannot skip the firewall: there is no policy result that means allow. `registerActionPolicy(action, policy)` replaces the policy for that name. `mcp.call` is registered by `authorize-mcp.ts`, which `authorize` loads itself, so a caller cannot pass `action: "mcp.call"` and skip the MCP steps.

## MCP call, unchanged for the person

`authorizeMcpCall` keeps the previous gateway order and the previous errors:

plan (`assertMcpAllowed`) → tool enabled and schema unchanged → arguments match the stored schema → agents not halted → the `via` claim (an executing approval for these exact arguments, or read + auto-run + grant, or a manual read) → per-agent call and credit budget → the shared firewall.

`callTool` still does the rate limit, concurrency cap, daily cap, credit charge, idempotency receipt and the HTTP call. Those are not the permission decision. Manual writes and chat proposals still queue a `biz_approvals` row in the gateway before anything is sent; this gate is what stops the send.

## Plug-in security gate

Another engineer's gate registers here. It does not wrap `callTool` and it does not replace `authorize`. `keplar-one` pull request 7 was not readable from the environment that added this module (the repository returned 404), so this is the contract that gate implements, or adapts to:

```ts
import { registerSecurityGate, type AuthorizeRequest, type BuiltInDecision, type SecurityGateOpinion } from "@/lib/security/authorize";

registerSecurityGate({
  name: "example", // short, logged if the gate throws; not a secret
  evaluate(input: AuthorizeRequest, builtIn: BuiltInDecision): SecurityGateOpinion | null {
    // null or { decision: "allow" } — no change
    // { decision: "require_approval", reasons?: string[], message?: string }
    // { decision: "deny", code: string, message: string, status?: number }
    return null;
  },
});
```

Rules:

- Deny beats require-approval beats allow. A gate cannot turn a denial or an approval requirement into an allow.
- Gates run in registration order, on every action, including ones the built-in checks already refused. A gate that throws refuses the action only when the current decision was allow or require-approval (`gate_error`, 403). An existing denial keeps its code.
- `evaluate` receives the request, including `mcpCall.args` when this is a tool call. Do not log arguments, prompts, tokens or emails. The gate's own log line records the gate name and the error name only.
- `registerSecurityGate` returns an unregister function.

`BuiltInDecision` is the decision before the permit exists: `allow`, `require_approval` (reasons, optional risk, message) or `deny` (status, code, message).

### Tool-call gate

`registerToolCallSecurityGate` in `src/lib/security/tool-gate.ts` is that plug-in for `mcp.call`. `authorize-mcp.ts` registers it when the MCP policy loads, so it runs with the other gates: after the action policy, the team check, the plan check, and the firewall.

- The scanner, `runSecurityGate`, returns `{ ok, findings }` plus `failAt` and `checksRun`. The registered gate (`toolCallOpinion`) turns that report into `null` or a `deny`. It never returns `allow`. A clean report is `null`, which leaves the built-in decision unchanged.
- `missing-route-auth` applies only to route files (`app/api/**/route.ts`, `pages/api/**`, and the same paths in `.tsx`, `.js`, or `.mjs`) that export a handler and do not call `getSession`, `currentWorkspace`, `mcpOwner`, `requireUser`, `requireAuth`, or `requireOwner`. A tool call is scanned as `mcp-call/<tool>.json` with only `hard-coded-secret` and `unsafe-execution`, so that finding is never raised from tool arguments.
- Severities map by `failAt`, which defaults to `high`. Rank is `low` < `medium` < `high` < `critical`. A finding at `high` or above makes `ok` false, and the tool-call gate turns that into a `deny` (`secret_in_args` or `unsafe_execution`, status 403). A finding below `failAt` changes nothing. The gate never returns `require_approval`.
- If the built-in decision is already `deny`, the gate returns `null`. A secret the firewall already blocked therefore stays `firewall_blocked`.
- The scanner skips a file whose path or contents is not a string, instead of throwing. `JSON.stringify` of the arguments is caught and becomes a `deny` (`unsafe_execution`). The gate does not throw, so `authorize` does not record `gate_error` for it.

## Permit

On allow, `authorize` puts the permit object in a private set and returns it. `permitMatches(permit, { action, binding })` is true only for that object. Copying the fields into a new object does not match. For `mcp.call` the binding is `mcpCallBinding(serverUrl, tool, args)` (a hash). `callTool` recomputes it from the URL, tool and arguments it was given and throws `McpError` kind `forbidden` ("This call was not authorized.") before any request when the permit does not match. The same permit may be reused for the bounded read retries of that one call.

## Logging

Every decision, including a refusal:

- One JSON log line, event `authorize.decision`, level info on allow and warn otherwise. Fields: `action`, `outcome`, `code`, `actorKind`, `resource` type. No arguments, no email, no workspace id.
- One `security_events` row, kind `agent.action`, code `authorize.<code>`, where `authorize/<action>`. The account key is the hashed workspace id. This kind has no owner-alert threshold, so ordinary approval refusals do not page anyone.
- One `biz_audit` row via the existing `audit()` helper, action `authorize`, detail `<outcome> <action> <code>`. If that write fails, the log line is `authorize.audit_failed` and the decision stands.

The MCP path still writes the previous `firewall.blocked` and `mcp.call.needs_approval` audit rows when those are the reason, with the same actor, target and detail as before.

## What this slice does not do

Chat, agents, computer use, publish, checkout and account export still call their own checks. Section 16 of the architecture audit lists them as later callers. They should call `authorize` rather than grow a new copy of these steps. No vendor, plan number, or production table changes here.
