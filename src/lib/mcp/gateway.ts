/**
 * The MCP gateway: the ONLY path from Keplar to a connected app. All enforcement is here, server-side:
 *
 *   owner policy (enabled / risk / auto-run, per-agent grants + budgets)
 *     -> AI Firewall verdict on the arguments -> approval (unless read-only + auto-run allowed)
 *     -> plan limits, rate limit, per-user concurrency, daily cap, credits
 *     -> idempotency receipt -> SSRF-safe call with timeout / bounded retries (reads only) / size cap
 *     -> sanitize + fence the output (untrusted data) -> receipt + audit entry.
 *
 * Authority comes only from stored rows the owner edited and from a pending approval the owner decides. Text returned by a
 * server (descriptions, results, errors) is data: it is never read as policy, never changes a tool's risk, grant or budget.
 */
import { createHash } from "node:crypto";
import { id as newId, now } from "@/lib/create/platform/ids";
import { assertCanSpend, charge, estimateUnits } from "@/lib/create/platform/compute";
import { collection, storeDurable } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { agents, approvals, audit, mcpGrants, mcpOauth, mcpReceipts, mcpServers, mcpTools } from "@/lib/business/repo";
import { inspectAction } from "@/lib/business/firewall";
import type { Agent, Approval, OutboundAction } from "@/lib/business/types";
import { callTool, discoverTools, McpError, type McpTarget } from "./client";
import { openSecret, scrub, sealSecret, secretsAvailable } from "./crypto";
import { DEFAULT_GRANT, MAX_PENDING_MCP_APPROVALS, mcpLimitsFor, OUTPUT_STORE_CHARS, RUNNING_STALE_MS } from "./limits";
import { fenceUntrusted, sanitizeUntrusted } from "./sanitize";
import { hashOf, validateArgs } from "./schema";
import { checkUrl, SsrfError } from "./ssrf";
import { authorizationUrl, discover, exchangeCode, newPkce, newState, OAUTH_TTL_MS, OAuthError, probeChallenge, refreshTokens, registerClient, stateId, tokenExpiresSoon, type OAuthClient, type OAuthTokens } from "./oauth";
import type { McpAuthType, McpGrant, McpReceipt, McpServer, McpTool, McpToolRisk } from "./types";

/** The pseudo-agent id Ask/chat tool calls run under: grants, budgets, halts and receipts treat it like an agent. */
export const CHAT_AGENT = "chat";

export type McpCallAction = Extract<OutboundAction, { type: "mcp.call" }>;

/* ---------- views (never include secretEnc) ---------- */

export function publicServer(s: McpServer) {
  const { secretEnc, ...rest } = s;
  let host = "";
  try {
    host = new URL(s.url).host;
  } catch {
    /* stored URLs were validated; keep going */
  }
  const pendingSignIn = s.status === "connecting" && s.statusKind === "oauth_pending";
  const stale = s.status === "connecting" && Date.now() - Date.parse(s.updatedAt) > (pendingSignIn ? OAUTH_TTL_MS : 60_000);
  const reason = pendingSignIn ? "The sign-in wasn't finished. Start it again." : "The connection attempt didn't finish. Run the test again.";
  return { ...rest, host, hasSecret: Boolean(secretEnc), ...(stale ? { status: "failed" as const, statusKind: pendingSignIn ? "oauth_expired" : "timeout", statusReason: reason } : {}) };
}

/* ---------- plan + store gates ---------- */

export function assertMcpAllowed(ws: Workspace) {
  const limits = mcpLimitsFor(ws.plan);
  if (limits.servers === 0) throw new EntitlementError("Connected apps are available on Plus and up.", "plus");
  if (ws.anonymous || !ws.userId) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  if (!ws.verified && !ws.admin) throw new HttpError(403, "Verify your email address to connect apps.", "unverified");
  if (!storeDurable()) throw new HttpError(503, "Connected apps need Keplar's database, which isn't set up on this server yet.", "not_configured");
  return limits;
}

/* ---------- input validation ---------- */

const HEADER_DENY = new Set(["host", "content-length", "content-type", "accept", "accept-encoding", "transfer-encoding", "connection", "cookie", "set-cookie", "upgrade", "te", "trailer", "proxy-authorization", "mcp-session-id", "mcp-protocol-version", "user-agent", "origin", "referer", "location", "expect"]);

function cleanName(v: unknown): string {
  const s = sanitizeUntrusted(typeof v === "string" ? v : "", { maxChars: 60 }).text.replace(/\s+/g, " ").trim();
  if (!s) throw new HttpError(400, "Give the connection a name.");
  return s;
}
function cleanSecret(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, "Enter the token or API key.");
  const s = v.trim();
  if (s.length > 2048 || /[^\x21-\x7e ]/.test(s)) throw new HttpError(400, "That token contains characters that can't be sent in a header.");
  return s.replace(/^bearer\s+/i, "");
}
function cleanHeader(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(v.trim()) || HEADER_DENY.has(v.trim().toLowerCase())) throw new HttpError(400, "Enter a valid header name, like X-API-Key.");
  return v.trim();
}
function cleanUrl(v: unknown): string {
  try {
    const u = checkUrl(typeof v === "string" ? v.trim() : "");
    // The address is stored and shown in clear text, so credentials must go in the (encrypted) token field.
    for (const k of u.searchParams.keys()) if (/token|key|secret|auth|passw|sig|bearer|jwt|credential/i.test(k)) throw new SsrfError("Put the token or API key in the token field, not in the address.", "invalid_url");
    return u.toString();
  } catch (e) {
    throw new HttpError(400, e instanceof SsrfError ? e.message : "Enter a valid server address.", "invalid_url");
  }
}

/* ---------- servers ---------- */

const toolId = (serverId: string, name: string) => `mt_${createHash("sha256").update(`${serverId}|${name}`).digest("hex").slice(0, 20)}`;

export function targetFor(s: McpServer): McpTarget {
  if (s.authType === "oauth") throw new McpError("Sign in again to use this connection.", "auth");
  if (s.authType === "none") return { url: s.url, headers: {}, secretHeaders: [] };
  const secret = openSecret(s.secretEnc, s.workspaceId, s.id);
  if (!secret) throw new McpError("The stored credential can't be read. Enter it again.", "auth");
  if (s.authType === "bearer") return { url: s.url, headers: { authorization: `Bearer ${secret}` }, secretHeaders: ["authorization"], secret };
  const h = (s.headerName ?? "X-API-Key").toLowerCase();
  return { url: s.url, headers: { [h]: secret }, secretHeaders: [h], secret };
}

