/**
 * OAuth for remote MCP servers (MCP authorization spec, 2025-06-18): OAuth 2.1 authorization-code flow with PKCE (S256),
 * protected-resource discovery (RFC 9728), authorization-server discovery (RFC 8414 / OIDC), dynamic client registration
 * (RFC 7591) and the `resource` parameter (RFC 8707).
 *
 * Security rules, all enforced here:
 *  - every request goes through safeFetch (https only in production, no private/loopback/metadata addresses, DNS pinned,
 *    redirects re-validated). Token/registration POSTs never follow a redirect, so a code or refresh token can't be forwarded.
 *  - the issuer in the metadata must equal the issuer we looked up (mix-up protection); `iss` on the callback is checked too.
 *  - PKCE S256 is mandatory: a server that doesn't advertise it is refused. `state` is random, single use, bound to the
 *    signed-in workspace and expires in 10 minutes. The code verifier never leaves the server (sealed at rest).
 *  - tokens are sealed with AES-GCM (crypto.ts) and never returned to the client or written to logs, audit entries or errors.
 *  - one client registration per connection (nothing is shared between users).
 *  - nothing a server says is shown raw: our own sentences, plus a short sanitized `error` code from the token endpoint.
 */
import { createHash, randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/site";
import { FetchError, SsrfError, checkUrl, resolvePublic, safeFetch } from "./ssrf";
import { scrub } from "./crypto";
import { sanitizeUntrusted } from "./sanitize";

export type OAuthErrorKind = "unsupported" | "discovery" | "registration" | "token" | "denied" | "expired" | "network" | "blocked" | "state";
export class OAuthError extends Error {
  constructor(message: string, public kind: OAuthErrorKind) {
    super(message);
  }
}

export const OAUTH_TTL_MS = 10 * 60_000;
export const OAUTH_TIMEOUT_MS = 10_000;
const MAX_JSON = 64 * 1024;
export const CALLBACK_PATH = "/api/mcp/oauth/callback";
export const redirectUri = () => `${(process.env.BETTER_AUTH_URL || siteUrl).replace(/\/$/, "")}${CALLBACK_PATH}`;

export type OAuthMeta = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  resource: string;
  scope?: string;
  authMethods: string[];
  refreshSupported: boolean;
};
export type OAuthClient = { clientId: string; clientSecret?: string; authMethod: "none" | "client_secret_post" | "client_secret_basic" };
/** What is sealed in the server row once the user has signed in. */
export type OAuthTokens = {
  v: 1;
  accessToken: string;
  refreshToken?: string;
  /** epoch ms; absent = the server didn't say */
  expiresAt?: number;
  clientId: string;
  clientSecret?: string;
  authMethod: OAuthClient["authMethod"];
  tokenEndpoint: string;
  issuer: string;
  resource: string;
  scope?: string;
};

/* ---------- helpers ---------- */

function mapNet(e: unknown): OAuthError {
  if (e instanceof SsrfError) return new OAuthError(e.message, "blocked");
  if (e instanceof FetchError) return new OAuthError(e.kind === "timeout" ? "The sign-in server took too long to respond." : "Couldn't reach the sign-in server.", "network");
  return new OAuthError("Couldn't reach the sign-in server.", "network");
}

async function fetchJson(url: string, init: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; secret?: string[] } = {}): Promise<{ status: number; json: Record<string, unknown> | null; www?: string }> {
  let res;
  try {
    res = await safeFetch(url, {
      method: init.method ?? "GET",
      headers: { accept: "application/json", "user-agent": "Keplar-MCP/1.0 (+https://keplar.one)", ...(init.headers ?? {}) },
      secretHeaders: ["authorization"],
      body: init.body,
      timeoutMs: OAUTH_TIMEOUT_MS,
      maxBytes: MAX_JSON,
      maxRedirects: init.method === "POST" ? 0 : 3,
    });
  } catch (e) {
    throw mapNet(e);
  }
  let json: Record<string, unknown> | null = null;
  try {
    const j = JSON.parse(res.body.toString("utf8"));
    if (j && typeof j === "object" && !Array.isArray(j)) json = j as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, www: res.headers["www-authenticate"] };
}

