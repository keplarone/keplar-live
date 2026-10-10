/**
 * Native OAuth connectors: Gmail, Google Calendar, Slack, GitHub.
 *
 * Honest by construction:
 *  - A connector is "Not configured" until its OAuth app keys exist in the server environment (names below). Nothing is faked.
 *  - Tokens are encrypted with the workspace-bound AES-256-GCM key (sealSecret) and never leave the server or reach a model.
 *  - Every tool is OFF until the owner switches it on (per connection, per tool). Every tool here writes to the outside world,
 *    so each action still goes through the AI Firewall and the owner's approval queue.
 *  - Notion and Linear are not here: they connect through Connected apps (remote MCP over OAuth, BETA).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { id, now } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";
import { openSecret, sealSecret, scrub } from "@/lib/mcp/crypto";
import { siteUrl } from "@/lib/site";
import { audit, connections } from "./repo";
import type { Connection, ConnectorId, OutboundAction } from "./types";

export type OAuthConnectorId = "gmail" | "gcal" | "slack" | "github";
export type ToolDef = { id: string; label: string; what: string; writes: true };
type Provider = {
  label: string;
  authUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  scopes: string[];
  scopeParam: "scope" | "user_scope";
  extraAuth?: Record<string, string>;
  tools: ToolDef[];
  setup: string;
};

export const OAUTH_CONNECTORS: Record<OAuthConnectorId, Provider> = {
  gmail: {
    label: "Gmail",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CONNECT_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CONNECT_CLIENT_SECRET",
    scopes: ["https://www.googleapis.com/auth/gmail.send", "openid", "email"],
    scopeParam: "scope",
    extraAuth: { access_type: "offline", prompt: "consent", include_granted_scopes: "false" },
    tools: [{ id: "send_email", label: "Send email", what: "Send one email to one recipient from your Gmail", writes: true }],
    setup: "Google Cloud OAuth client (Web). Redirect URI below. gmail.send is a sensitive scope: Google shows an unverified-app screen until the app is verified.",
  },
  gcal: {
    label: "Google Calendar",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CONNECT_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CONNECT_CLIENT_SECRET",
    scopes: ["https://www.googleapis.com/auth/calendar.events", "openid", "email"],
    scopeParam: "scope",
    extraAuth: { access_type: "offline", prompt: "consent", include_granted_scopes: "false" },
    tools: [{ id: "create_event", label: "Create event", what: "Add an event to your primary calendar", writes: true }],
    setup: "Same Google OAuth client as Gmail. calendar.events is a sensitive scope.",
  },
  slack: {
    label: "Slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    scopes: ["chat:write", "chat:write.public"],
    scopeParam: "scope",
    tools: [{ id: "post_message", label: "Post message", what: "Post a message to a channel", writes: true }],
    setup: "Slack app with the Bot scopes chat:write and chat:write.public. Redirect URL below.",
  },
  github: {
    label: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientIdEnv: "GITHUB_CONNECT_CLIENT_ID",
    clientSecretEnv: "GITHUB_CONNECT_CLIENT_SECRET",
    scopes: ["public_repo"],
    scopeParam: "scope",
    tools: [{ id: "create_issue", label: "Create issue", what: "Open an issue in a repository (public repositories)", writes: true }],
    setup: "GitHub OAuth app. Callback URL below. Scope public_repo (public repositories only).",
  },
};

export const isOAuthConnector = (c: string): c is OAuthConnectorId => c in OAUTH_CONNECTORS;
export const oauthConfigured = (c: OAuthConnectorId): boolean => {
  const p = OAUTH_CONNECTORS[c];
  return Boolean(process.env[p.clientIdEnv]?.trim() && process.env[p.clientSecretEnv]?.trim());
};
export const baseUrl = () => (process.env.BETTER_AUTH_URL || siteUrl).replace(/\/$/, "");
export const redirectUri = () => `${baseUrl()}/api/business/connectors/oauth/callback`;

/** The tool id an outbound action needs on its connector. */
export function toolFor(action: OutboundAction): { connector: OAuthConnectorId; tool: string } | null {
  switch (action.type) {
    case "email.send":
      return action.connector === "gmail" ? { connector: "gmail", tool: "send_email" } : null;
    case "gcal.event":
      return { connector: "gcal", tool: "create_event" };
    case "slack.post":
      return { connector: "slack", tool: "post_message" };
    case "github.issue":
      return { connector: "github", tool: "create_issue" };
    default:
      return null;
  }
}