/* ---------- OAuth (BETA): tokens are sealed in the server row; refreshed on demand ---------- */

function openTokens(s: McpServer): OAuthTokens | null {
  const raw = openSecret(s.secretEnc, s.workspaceId, s.id);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as OAuthTokens;
    return t && t.v === 1 && typeof t.accessToken === "string" ? t : null;
  } catch {
    return null;
  }
}
const refreshing = new Map<string, Promise<OAuthTokens>>();

/** A usable access token: refreshed when it is about to expire (or when `force`, after a 401). One refresh at a time per connection. */
async function freshTokens(ws: Workspace, serverId: string, force = false): Promise<OAuthTokens> {
  const s = await mcpServers().get(ws.id, serverId);
  const cur = s ? openTokens(s) : null;
  if (!s || !cur) throw new McpError("Sign in again to use this connection.", "auth");
  if (!force && !tokenExpiresSoon(cur)) return cur;
  const key = `${ws.id}:${s.id}`;
  const inflight = refreshing.get(key);
  if (inflight) return inflight;
  const job = (async () => {
    try {
      const next = await refreshTokens(cur);
      await mcpServers().update(ws.id, s.id, { secretEnc: sealSecret(JSON.stringify(next), ws.id, s.id), updatedAt: now() });
      await audit(ws.id, "owner", "mcp.oauth.refreshed", s.id);
      return next;
    } catch (e) {
      const err = e instanceof OAuthError ? e : new OAuthError("Couldn't renew the sign-in.", "network");
      // Only a definite "expired / revoked" answer makes the connection need a new sign-in; a network blip doesn't.
      if (err.kind === "expired" || err.kind === "token") {
        await mcpServers().update(ws.id, s.id, { status: "failed", statusKind: "oauth_reauth", statusReason: "Sign in again: the app no longer accepts the saved sign-in.", updatedAt: now() });
        await audit(ws.id, "owner", "mcp.oauth.reauth_needed", s.id, err.kind);
      }
      throw new McpError(err.message, err.kind === "network" || err.kind === "blocked" ? "network" : "auth");
    } finally {
      refreshing.delete(key);
    }
  })();
  refreshing.set(key, job);
  return job;
}

/** The request target for a connection (async because an OAuth token may need renewing). */
export async function targetForServer(ws: Workspace, s: McpServer, opts: { forceRefresh?: boolean } = {}): Promise<McpTarget> {
  if (s.authType !== "oauth") return targetFor(s);
  const t = await freshTokens(ws, s.id, opts.forceRefresh);
  return { url: s.url, headers: { authorization: `Bearer ${t.accessToken}` }, secretHeaders: ["authorization"], secret: t.accessToken };
}

async function failOAuth(ws: Workspace, serverId: string, e: unknown) {
  const err = e instanceof OAuthError ? e : new OAuthError("Couldn't start the sign-in.", "network");
  await mcpServers().update(ws.id, serverId, { status: "failed", statusKind: err.kind === "unsupported" ? "oauth_unsupported" : "oauth_failed", statusReason: err.message, updatedAt: now(), lastCheckedAt: now() });
  await audit(ws.id, "owner", "mcp.oauth.failed", serverId, `${err.kind}: ${err.message}`.slice(0, 300));
  return err;
}

/** Begin the sign-in for a connection: discovery, client registration, PKCE. Returns where to send the browser. */
export async function startOAuth(ws: Workspace, serverId: string) {
  assertMcpAllowed(ws);
  if (!secretsAvailable()) throw new HttpError(503, "Saving credentials isn't set up on this server yet (BETTER_AUTH_SECRET).", "not_configured");
  const s = await mcpServers().get(ws.id, serverId);
  if (!s) throw new HttpError(404, "Connection not found.");
  if (s.authType === "bearer" || s.authType === "header") throw new HttpError(400, "This connection uses a token or API key. Remove it and add it again to use OAuth.");
  await rateLimit(`mcp:oauth:${ws.id}`, 6, 60, { shared: true });
  try {
    const probe = await probeChallenge(s.url);
    if (!probe.needsAuth) throw new OAuthError("This server didn't ask for sign-in. Run Test connection instead.", "unsupported");
    const meta = await discover(s.url, probe.www);
    const client: OAuthClient = await registerClient(meta);
    const { verifier, challenge } = newPkce();
    const state = newState();
    const pid = stateId(state);
    // Keep the pending list small: expired ones and earlier attempts for this connection go.
    for (const old of await mcpOauth().list(ws.id)) if (old.serverId === s.id || Date.parse(old.expiresAt) < Date.now()) await mcpOauth().remove(ws.id, old.id);
    if ((await mcpOauth().list(ws.id)).length >= 5) throw new HttpError(429, "Too many sign-ins are waiting. Finish or wait a few minutes.", "too_many_pending");
    const payload = { verifier, client, tokenEndpoint: meta.tokenEndpoint, issuer: meta.issuer, resource: meta.resource };
    await mcpOauth().insert({ id: pid, workspaceId: ws.id, serverId: s.id, payloadEnc: sealSecret(JSON.stringify(payload), ws.id, pid), createdAt: now(), expiresAt: new Date(Date.now() + OAUTH_TTL_MS).toISOString() });
    await mcpServers().update(ws.id, s.id, { authType: "oauth", secretEnc: null, status: "connecting", statusKind: "oauth_pending", statusReason: `Waiting for you to finish signing in at ${new URL(meta.authorizationEndpoint).host}.`, updatedAt: now() });
    await audit(ws.id, "owner", "mcp.oauth.started", s.id, `issuer ${new URL(meta.issuer).host}`);
    return { authorizationUrl: authorizationUrl(meta, client, state, challenge), expiresInSec: Math.floor(OAUTH_TTL_MS / 1000) };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const err = await failOAuth(ws, s.id, e);
    throw new HttpError(err.kind === "unsupported" || err.kind === "discovery" || err.kind === "registration" ? 422 : 502, err.message, `oauth_${err.kind}`);
  }
}