const str = (v: unknown, max = 2048) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 40) : []);
const noSlash = (u: string) => u.replace(/\/+$/, "");

/** Parse `resource_metadata="..."` and `scope="..."` from a WWW-Authenticate challenge. */
export function parseChallenge(www: string | undefined): { resourceMetadata?: string; scope?: string } {
  if (!www) return {};
  const pick = (k: string) => new RegExp(`${k}="([^"]{1,2048})"`, "i").exec(www)?.[1];
  return { resourceMetadata: pick("resource_metadata"), scope: pick("scope") };
}

/** Ask the MCP server without credentials; a 401 carries the challenge. */
export async function probeChallenge(mcpUrl: string): Promise<{ needsAuth: boolean; www?: string }> {
  const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Keplar", version: "1.0" } } });
  let res;
  try {
    res = await safeFetch(mcpUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "Keplar-MCP/1.0 (+https://keplar.one)" }, body: init, timeoutMs: OAUTH_TIMEOUT_MS, maxBytes: 64 * 1024, stopWhen: (b) => b.length > 0 });
  } catch (e) {
    throw mapNet(e);
  }
  return { needsAuth: res.status === 401, www: res.headers["www-authenticate"] };
}

/* ---------- discovery ---------- */

async function authServerMetadata(issuer: string): Promise<Record<string, unknown>> {
  const u = checkUrl(issuer);
  const path = noSlash(u.pathname);
  const root = u.origin;
  const candidates = path
    ? [`${root}/.well-known/oauth-authorization-server${path}`, `${root}/.well-known/openid-configuration${path}`, `${root}${path}/.well-known/openid-configuration`]
    : [`${root}/.well-known/oauth-authorization-server`, `${root}/.well-known/openid-configuration`];
  for (const c of candidates) {
    const r = await fetchJson(c);
    if (r.status === 200 && r.json) return r.json;
  }
  throw new OAuthError("Couldn't find the sign-in server's settings.", "discovery");
}

async function epCheck(raw: unknown, what: string): Promise<string> {
  const s = str(raw);
  if (!s) throw new OAuthError(`The sign-in server didn't give a ${what} address.`, "discovery");
  try {
    const u = checkUrl(s, { allowHttp: false });
    await resolvePublic(u.hostname);
    return u.toString();
  } catch (e) {
    if (e instanceof SsrfError) throw new OAuthError(`The sign-in server's ${what} address isn't allowed: ${e.message}`, "blocked");
    throw new OAuthError(`The sign-in server's ${what} address isn't valid.`, "discovery");
  }
}