// ── signed state (CSRF + workspace binding) ───────────────────────────────────────────────────────
const stateKey = () => {
  const s = process.env.BETTER_AUTH_SECRET?.trim();
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new HttpError(503, "Server secret isn't configured.", "not_configured");
    return "dev-only-connector-state-secret";
  }
  return `connector-state:${s}`;
};
const mac = (payload: string) => createHmac("sha256", stateKey()).update(payload).digest("base64url");
export function signState(workspaceId: string, connector: OAuthConnectorId, ttlMs = 10 * 60_000, at = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ w: workspaceId, c: connector, n: randomBytes(8).toString("hex"), e: at + ttlMs })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}
export function verifyState(state: string, at = Date.now()): { workspaceId: string; connector: OAuthConnectorId } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const want = mac(payload);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { w: string; c: string; e: number };
    if (typeof d.e !== "number" || d.e < at || !isOAuthConnector(d.c) || typeof d.w !== "string") return null;
    return { workspaceId: d.w, connector: d.c };
  } catch {
    return null;
  }
}

export function authorizeUrl(workspaceId: string, connector: OAuthConnectorId): string {
  const p = OAUTH_CONNECTORS[connector];
  if (!oauthConfigured(connector)) throw new HttpError(503, `${p.label} isn't configured yet. Add ${p.clientIdEnv} and ${p.clientSecretEnv} to the server environment.`, "not_configured");
  const u = new URL(p.authUrl);
  u.searchParams.set("client_id", process.env[p.clientIdEnv]!.trim());
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set(p.scopeParam, p.scopes.join(connector === "slack" ? "," : " "));
  u.searchParams.set("state", signState(workspaceId, connector));
  for (const [k, v] of Object.entries(p.extraAuth ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

type Tokens = { access: string; refresh?: string; expiresAt?: number };
const fx = (): typeof fetch => globalThis.fetch;

/** Exchange the code and store the connection. Tools start OFF. */
export async function completeAuthorization(workspaceId: string, connector: OAuthConnectorId, code: string): Promise<Connection> {
  const p = OAUTH_CONNECTORS[connector];
  if (!oauthConfigured(connector)) throw new HttpError(503, `${p.label} isn't configured.`, "not_configured");
  const clientSecret = process.env[p.clientSecretEnv]!.trim();
  const res = await fx()(p.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: process.env[p.clientIdEnv]!.trim(), client_secret: clientSecret, code, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const access = typeof j.access_token === "string" ? j.access_token : "";
  if (!res.ok || !access || j.ok === false) {
    const why = typeof j.error_description === "string" ? j.error_description : typeof j.error === "string" ? j.error : `HTTP ${res.status}`;
    throw new HttpError(502, `${p.label} didn't accept the sign-in: ${scrub(String(why), clientSecret).slice(0, 160)}`, "oauth_failed");
  }
  const tokens: Tokens = { access, refresh: typeof j.refresh_token === "string" ? j.refresh_token : undefined, expiresAt: typeof j.expires_in === "number" ? Date.now() + j.expires_in * 1000 : undefined };
  const account = await accountName(connector, access, j);
  const existing = (await connections().list(workspaceId, (c) => c.connector === connector))[0];
  const rowId = existing?.id ?? id("conn");
  const row: Connection = {
    id: rowId,
    workspaceId,
    connector,
    status: "connected",
    account,
    tokenEnc: sealSecret(JSON.stringify(tokens), workspaceId, rowId),
    scopes: p.scopes,
    connectedAt: now(),
    tools: {}, // every tool OFF until the owner turns it on
  };
  if (existing) await connections().update(workspaceId, existing.id, row);
  else await connections().insert(row);
  await audit(workspaceId, "owner", "connector.connected", connector, account);
  return row;
}

async function accountName(connector: OAuthConnectorId, access: string, tokenJson: Record<string, unknown>): Promise<string> {
  try {
    if (connector === "slack") {
      const team = tokenJson.team as { name?: string } | undefined;
      return team?.name ? `Workspace ${team.name}` : "Slack workspace";
    }
    if (connector === "github") {
      const r = await fx()("https://api.github.com/user", { headers: { authorization: `Bearer ${access}`, accept: "application/vnd.github+json", "user-agent": "keplar" } });
      const u = (await r.json()) as { login?: string };
      return u.login ? `@${u.login}` : "GitHub account";
    }
    const r = await fx()("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${access}` } });
    const u = (await r.json()) as { email?: string };
    return u.email ?? "Google account";
  } catch {
    return `${OAUTH_CONNECTORS[connector].label} account`;
  }
}

export async function setToolEnabled(workspaceId: string, connector: OAuthConnectorId, tool: string, enabled: boolean) {
  const def = OAUTH_CONNECTORS[connector].tools.find((t) => t.id === tool);
  if (!def) throw new HttpError(400, "Unknown tool.");
  const conn = (await connections().list(workspaceId, (c) => c.connector === connector && c.status === "connected"))[0];
  if (!conn) throw new HttpError(409, `${OAUTH_CONNECTORS[connector].label} isn't connected.`, "not_connected");
  await connections().update(workspaceId, conn.id, { tools: { ...(conn.tools ?? {}), [tool]: enabled } });
  await audit(workspaceId, "owner", enabled ? "connector.tool.enabled" : "connector.tool.disabled", connector, tool);
}

async function accessToken(conn: Connection): Promise<string> {
  const raw = openSecret(conn.tokenEnc, conn.workspaceId, conn.id);
  if (!raw) throw new HttpError(409, "Reconnect this app: its saved sign-in can't be opened.", "reconnect");
  const t = JSON.parse(raw) as Tokens;
  if (!t.expiresAt || t.expiresAt - 60_000 > Date.now()) return t.access;
  if (!t.refresh) throw new HttpError(409, "Reconnect this app: its sign-in expired.", "reconnect");
  const p = OAUTH_CONNECTORS[conn.connector as OAuthConnectorId];
  const res = await fx()(p.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env[p.clientIdEnv] ?? "", client_secret: process.env[p.clientSecretEnv] ?? "", refresh_token: t.refresh, grant_type: "refresh_token" }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) throw new HttpError(409, "Reconnect this app: refreshing its sign-in failed.", "reconnect");
  const next: Tokens = { access: j.access_token, refresh: t.refresh, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
  await connections().update(conn.workspaceId, conn.id, { tokenEnc: sealSecret(JSON.stringify(next), conn.workspaceId, conn.id) });
  return next.access;
}

const mimeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
export function rfc822(to: string, subject: string, body: string): string {
  return [`To: ${to}`, `Subject: ${mimeHeader(subject.replace(/[\r\n]+/g, " "))}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(body, "utf8").toString("base64")].join("\r\n");
}

/**
 * One provider call. Success needs positive proof: a 2xx JSON object that `confirms` the write (an id, a link, `ok: true`).
 * A 2xx that is not JSON (a proxy or captive-portal page) or does not confirm is an error, never "sent".
 */
async function call(label: string, url: string, init: RequestInit, token: string, confirms: (j: Record<string, unknown>) => boolean = () => true): Promise<Record<string, unknown>> {
  const res = await fx()(url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` } });
  const parsed = await res.json().catch(() => null);
  if (res.ok && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) throw new HttpError(502, `${label} sent back something unexpected, so nothing was confirmed. Check ${label} before trying again.`, "provider_unconfirmed");
  const j = (parsed ?? {}) as Record<string, unknown>;
  if (res.ok && j.ok !== false && !confirms(j)) throw new HttpError(502, `${label} did not confirm the action, so it may not have happened. Check ${label} before trying again.`, "provider_unconfirmed");
  if (!res.ok || j.ok === false) {
    const err = j.error;
    const why = typeof err === "string" ? err : err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : typeof j.message === "string" ? j.message : `HTTP ${res.status}`;
    throw new HttpError(502, `${label} refused the request: ${scrub(why, token).slice(0, 200)}`, "provider_error");
  }
  return j;
}

/** Run one approved action against the real API. Throws (never pretends) when the tool is off or the provider says no. */
export async function executeOAuthAction(workspaceId: string, action: OutboundAction): Promise<string> {
  const need = toolFor(action);
  if (!need) throw new HttpError(503, "This action has no live connector.", "not_configured");
  const p = OAUTH_CONNECTORS[need.connector];
  const conn = (await connections().list(workspaceId, (c) => c.connector === need.connector && c.status === "connected"))[0];
  if (!conn) throw new HttpError(409, `${p.label} isn't connected.`, "not_connected");
  if (!conn.tools?.[need.tool]) throw new HttpError(403, `${p.tools.find((t) => t.id === need.tool)?.label ?? need.tool} is switched off for ${p.label}. Turn it on under Connectors.`, "tool_disabled");
  const token = await accessToken(conn);
  switch (action.type) {
    case "email.send": {
      const raw = Buffer.from(rfc822(action.to, action.subject, action.body), "utf8").toString("base64url");
      await call("Gmail", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw }) }, token, (j) => typeof j.id === "string");
      return `Email sent to ${action.to}`;
    }
    case "gcal.event": {
      const j = await call("Google Calendar", "https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: action.title, description: action.description, start: { dateTime: action.start }, end: { dateTime: action.end } }) }, token, (j) => typeof j.id === "string" || typeof j.htmlLink === "string");
      return `Calendar event created${typeof j.htmlLink === "string" ? `: ${j.htmlLink}` : ""}`;
    }
    case "slack.post": {
      await call("Slack", "https://slack.com/api/chat.postMessage", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ channel: action.channel, text: action.text }) }, token, (j) => j.ok === true);
      return `Posted to ${action.channel}`;
    }
    case "github.issue": {
      if (!/^[\w.-]+\/[\w.-]+$/.test(action.repo)) throw new HttpError(422, "Repository must look like owner/name.", "bad_repo");
      const j = await call("GitHub", `https://api.github.com/repos/${action.repo}/issues`, { method: "POST", headers: { "content-type": "application/json", accept: "application/vnd.github+json", "user-agent": "keplar" }, body: JSON.stringify({ title: action.title, body: action.body }) }, token, (j) => typeof j.html_url === "string" || typeof j.number === "number");
      return `Issue opened${typeof j.html_url === "string" ? `: ${j.html_url}` : ""}`;
    }
    default:
      throw new HttpError(503, "This action has no live connector.", "not_configured");
  }
}