/** Add a connection that signs in with OAuth. Returns the connection and where to send the browser. */
export async function addOAuthServer(ws: Workspace, input: { name?: unknown; url?: unknown }) {
  const limits = assertMcpAllowed(ws);
  if (!secretsAvailable()) throw new HttpError(503, "Saving credentials isn't set up on this server yet (BETTER_AUTH_SECRET).", "not_configured");
  const name = cleanName(input.name);
  const url = cleanUrl(input.url);
  await rateLimit(`mcp:add:${ws.id}`, 10, 60, { shared: true });
  const existing = await mcpServers().list(ws.id);
  if (existing.length >= limits.servers) throw new EntitlementError(`Your plan includes ${limits.servers} connected app${limits.servers === 1 ? "" : "s"}.`, ws.plan === "plus" ? "pro" : "business");
  if (existing.some((x) => x.url === url)) throw new HttpError(409, "That server is already connected.", "duplicate");
  const t = now();
  const row: McpServer = { id: newId("mcp"), workspaceId: ws.id, name, url, authType: "oauth", secretEnc: null, status: "connecting", statusKind: "oauth_pending", toolCount: 0, rejectedTools: 0, truncatedTools: false, createdAt: t, updatedAt: t, lastCheckedAt: null };
  await mcpServers().insert(row);
  await audit(ws.id, "owner", "mcp.server.added", row.id, `${name} (${new URL(url).host}), auth: oauth`);
  try {
    const r = await startOAuth(ws, row.id);
    return { server: publicServer((await mcpServers().get(ws.id, row.id)) as McpServer), authorizationUrl: r.authorizationUrl };
  } catch (e) {
    // The connection stays, failed, with the reason shown; the owner can remove it or retry.
    if (e instanceof HttpError) return { server: publicServer((await mcpServers().get(ws.id, row.id)) as McpServer), authorizationUrl: null, error: e.message };
    throw e;
  }
}

export type OAuthOutcome = { ok: boolean; reason: "ok" | "denied" | "state" | "failed"; serverId?: string };

/** The browser came back with ?code&state. Bound to the signed-in workspace; single use; verified; then the tools are listed. */
export async function completeOAuth(ws: Workspace, q: { state?: string | null; code?: string | null; error?: string | null; iss?: string | null }): Promise<OAuthOutcome> {
  assertMcpAllowed(ws);
  if (!q.state || q.state.length > 200) return { ok: false, reason: "state" };
  const pid = stateId(q.state);
  const row = await mcpOauth().get(ws.id, pid);
  if (!row || Date.parse(row.expiresAt) < Date.now()) {
    if (row) await mcpOauth().remove(ws.id, pid);
    return { ok: false, reason: "state" };
  }
  await mcpOauth().remove(ws.id, pid); // single use, whatever happens next
  const raw = openSecret(row.payloadEnc, ws.id, pid);
  const s = await mcpServers().get(ws.id, row.serverId);
  if (!raw || !s) return { ok: false, reason: "state" };
  const p = JSON.parse(raw) as { verifier: string; client: OAuthClient; tokenEndpoint: string; issuer: string; resource: string };
  if (q.iss && q.iss.replace(/\/+$/, "") !== p.issuer.replace(/\/+$/, "")) {
    await failOAuth(ws, s.id, new OAuthError("The sign-in response came from a different server than expected, so it was refused.", "state"));
    return { ok: false, reason: "state", serverId: s.id };
  }
  if (q.error || !q.code) {
    await mcpServers().update(ws.id, s.id, { status: "failed", statusKind: "oauth_denied", statusReason: "Access wasn't granted. Sign in again to connect.", updatedAt: now(), lastCheckedAt: now() });
    await audit(ws.id, "owner", "mcp.oauth.denied", s.id);
    return { ok: false, reason: "denied", serverId: s.id };
  }
  try {
    const tokens = await exchangeCode({ client: p.client, tokenEndpoint: p.tokenEndpoint, resource: p.resource, issuer: p.issuer }, q.code, p.verifier);
    await mcpServers().update(ws.id, s.id, { authType: "oauth", secretEnc: sealSecret(JSON.stringify(tokens), ws.id, s.id), updatedAt: now() });
    await audit(ws.id, "owner", "mcp.oauth.connected", s.id, `issuer ${new URL(p.issuer).host}${tokens.refreshToken ? ", refresh token stored" : ", no refresh token"}`);
  } catch (e) {
    await failOAuth(ws, s.id, e);
    return { ok: false, reason: "failed", serverId: s.id };
  }
  const result = await refreshServer(ws, s.id, { skipLimit: true });
  return { ok: result.status === "connected", reason: result.status === "connected" ? "ok" : "failed", serverId: s.id };
}

export async function addServer(ws: Workspace, input: { name?: unknown; url?: unknown; authType?: unknown; secret?: unknown; headerName?: unknown }) {
  const limits = assertMcpAllowed(ws);
  const authType: McpAuthType = input.authType === "bearer" || input.authType === "header" ? input.authType : "none";
  if (input.authType === "oauth") throw new HttpError(400, "Use the OAuth sign-in flow for this connection.", "use_oauth");
  if (input.authType !== undefined && input.authType !== "none" && authType === "none") throw new HttpError(400, "Unknown sign-in type.");
  const name = cleanName(input.name);
  const url = cleanUrl(input.url);
  const secret = authType === "none" ? null : cleanSecret(input.secret);
  const headerName = authType === "header" ? cleanHeader(input.headerName) : undefined;
  if (secret && !secretsAvailable()) throw new HttpError(503, "Saving credentials isn't set up on this server yet (BETTER_AUTH_SECRET).", "not_configured");
  await rateLimit(`mcp:add:${ws.id}`, 10, 60, { shared: true });
  const existing = await mcpServers().list(ws.id);
  if (existing.length >= limits.servers) throw new EntitlementError(`Your plan includes ${limits.servers} connected app${limits.servers === 1 ? "" : "s"}.`, ws.plan === "plus" ? "pro" : "business");
  if (existing.some((s) => s.url === url)) throw new HttpError(409, "That server is already connected.", "duplicate");
  const t = now();
  const row: McpServer = { id: newId("mcp"), workspaceId: ws.id, name, url, authType, headerName, secretEnc: null, status: "connecting", toolCount: 0, rejectedTools: 0, truncatedTools: false, createdAt: t, updatedAt: t, lastCheckedAt: null };
  if (secret) row.secretEnc = sealSecret(secret, ws.id, row.id);
  await mcpServers().insert(row);
  await audit(ws.id, "owner", "mcp.server.added", row.id, `${name} (${new URL(url).host}), auth: ${authType}`);
  return refreshServer(ws, row.id, { skipLimit: true });
}