/** RFC 9728 -> RFC 8414 discovery. Throws OAuthError with a user-safe reason. */
export async function discover(mcpUrl: string, www?: string): Promise<OAuthMeta> {
  const mcp = checkUrl(mcpUrl);
  const ch = parseChallenge(www);
  const prmCandidates = [
    ...(ch.resourceMetadata ? [ch.resourceMetadata] : []),
    `${mcp.origin}/.well-known/oauth-protected-resource${noSlash(mcp.pathname)}`,
    `${mcp.origin}/.well-known/oauth-protected-resource`,
  ];
  let issuer: string | null = null;
  let scope = ch.scope;
  let resource = mcp.toString();
  for (const c of prmCandidates) {
    let r;
    try {
      r = await fetchJson(c);
    } catch (e) {
      if (e instanceof OAuthError && e.kind === "blocked") throw e;
      continue;
    }
    if (r.status !== 200 || !r.json) continue;
    const res = str(r.json.resource);
    if (res) {
      try {
        const ru = new URL(res);
        if (ru.origin !== mcp.origin || !(`${noSlash(mcp.pathname)}/`).startsWith(`${noSlash(ru.pathname)}/`)) throw new OAuthError("The server's sign-in description is for a different resource, so Keplar won't use it.", "discovery");
        resource = res;
      } catch (e) {
        if (e instanceof OAuthError) throw e;
        continue;
      }
    }
    const as = strs(r.json.authorization_servers).find((x) => /^https:\/\//i.test(x));
    if (as) {
      issuer = as;
      scope = scope ?? undefined;
      break;
    }
  }
  // Older servers (spec 2025-03-26) are their own authorization server.
  if (!issuer) issuer = mcp.origin;
  const md = await authServerMetadata(issuer);
  const got = str(md.issuer);
  if (!got || noSlash(got) !== noSlash(issuer)) throw new OAuthError("The sign-in server identified itself differently from where it was found, so Keplar refused it.", "discovery");
  const methods = strs(md.code_challenge_methods_supported);
  if (!methods.includes("S256")) throw new OAuthError("The sign-in server doesn't support PKCE (S256), which Keplar requires.", "unsupported");
  const grants = strs(md.grant_types_supported);
  if (grants.length && !grants.includes("authorization_code")) throw new OAuthError("The sign-in server doesn't offer the authorization-code flow.", "unsupported");
  if (!str(md.registration_endpoint)) throw new OAuthError("This server needs a pre-registered app (it doesn't allow automatic registration), which Keplar doesn't support yet. Use a token or API key if it offers one.", "unsupported");
  return {
    issuer: got,
    authorizationEndpoint: await epCheck(md.authorization_endpoint, "authorization"),
    tokenEndpoint: await epCheck(md.token_endpoint, "token"),
    registrationEndpoint: await epCheck(md.registration_endpoint, "registration"),
    resource,
    scope: scope && /^[\x21\x23-\x5b\x5d-\x7e ]{1,500}$/.test(scope) ? scope : undefined,
    authMethods: strs(md.token_endpoint_auth_methods_supported),
    refreshSupported: !grants.length || grants.includes("refresh_token"),
  };
}

/* ---------- registration, PKCE, authorization URL ---------- */

export async function registerClient(meta: OAuthMeta, redirect = redirectUri()): Promise<OAuthClient> {
  const methods = meta.authMethods;
  const authMethod: OAuthClient["authMethod"] = !methods.length || methods.includes("none") ? "none" : methods.includes("client_secret_post") ? "client_secret_post" : methods.includes("client_secret_basic") ? "client_secret_basic" : "none";
  if (methods.length && !methods.includes("none") && authMethod === "none") throw new OAuthError("The sign-in server only accepts client authentication Keplar doesn't support.", "unsupported");
  const body = { client_name: "Keplar", client_uri: siteUrl, redirect_uris: [redirect], grant_types: meta.refreshSupported ? ["authorization_code", "refresh_token"] : ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: authMethod };
  const r = await fetchJson(meta.registrationEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const id = str(r.json?.client_id, 512);
  if (![200, 201].includes(r.status) || !id) throw new OAuthError("The sign-in server refused to register Keplar.", "registration");
  const secret = str(r.json?.client_secret, 1024);
  const echoed = r.json?.token_endpoint_auth_method;
  const final = echoed === "client_secret_basic" || echoed === "client_secret_post" || echoed === "none" ? echoed : authMethod;
  if (final !== "none" && !secret) throw new OAuthError("The sign-in server registered Keplar without the credential it needs.", "registration");
  return { clientId: id, clientSecret: final === "none" ? undefined : secret, authMethod: final };
}

const b64u = (b: Buffer) => b.toString("base64url");
export function newPkce() {
  const verifier = b64u(randomBytes(48));
  return { verifier, challenge: b64u(createHash("sha256").update(verifier).digest()) };
}
export const newState = () => b64u(randomBytes(32));
export const stateId = (state: string) => `mco_${createHash("sha256").update(state).digest("hex").slice(0, 40)}`;

export function authorizationUrl(meta: OAuthMeta, client: OAuthClient, state: string, challenge: string, redirect = redirectUri()): string {
  const u = new URL(meta.authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", client.clientId);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("resource", meta.resource);
  if (meta.scope) u.searchParams.set("scope", meta.scope);
  return u.toString();
}

/* ---------- tokens ---------- */

type Grant = { client: OAuthClient; tokenEndpoint: string; resource: string; issuer: string };

async function tokenRequest(g: Grant, params: Record<string, string>): Promise<Record<string, unknown>> {
  const form = new URLSearchParams({ ...params, client_id: g.client.clientId, resource: g.resource });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (g.client.authMethod === "client_secret_post" && g.client.clientSecret) form.set("client_secret", g.client.clientSecret);
  if (g.client.authMethod === "client_secret_basic" && g.client.clientSecret) headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(g.client.clientId)}:${encodeURIComponent(g.client.clientSecret)}`).toString("base64")}`;
  const r = await fetchJson(g.tokenEndpoint, { method: "POST", headers, body: form.toString() });
  if (r.status !== 200 || !r.json) {
    const code = str(r.json?.error, 64);
    const safe = code && /^[a-z_]+$/.test(code) ? code : null;
    if (safe === "invalid_grant") throw new OAuthError("The sign-in expired or was revoked. Sign in again.", "expired");
    throw new OAuthError(`The sign-in server didn't accept the request${safe ? ` (${safe})` : ""}.`, "token");
  }
  return r.json;
}

function toTokens(g: Grant, j: Record<string, unknown>, prev?: OAuthTokens): OAuthTokens {
  const access = str(j.access_token, 8192);
  if (!access || /[^\x21-\x7e]/.test(access)) throw new OAuthError("The sign-in server didn't return a usable access token.", "token");
  const type = typeof j.token_type === "string" ? j.token_type.toLowerCase() : "bearer";
  if (type !== "bearer") throw new OAuthError("The sign-in server returned a token type Keplar doesn't support.", "unsupported");
  const refresh = str(j.refresh_token, 8192);
  const exp = typeof j.expires_in === "number" && Number.isFinite(j.expires_in) && j.expires_in > 0 ? Date.now() + Math.min(j.expires_in, 365 * 86400) * 1000 : undefined;
  const scope = str(j.scope, 500);
  return { v: 1, accessToken: access, refreshToken: refresh ?? prev?.refreshToken, expiresAt: exp, clientId: g.client.clientId, clientSecret: g.client.clientSecret, authMethod: g.client.authMethod, tokenEndpoint: g.tokenEndpoint, issuer: g.issuer, resource: g.resource, scope: scope ?? prev?.scope };
}

export async function exchangeCode(g: Grant, code: string, verifier: string, redirect = redirectUri()): Promise<OAuthTokens> {
  try {
    return toTokens(g, await tokenRequest(g, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirect }));
  } catch (e) {
    if (e instanceof OAuthError) throw new OAuthError(scrub(scrub(e.message, code), verifier), e.kind);
    throw e;
  }
}

export async function refreshTokens(t: OAuthTokens): Promise<OAuthTokens> {
  if (!t.refreshToken) throw new OAuthError("The sign-in expired and can't be renewed. Sign in again.", "expired");
  const g: Grant = { client: { clientId: t.clientId, clientSecret: t.clientSecret, authMethod: t.authMethod }, tokenEndpoint: t.tokenEndpoint, resource: t.resource, issuer: t.issuer };
  try {
    return toTokens(g, await tokenRequest(g, { grant_type: "refresh_token", refresh_token: t.refreshToken }), t);
  } catch (e) {
    if (e instanceof OAuthError) throw new OAuthError(scrub(e.message, t.refreshToken), e.kind);
    throw e;
  }
}

export const tokenExpiresSoon = (t: OAuthTokens, skewMs = 60_000) => t.expiresAt !== undefined && t.expiresAt - skewMs <= Date.now();

/** Short, sanitized error text for the callback's `error` parameter. Never shown raw. */
export const safeAuthError = (v: unknown) => sanitizeUntrusted(typeof v === "string" ? v : "", { maxChars: 60 }).text.replace(/[^\w ]/g, "");