// ── "does this agent have what it needs?" ───────────────────────────────────────────────────────
export type Need = { connector: ConnectorId; label: string; reason: string; kind: "oauth" | "mcp" };
const LABEL: Partial<Record<ConnectorId, string>> = { gmail: "Gmail", slack: "Slack", gcal: "Google Calendar", github: "GitHub" };

/** Connectors a workflow template cannot run without. */
export function requiredFor(template: string): Need[] {
  switch (template) {
    case "lead-followup":
    case "lead-sweep":
    case "invoice-reminder":
      return [{ connector: "gmail", label: "Gmail", reason: "it sends the reply from your own inbox", kind: "oauth" }];
    case "weekly-report":
      return [{ connector: "slack", label: "Slack", reason: "it posts the report to a channel", kind: "oauth" }];
    default:
      return [];
  }
}

/** Needs that are not satisfied: not connected, or the needed tool is switched off. */
export async function unmetNeeds(workspaceId: string, needs: Need[]): Promise<(Need & { problem: "not_connected" | "tool_off" })[]> {
  const out: (Need & { problem: "not_connected" | "tool_off" })[] = [];
  for (const n of needs) {
    const conn = (await connections().list(workspaceId, (c) => c.connector === n.connector && c.status === "connected"))[0];
    if (!conn) {
      out.push({ ...n, problem: "not_connected" });
      continue;
    }
    if (isOAuthConnector(n.connector)) {
      const tools = OAUTH_CONNECTORS[n.connector].tools;
      if (!tools.some((t) => conn.tools?.[t.id])) out.push({ ...n, problem: "tool_off" });
    }
  }
  return out;
}
export const needMessage = (needs: (Need & { problem: string })[]) =>
  `Needs ${needs.map((n) => n.label).join(" and ")}. ${needs.map((n) => (n.problem === "tool_off" ? `Turn on the ${n.label} tool under Connectors (${n.reason}).` : `Connect ${n.label} under Connectors (${n.reason}).`)).join(" ")} Nothing was drafted, sent, or made up.`;
export { LABEL as NEED_LABELS };