/** Connect, handshake and list tools. Merges with what the owner already configured; a changed tool must be re-reviewed. */
export async function refreshServer(ws: Workspace, serverId: string, opts: { skipLimit?: boolean } = {}) {
  assertMcpAllowed(ws);
  const s = await mcpServers().get(ws.id, serverId);
  if (!s) throw new HttpError(404, "Connection not found.");
  if (!opts.skipLimit) await rateLimit(`mcp:test:${ws.id}`, 12, 60, { shared: true });
  await mcpServers().update(ws.id, s.id, { status: "connecting", updatedAt: now() });
  let target: McpTarget | null = null;
  try {
    target = await targetForServer(ws, s);
    const d = await discoverTools(target);
    const existing = await mcpTools().list(ws.id, (t) => t.serverId === s.id);
    const byId = new Map(existing.map((t) => [t.id, t]));
    const keep = new Set<string>();
    const t = now();
    for (const def of d.tools) {
      const tid = toolId(s.id, def.name);
      keep.add(tid);
      const prev = byId.get(tid);
      if (!prev) {
        await mcpTools().insert({ id: tid, workspaceId: ws.id, serverId: s.id, name: def.name, description: def.description, descriptionFlagged: def.descriptionFlagged, inputSchema: def.inputSchema, serverHints: def.serverHints, schemaHash: def.schemaHash, enabled: false, risk: "unknown", autoRun: false, schemaChanged: false, discoveredAt: t, updatedAt: t });
      } else if (prev.schemaHash !== def.schemaHash) {
        // The server changed a tool the owner may have reviewed ("rug pull"): switch it off and require a fresh decision.
        await mcpTools().update(ws.id, tid, { description: def.description, descriptionFlagged: def.descriptionFlagged, inputSchema: def.inputSchema, serverHints: def.serverHints, schemaHash: def.schemaHash, enabled: false, autoRun: false, schemaChanged: true, updatedAt: t });
      } else if (prev.description !== def.description) {
        await mcpTools().update(ws.id, tid, { description: def.description, descriptionFlagged: def.descriptionFlagged, serverHints: def.serverHints, updatedAt: t });
      }
    }
    for (const prev of existing) if (!keep.has(prev.id)) await mcpTools().remove(ws.id, prev.id);
    const row = await mcpServers().update(ws.id, s.id, { status: "connected", statusKind: undefined, statusReason: undefined, serverName: d.serverInfo?.name, serverVersion: d.serverInfo?.version, toolCount: d.tools.length, rejectedTools: d.rejected.length, truncatedTools: d.truncated, lastCheckedAt: t, updatedAt: t });
    await audit(ws.id, "owner", "mcp.server.tested", s.id, `connected, ${d.tools.length} tools${d.rejected.length ? `, ${d.rejected.length} rejected` : ""}`);
    return publicServer(row as McpServer);
  } catch (e) {
    const err = e instanceof McpError ? e : new McpError("Couldn't connect to the server.", "network");
    const reauth = s.authType === "oauth" && err.kind === "auth";
    const reason = reauth ? "Sign in again: the app no longer accepts the saved sign-in." : scrub(err.message, target?.secret);
    const row = await mcpServers().update(ws.id, s.id, { status: "failed", statusKind: reauth ? "oauth_reauth" : err.kind, statusReason: reason, lastCheckedAt: now(), updatedAt: now() });
    await audit(ws.id, "owner", "mcp.server.failed", s.id, `${err.kind}: ${reason}`.slice(0, 300));
    return publicServer(row as McpServer);
  }
}

export async function rotateSecret(ws: Workspace, serverId: string, input: { name?: unknown; secret?: unknown; headerName?: unknown }) {
  assertMcpAllowed(ws);
  const s = await mcpServers().get(ws.id, serverId);
  if (!s) throw new HttpError(404, "Connection not found.");
  const patch: Partial<McpServer> = { updatedAt: now() };
  if (input.name !== undefined) patch.name = cleanName(input.name);
  if (input.secret !== undefined) {
    if (s.authType === "none") throw new HttpError(400, "This connection has no credential to change.");
    if (s.authType === "oauth") throw new HttpError(400, "This connection signs in with OAuth. Use Sign in again instead.");
    if (!secretsAvailable()) throw new HttpError(503, "Saving credentials isn't set up on this server yet.", "not_configured");
    patch.secretEnc = sealSecret(cleanSecret(input.secret), ws.id, s.id);
    if (s.authType === "header" && input.headerName !== undefined) patch.headerName = cleanHeader(input.headerName);
  }
  const row = await mcpServers().update(ws.id, s.id, patch);
  await audit(ws.id, "owner", input.secret !== undefined ? "mcp.server.credential_replaced" : "mcp.server.renamed", s.id);
  return publicServer(row as McpServer);
}

export async function removeServer(ws: Workspace, serverId: string) {
  const s = await mcpServers().get(ws.id, serverId);
  if (!s) return false;
  for (const t of await mcpTools().list(ws.id, (x) => x.serverId === serverId)) await mcpTools().remove(ws.id, t.id);
  for (const g of await mcpGrants().list(ws.id, (x) => x.serverId === serverId)) await mcpGrants().remove(ws.id, g.id);
  for (const a of await approvals().list(ws.id, (x) => x.status === "pending" && x.action.type === "mcp.call" && x.action.serverId === serverId)) {
    await approvals().update(ws.id, a.id, { status: "cancelled", decidedAt: now(), result: "Connection removed" });
  }
  // Agents that were set up to use this server can no longer run it.
  for (const a of await agents().list(ws.id, (x) => x.mcp?.serverId === serverId && x.status !== "killed")) await agents().update(ws.id, a.id, { status: "paused" });
  for (const o of await mcpOauth().list(ws.id, (x) => x.serverId === serverId)) await mcpOauth().remove(ws.id, o.id);
  await mcpServers().remove(ws.id, serverId);
  await audit(ws.id, "owner", "mcp.server.removed", serverId, s.name);
  return true;
}

/* ---------- tool policy ---------- */

export async function updateTool(ws: Workspace, serverId: string, toolRowId: string, patch: { enabled?: unknown; risk?: unknown; autoRun?: unknown }) {
  assertMcpAllowed(ws);
  const t = await mcpTools().get(ws.id, toolRowId);
  if (!t || t.serverId !== serverId) throw new HttpError(404, "Tool not found.");
  const next: Partial<McpTool> = { updatedAt: now() };
  if (patch.risk !== undefined) {
    if (patch.risk !== "read" && patch.risk !== "write" && patch.risk !== "unknown") throw new HttpError(400, "Risk must be read, write or unknown.");
    next.risk = patch.risk as McpToolRisk;
    if (patch.risk !== "read") next.autoRun = false;
  }
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== "boolean") throw new HttpError(400, "enabled must be true or false.");
    next.enabled = patch.enabled;
    if (patch.enabled) next.schemaChanged = false; // enabling is the owner's fresh review of the current definition
    else next.autoRun = false;
  }
  if (patch.autoRun !== undefined) {
    if (typeof patch.autoRun !== "boolean") throw new HttpError(400, "autoRun must be true or false.");
    const risk = next.risk ?? t.risk;
    if (patch.autoRun && risk !== "read") throw new HttpError(400, "Only tools you marked read-only can run without approval.", "auto_run_needs_read");
    if (patch.autoRun && !(next.enabled ?? t.enabled)) throw new HttpError(400, "Enable the tool first.");
    next.autoRun = patch.autoRun;
  }
  const row = await mcpTools().update(ws.id, t.id, next);
  await audit(ws.id, "owner", "mcp.tool.updated", `${serverId}/${t.name}`, JSON.stringify({ enabled: next.enabled, risk: next.risk, autoRun: next.autoRun }));
  return row as McpTool;
}

async function saveGrant(g: McpGrant) {
  if (await mcpGrants().get(g.workspaceId, g.id)) await mcpGrants().update(g.workspaceId, g.id, g);
  else await mcpGrants().insert(g);
}

export async function setGrant(ws: Workspace, serverId: string, agentId: string, input: { tools?: unknown; maxCallsPerDay?: unknown; maxUnitsPerMonth?: unknown }) {
  assertMcpAllowed(ws);
  const s = await mcpServers().get(ws.id, serverId);
  // "chat" is Ask's own principal (not an agent row): the owner grants it tools and budgets the same way as an agent.
  const a = agentId === CHAT_AGENT ? { status: "active" } : await agents().get(ws.id, agentId);
  if (!s || !a || a.status === "killed") throw new HttpError(404, "Connection or agent not found.");
  const names = new Set((await mcpTools().list(ws.id, (t) => t.serverId === serverId)).map((t) => t.name));
  const tools = Array.isArray(input.tools) ? [...new Set(input.tools.filter((x): x is string => typeof x === "string" && names.has(x)))] : [];
  const num = (v: unknown, d: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : d);
  const g: McpGrant = { id: `${agentId}:${serverId}`, workspaceId: ws.id, agentId, serverId, tools, maxCallsPerDay: num(input.maxCallsPerDay, DEFAULT_GRANT.maxCallsPerDay, 1000), maxUnitsPerMonth: num(input.maxUnitsPerMonth, DEFAULT_GRANT.maxUnitsPerMonth, 100_000), updatedAt: now() };
  await saveGrant(g);
  await audit(ws.id, "owner", "mcp.grant.set", `${agentId}/${serverId}`, `${tools.length} tools, ${g.maxCallsPerDay}/day, ${g.maxUnitsPerMonth} credits/month`);
  return g;
}

/* ---------- chat policy ---------- */

type ChatSettings = { id: string; workspaceId: string; agentsHalted?: boolean; haltedAt?: string | null; mcpChatAutoRun?: boolean };
const bizSettings = () => collection<ChatSettings>("biz_settings");

/** Account-wide switch: may Ask run read-only tools you marked auto-run without asking? Default off. */
export async function chatAutoRunAllowed(workspaceId: string): Promise<boolean> {
  return (await bizSettings().get(workspaceId, "settings"))?.mcpChatAutoRun === true;
}
export async function setChatAutoRun(ws: Workspace, on: boolean) {
  assertMcpAllowed(ws);
  const cur = await bizSettings().get(ws.id, "settings");
  if (cur) await bizSettings().update(ws.id, "settings", { mcpChatAutoRun: on });
  else await bizSettings().insert({ id: "settings", workspaceId: ws.id, agentsHalted: false, haltedAt: null, mcpChatAutoRun: on });
  await audit(ws.id, "owner", "mcp.chat.autorun", "workspace", on ? "on" : "off");
  return on;
}

/* ---------- calling ---------- */

const argsHash = (args: unknown) => hashOf(args ?? {});
function argsPreview(args: unknown): string {
  const s = sanitizeUntrusted(JSON.stringify(args ?? {}) ?? "{}", { maxChars: 300 });
  return s.text;
}

const localInflight = new Map<string, number>();
const dayStart = () => now().slice(0, 10);

type Loaded = { server: McpServer; tool: McpTool };
async function load(ws: Workspace, serverId: string, toolName: string): Promise<Loaded> {
  const server = await mcpServers().get(ws.id, serverId);
  if (!server) throw new HttpError(404, "Connection not found.", "no_server");
  if (server.status === "failed" && server.statusKind === "blocked") throw new HttpError(409, "This connection is blocked.", "server_blocked");
  const tool = (await mcpTools().list(ws.id, (t) => t.serverId === serverId && t.name === toolName))[0];
  if (!tool) throw new HttpError(404, "That tool isn't available on this connection.", "no_tool");
  if (!tool.enabled) throw new HttpError(403, "That tool is turned off.", "tool_disabled");
  if (tool.schemaChanged) throw new HttpError(409, "The server changed this tool. Review it and turn it on again.", "needs_review");
  return { server, tool };
}

async function grantCheck(ws: Workspace, agentId: string, loaded: Loaded) {
  const g = await mcpGrants().get(ws.id, `${agentId}:${loaded.server.id}`);
  if (!g || !g.tools.includes(loaded.tool.name)) throw new HttpError(403, "This agent isn't allowed to use that tool.", "no_grant");
  const receipts = await mcpReceipts().list(ws.id, (r) => r.agentId === agentId && r.serverId === loaded.server.id && r.status !== "failed");
  const today = receipts.filter((r) => r.startedAt.startsWith(dayStart())).length;
  if (today >= g.maxCallsPerDay) throw new HttpError(429, "This agent used its calls for today on this connection.", "grant_calls");
  const month = receipts.filter((r) => r.startedAt >= ws.period.start).reduce((n, r) => n + r.units, 0);
  if (month + estimateUnits("mcp.call") > g.maxUnitsPerMonth) throw new HttpError(402, "This agent used its monthly credit budget for this connection.", "grant_units");
}

async function haltedCheck(ws: Workspace) {
  const st = await collection<{ id: string; workspaceId: string; agentsHalted: boolean }>("biz_settings").get(ws.id, "settings");
  if (st?.agentsHalted) throw new HttpError(409, "All agents are halted. Resume them first.", "halted");
}

export function buildAction(loaded: Loaded, args: Record<string, unknown>, idempotencyKey: string): McpCallAction {
  return { type: "mcp.call", connector: "mcp", serverId: loaded.server.id, serverName: loaded.server.name, tool: loaded.tool.name, args, toolRisk: loaded.tool.risk, idempotencyKey };
}

function assertArgs(tool: McpTool, args: unknown): Record<string, unknown> {
  const problems = validateArgs(tool.inputSchema, args);
  if (problems.length) throw new HttpError(422, `The arguments don't match the tool's schema: ${problems.join("; ")}.`, "invalid_args", { problems });
  return args as Record<string, unknown>;
}

/** Everything an agent action needs to pass before it may even be queued. Returns the action stamped with the tool's current risk. */
export async function preflightAgentAction(ws: Workspace, agentId: string, action: McpCallAction): Promise<{ ok: true; action: McpCallAction; autoRun: boolean } | { ok: false; reason: string }> {
  try {
    assertMcpAllowed(ws);
    const loaded = await load(ws, action.serverId, action.tool);
    await grantCheck(ws, agentId, loaded);
    assertArgs(loaded.tool, action.args);
    return { ok: true, action: buildAction(loaded, action.args, action.idempotencyKey), autoRun: loaded.tool.risk === "read" && loaded.tool.autoRun };
  } catch (e) {
    return { ok: false, reason: e instanceof HttpError || e instanceof EntitlementError ? e.message : "The connected app isn't available." };
  }
}

export type CallVia = "approval" | "auto" | "manual";
export type CallResult = { receiptId: string; status: "ok" | "tool_error"; summary: string; output: string; truncated: boolean; replayed: boolean; units: number; durationMs: number };

function summaryOf(r: McpReceipt): string {
  const preview = (r.output ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  return `${r.status === "ok" ? "Ran" : "The tool reported an error for"} ${r.tool} on ${r.serverName} in ${r.durationMs} ms (${r.bytes} bytes${r.truncated ? ", shortened" : ""}). Receipt ${r.id}.${preview ? ` Output (untrusted): ${preview}` : ""}`;
}
function resultOf(r: McpReceipt, replayed: boolean): CallResult {
  return { receiptId: r.id, status: r.status === "ok" ? "ok" : "tool_error", summary: summaryOf(r), output: fenceUntrusted(r.output ?? "", { server: r.serverName, tool: r.tool }), truncated: r.truncated, replayed, units: r.units, durationMs: r.durationMs };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one tool call. `via` states the authority being claimed; each claim is verified here against stored state:
 *  - approval: a pending approval for this exact server/tool/arguments exists (the owner just decided it)
 *  - auto: tool is read-only AND auto-run AND the agent has a grant (with budget left)
 *  - manual: the signed-in owner pressed Run on a read-only tool
 */
export async function runToolCall(ws: Workspace, req: { serverId: string; tool: string; args: Record<string, unknown>; idempotencyKey: string; agentId: string | null; via: CallVia; approvalId?: string }): Promise<CallResult> {
  const limits = assertMcpAllowed(ws);
  const loaded = await load(ws, req.serverId, req.tool);
  const { server, tool } = loaded;
  const args = assertArgs(tool, req.args);
  const agentId = req.agentId && req.agentId !== "owner" ? req.agentId : null;
  if (agentId) await haltedCheck(ws);

  if (req.via === "approval") {
    const ap = req.approvalId ? await approvals().get(ws.id, req.approvalId) : null;
    const a = ap?.action;
    if (!ap || ap.status !== "pending" || a?.type !== "mcp.call" || a.serverId !== server.id || a.tool !== tool.name || argsHash(a.args) !== argsHash(args)) throw new HttpError(403, "No matching approval for this call.", "no_approval");
  } else if (req.via === "auto") {
    if (tool.risk !== "read" || !tool.autoRun) throw new HttpError(403, "This tool needs your approval before it runs.", "needs_approval");
    if (!agentId) throw new HttpError(403, "This tool needs your approval before it runs.", "needs_approval");
    if (agentId === CHAT_AGENT && !(await chatAutoRunAllowed(ws.id))) throw new HttpError(403, "Ask isn't set to run tools without asking.", "needs_approval");
  } else if (tool.risk !== "read") throw new HttpError(403, "This tool needs your approval before it runs.", "needs_approval");
  if (agentId) await grantCheck(ws, agentId, loaded);

  // The firewall judges the arguments again at execution time (secrets, injection phrases, raw-IP links...).
  const verdict = inspectAction(buildAction(loaded, args, req.idempotencyKey));
  if (verdict.blocked) {
    await audit(ws.id, agentId ? `agent:${agentId}` : "owner", "firewall.blocked", `${server.id}/${tool.name}`, verdict.blocked);
    throw new HttpError(422, verdict.blocked, "firewall_blocked");
  }

  const actor = agentId ? `agent:${agentId}` : "owner";
  const rid = `mcr_${createHash("sha256").update(`${ws.id}|${server.id}|${tool.name}|${req.idempotencyKey}`).digest("hex").slice(0, 24)}`;
  const base: McpReceipt = { id: rid, workspaceId: ws.id, serverId: server.id, serverName: server.name, tool: tool.name, actor, agentId, via: req.via, approvalId: req.approvalId, argsHash: argsHash(args), argsPreview: argsPreview(args), status: "running", startedAt: now(), endedAt: null, durationMs: 0, attempts: 0, bytes: 0, truncated: false, removedLines: 0, units: 0 };

  // Idempotency: the same key never calls the server twice. A finished call is replayed from its receipt.
  const first = await mcpReceipts().insertIfAbsent(base);
  if (!first.inserted) {
    const r = first.row;
    if (r.status === "ok" || r.status === "tool_error") return resultOf(r, true);
    const stale = Date.now() - Date.parse(r.startedAt) > RUNNING_STALE_MS;
    if (r.status === "running" && !stale) throw new HttpError(409, "This call is already running.", "in_progress");
    if (tool.risk !== "read") throw new HttpError(409, "An earlier attempt of this call didn't finish and its outcome is unknown. Check the other service, then start a new call.", "outcome_unknown");
    await mcpReceipts().update(ws.id, rid, { status: "running", startedAt: now(), endedAt: null, error: undefined });
  }
  const fail = async (e: unknown, attempts: number, t0: number) => {
    const msg = e instanceof McpError ? scrub(e.message, null) : e instanceof HttpError || e instanceof EntitlementError ? e.message : "The call failed.";
    await mcpReceipts().update(ws.id, rid, { status: "failed", error: msg.slice(0, 300), endedAt: now(), durationMs: Date.now() - t0, attempts });
    await audit(ws.id, actor, "mcp.call.failed", `${server.id}/${tool.name}`, `${msg.slice(0, 200)} receipt=${rid}`);
  };

  const t0 = Date.now();
  let target: McpTarget | null = null;
  const held = (localInflight.get(ws.id) ?? 0) + 1;
  localInflight.set(ws.id, held);
  try {
    try {
      await rateLimit(`mcp:call:${ws.id}`, limits.callsPerMin, 60, { shared: true });
      const recent = await mcpReceipts().list(ws.id, (r) => r.id !== rid && (r.status === "running" && Date.now() - Date.parse(r.startedAt) < RUNNING_STALE_MS));
      if (Math.max(recent.length + 1, held) > limits.concurrent) throw new HttpError(429, `Only ${limits.concurrent} connected-app calls can run at once on your plan. Try again in a moment.`, "concurrency");
      const today = await mcpReceipts().list(ws.id, (r) => r.id !== rid && r.startedAt.startsWith(dayStart()) && r.status !== "failed");
      if (today.length >= limits.callsPerDay) throw new EntitlementError(`You've used today's ${limits.callsPerDay} connected-app calls.`, ws.plan === "plus" ? "pro" : undefined);
      await assertCanSpend(ws, estimateUnits("mcp.call"), { kind: "agent" });
    } catch (e) {
      if (first.inserted) await mcpReceipts().remove(ws.id, rid); // never reached the server: leave no half-started receipt behind
      else await mcpReceipts().update(ws.id, rid, { status: "failed", error: "Not sent: a limit was reached.", endedAt: now() });
      throw e;
    }

    try {
      target = await targetForServer(ws, server);
    } catch (e) {
      await fail(e, 0, t0);
      throw e instanceof McpError ? new HttpError(502, e.message, `mcp_${e.kind}`) : new HttpError(502, "The call failed.", "mcp_failed");
    }
    // Reads are idempotent by definition, so transient failures are retried (bounded); anything else is sent exactly once.
    const maxAttempts = tool.risk === "read" ? 3 : 1;
    let outcome: Awaited<ReturnType<typeof callTool>> | null = null;
    let attempts = 0;
    let lastErr: unknown = null;
    let renewed = false;
    while (attempts < maxAttempts && !outcome) {
      attempts++;
      try {
        outcome = await callTool(target, tool.name, args);
      } catch (e) {
        lastErr = e;
        // OAuth: a 401 means the token was refused before anything ran, so renewing it and trying once more is safe for any tool.
        if (e instanceof McpError && e.kind === "auth" && server.authType === "oauth" && !renewed) {
          renewed = true;
          attempts--;
          try {
            target = await targetForServer(ws, server, { forceRefresh: true });
            continue;
          } catch (re) {
            lastErr = re;
            break;
          }
        }
        if (!(e instanceof McpError && e.transient) || attempts >= maxAttempts || Date.now() - t0 > 40_000) break;
        await sleep(250 * 2 ** (attempts - 1));
      }
    }
    if (!outcome) {
      await fail(lastErr, attempts, t0);
      throw lastErr instanceof McpError ? new HttpError(502, lastErr.message, `mcp_${lastErr.kind}`) : new HttpError(502, "The call failed.", "mcp_failed");
    }
    const clean = sanitizeUntrusted(outcome.text, { maxChars: OUTPUT_STORE_CHARS });
    const units = await charge(ws, "mcp.call", { ref: rid });
    const done = await mcpReceipts().update(ws.id, rid, { status: outcome.isError ? "tool_error" : "ok", endedAt: now(), durationMs: Date.now() - t0, attempts, bytes: outcome.bytes, truncated: clean.truncated, removedLines: clean.removedLines, units, output: clean.text });
    await audit(ws.id, actor, "mcp.call", `${server.id}/${tool.name}`, `${outcome.isError ? "tool_error" : "ok"} ${Date.now() - t0}ms ${outcome.bytes}B${clean.removedLines ? ` removed=${clean.removedLines}` : ""} via=${req.via} receipt=${rid}`);
    return resultOf(done as McpReceipt, false);
  } finally {
    const left = (localInflight.get(ws.id) ?? 1) - 1;
    if (left <= 0) localInflight.delete(ws.id);
    else localInflight.set(ws.id, left);
  }
}

/** Connector entry point used by execute() for an approved or auto-run `mcp.call` action. */
export async function executeMcpAction(workspaceId: string, actor: string, action: McpCallAction, ctx: { approvalId?: string; ws?: Workspace } = {}): Promise<string> {
  // Prefer the caller's workspace (it carries the plan resolved for this request); background callers load it from the stored row.
  const ws = ctx.ws && ctx.ws.id === workspaceId ? ctx.ws : await workspaceById(workspaceId);
  if (!ws) throw new HttpError(404, "Workspace not found.");
  let agentId: string | null = null;
  let via: CallVia;
  let key: string;
  if (actor.startsWith("agent:")) {
    via = "auto";
    agentId = actor.slice(6);
    key = `auto:${action.idempotencyKey}`;
  } else {
    if (!ctx.approvalId) throw new HttpError(403, "No matching approval for this call.", "no_approval");
    via = "approval";
    const ap = await approvals().get(ws.id, ctx.approvalId);
    agentId = ap?.agentId ?? null;
    key = `approval:${ctx.approvalId}`;
  }
  const r = await runToolCall(ws, { serverId: action.serverId, tool: action.tool, args: action.args, idempotencyKey: key, agentId, via, approvalId: ctx.approvalId });
  return r.summary;
}

/** Owner pressed Run in the UI. Read-only tool: runs now. Anything else: becomes a pending approval (never runs unapproved). */
export async function requestManualCall(ws: Workspace, input: { serverId: string; tool: string; args: unknown; idempotencyKey?: string }) {
  assertMcpAllowed(ws);
  const loaded = await load(ws, input.serverId, input.tool);
  const args = assertArgs(loaded.tool, input.args);
  const key = typeof input.idempotencyKey === "string" && /^[\w.:-]{8,80}$/.test(input.idempotencyKey) ? input.idempotencyKey : newId("man");
  const action = buildAction(loaded, args, key);
  const verdict = inspectAction(action);
  if (verdict.blocked) {
    await audit(ws.id, "owner", "firewall.blocked", `${input.serverId}/${input.tool}`, verdict.blocked);
    throw new HttpError(422, verdict.blocked, "firewall_blocked");
  }
  if (loaded.tool.risk === "read") {
    const r = await runToolCall(ws, { serverId: input.serverId, tool: input.tool, args, idempotencyKey: `manual:${key}`, agentId: null, via: "manual" });
    return { status: "completed" as const, result: r };
  }
  const pending = await approvals().list(ws.id, (a) => a.status === "pending" && a.action.type === "mcp.call");
  if (pending.length >= MAX_PENDING_MCP_APPROVALS) throw new HttpError(429, "You have a lot of connected-app actions waiting. Review them first.", "too_many_pending");
  const dup = pending.find((a) => a.action.type === "mcp.call" && a.action.idempotencyKey === key);
  if (dup) return { status: "awaiting_approval" as const, approvalId: dup.id, risk: dup.risk ?? "high", reasons: dup.riskReasons ?? [] };
  const ap: Approval = { id: newId("apr"), workspaceId: ws.id, agentId: "owner", runId: `mcpm_${newId("r")}`, action, status: "pending", decidedAt: null, createdAt: now(), risk: verdict.risk, riskReasons: verdict.reasons, runUsd: 0 };
  await approvals().insert(ap);
  await audit(ws.id, "owner", "mcp.call.queued", `${input.serverId}/${input.tool}`, `awaiting approval ${ap.id}`);
  return { status: "awaiting_approval" as const, approvalId: ap.id, risk: verdict.risk, reasons: verdict.reasons };
}

/**
 * Ask/chat proposed a call that may not run on its own (a write, an unclassified tool, or a read that isn't set to auto-run).
 * It becomes a pending approval the owner sees inline in the chat and in Approvals. Nothing is sent to the server here.
 */
export async function requestChatCall(ws: Workspace, input: { serverId: string; tool: string; args: unknown; idempotencyKey: string; runId: string }) {
  assertMcpAllowed(ws);
  const loaded = await load(ws, input.serverId, input.tool);
  await grantCheck(ws, CHAT_AGENT, loaded);
  const args = assertArgs(loaded.tool, input.args);
  const action = buildAction(loaded, args, input.idempotencyKey);
  const verdict = inspectAction(action);
  if (verdict.blocked) {
    await audit(ws.id, "agent:chat", "firewall.blocked", `${input.serverId}/${input.tool}`, verdict.blocked);
    throw new HttpError(422, verdict.blocked, "firewall_blocked");
  }
  const pending = await approvals().list(ws.id, (a) => a.status === "pending" && a.action.type === "mcp.call");
  const dup = pending.find((a) => a.action.type === "mcp.call" && a.action.idempotencyKey === input.idempotencyKey);
  if (dup) return { approvalId: dup.id, risk: dup.risk ?? "high", kind: loaded.tool.risk };
  if (pending.length >= MAX_PENDING_MCP_APPROVALS) throw new HttpError(429, "You have a lot of connected-app actions waiting. Review them first.", "too_many_pending");
  const ap: Approval = { id: newId("apr"), workspaceId: ws.id, agentId: CHAT_AGENT, runId: input.runId, action, status: "pending", decidedAt: null, createdAt: now(), risk: verdict.risk, riskReasons: verdict.reasons, runUsd: 0 };
  await approvals().insert(ap);
  await audit(ws.id, "agent:chat", "mcp.call.queued", `${input.serverId}/${input.tool}`, `awaiting approval ${ap.id}`);
  return { approvalId: ap.id, risk: verdict.risk, kind: loaded.tool.risk };
}

/** Read-only call Ask may run on its own: the gateway re-checks all four conditions (read, auto-run, chat grant, chat policy). */
export async function runChatAutoCall(ws: Workspace, input: { serverId: string; tool: string; args: Record<string, unknown>; idempotencyKey: string }) {
  return runToolCall(ws, { serverId: input.serverId, tool: input.tool, args: input.args, idempotencyKey: input.idempotencyKey, agentId: CHAT_AGENT, via: "auto" });
}

/* ---------- agents (mcp-task) ---------- */

export async function validateAgentTask(ws: Workspace, cfg: unknown): Promise<NonNullable<Agent["mcp"]>> {
  assertMcpAllowed(ws);
  const c = cfg as { serverId?: unknown; tool?: unknown; args?: unknown } | null;
  if (!c || typeof c.serverId !== "string" || typeof c.tool !== "string") throw new HttpError(400, "Pick a connected app and a tool.");
  const loaded = await load(ws, c.serverId, c.tool);
  const args = assertArgs(loaded.tool, c.args ?? {});
  return { serverId: loaded.server.id, tool: loaded.tool.name, args };
}

/** The agent may use exactly the tool it was created for, within default budgets. The owner can widen or narrow it later. */
export async function grantForNewAgent(ws: Workspace, agentId: string, cfg: NonNullable<Agent["mcp"]>) {
  const g: McpGrant = { id: `${agentId}:${cfg.serverId}`, workspaceId: ws.id, agentId, serverId: cfg.serverId, tools: [cfg.tool], maxCallsPerDay: DEFAULT_GRANT.maxCallsPerDay, maxUnitsPerMonth: DEFAULT_GRANT.maxUnitsPerMonth, updatedAt: now() };
  await saveGrant(g);
}
