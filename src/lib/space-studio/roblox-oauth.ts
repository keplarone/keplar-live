/**
 * Linking a Roblox account to Space Studio with Roblox OAuth 2.0 / OpenID Connect (authorization code + PKCE S256).
 *
 * start:    signed in + recent sign-in -> state (32 random bytes), nonce, PKCE verifier sealed (AES-256-GCM, bound to the workspace,
 *           src/lib/mcp/crypto.ts) into an httpOnly, SameSite=Lax, Secure cookie scoped to this path for 10 minutes -> 302 to Roblox.
 * callback: same signed-in account opens the cookie (a different account can't), state compared in constant time, code exchanged
 *           with the verifier, userinfo read (sub + preferred_username/name), id_token nonce checked when present, then core planLink
 *           and the race-safe index claim. Roblox tokens are used once to read userinfo and never stored or logged.
 * The redirect URI comes from the configured base (BETTER_AUTH_URL or the site URL), never the Host header.
 *
 * The same helpers run "Sign in with Roblox" (SIGNIN_FLOW, ./roblox-signin.ts): there is no signed-in account yet, so the sealed
 * cookie is bound to a fixed label instead, scoped to the sign-in callback path, and also carries the safe `next` path.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { openSecret, sealSecret } from "@/lib/mcp/crypto";
import { siteUrl } from "@/lib/site";

export const ROBLOX_AUTHORIZE = "https://apis.roblox.com/oauth/v1/authorize";
export const ROBLOX_TOKEN = "https://apis.roblox.com/oauth/v1/token";
export const ROBLOX_USERINFO = "https://apis.roblox.com/oauth/v1/userinfo";
export const LINK_COOKIE = "space_roblox_link";
export const LINK_COOKIE_PATH = "/api/space-studio/identities/roblox";
const ROW = "space-roblox-link";
const TTL_MS = 10 * 60_000;

export const baseUrl = () => (process.env.BETTER_AUTH_URL || siteUrl).replace(/\/$/, "");
export const redirectUri = () => `${baseUrl()}/api/space-studio/identities/roblox/callback`;
export const appUrl = (q: string) => `${baseUrl()}/space-studio/app?view=account&${q}`;

export type OAuthFlow = { cookie: string; path: string; row: string; redirectUri: () => string };
export const LINK_FLOW: OAuthFlow = { cookie: LINK_COOKIE, path: LINK_COOKIE_PATH, row: ROW, redirectUri };
export const SIGNIN_COOKIE = "space_roblox_signin";
export const SIGNIN_PATH = "/api/auth/space-studio/roblox";
export const SIGNIN_BINDING = "space-roblox-signin";
export const SIGNIN_FLOW: OAuthFlow = { cookie: SIGNIN_COOKIE, path: SIGNIN_PATH, row: "space-roblox-signin", redirectUri: () => `${baseUrl()}${SIGNIN_PATH}/callback` };

type LinkState = { state: string; verifier: string; nonce: string; accountId: string; exp: number; redirectUri?: string; next?: string };

const b64u = (b: Buffer) => b.toString("base64url");

export function beginLink(accountId: string, clientId: string, now = Date.now()): { url: string; cookie: string } {
  return beginFlow(LINK_FLOW, accountId, clientId, {}, now);
}

export function beginFlow(flow: OAuthFlow, accountId: string, clientId: string, extra: { next?: string }, now = Date.now()): { url: string; cookie: string } {
  const st: LinkState = { state: b64u(randomBytes(32)), verifier: b64u(randomBytes(32)), nonce: b64u(randomBytes(16)), accountId, exp: now + TTL_MS, redirectUri: flow.redirectUri(), ...(extra.next ? { next: extra.next } : {}) };
  const u = new URL(ROBLOX_AUTHORIZE);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", st.redirectUri!);
  u.searchParams.set("scope", "openid profile");
  u.searchParams.set("state", st.state);
  u.searchParams.set("nonce", st.nonce);
  u.searchParams.set("code_challenge", b64u(createHash("sha256").update(st.verifier).digest()));
  u.searchParams.set("code_challenge_method", "S256");
  return { url: u.toString(), cookie: flowCookie(flow, sealSecret(JSON.stringify(st), accountId, flow.row), TTL_MS / 1000) };
}

export function flowCookie(flow: OAuthFlow, value: string, maxAgeSec: number) {
  const secure = baseUrl().startsWith("https://") ? "; Secure" : "";
  return `${flow.cookie}=${value}; Path=${flow.path}; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}
export const linkCookie = (value: string, maxAgeSec: number) => flowCookie(LINK_FLOW, value, maxAgeSec);
export const clearLinkCookie = () => linkCookie("", 0);

const cookieValue = (cookieHeader: string | null | undefined, name: string) => (cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";

/** Opens the cookie for THIS account and checks state (constant time) and expiry. Null on any mismatch. */
export function readLinkState(req: Request, accountId: string, state: string | null, now = Date.now()): LinkState | null {
  return readFlowState(LINK_FLOW, req.headers.get("cookie"), accountId, state, now);
}

export function readFlowState(flow: OAuthFlow, cookieHeader: string | null | undefined, accountId: string, state: string | null, now = Date.now()): LinkState | null {
  const plain = openSecret(cookieValue(cookieHeader, flow.cookie), accountId, flow.row);
  if (!plain || !state) return null;
  let st: LinkState;
  try {
    st = JSON.parse(plain) as LinkState;
  } catch {
    return null;
  }
  if (st.accountId !== accountId || !(st.exp > now)) return null;
  const a = Buffer.from(st.state);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b) ? st : null;
}

function idTokenNonce(idToken: unknown): string | null | undefined {
  if (typeof idToken !== "string") return undefined; // no id_token: nothing to check
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { nonce?: unknown };
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

export type RobloxUser = { subject: string; label: string | null; username: string | null; displayName: string | null };

/**
 * Code -> tokens -> userinfo. The id_token comes straight from Roblox's token endpoint over TLS with our client credentials, so
 * only its nonce is checked (not its signature). Throws an Error whose message is a link_error code; never includes tokens.
 */
export async function finishLink(code: string, st: LinkState, creds: { clientId: string; clientSecret: string }, doFetch: typeof fetch = fetch): Promise<RobloxUser> {
  const tok = await doFetch(ROBLOX_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: st.redirectUri ?? redirectUri(), code_verifier: st.verifier, client_id: creds.clientId, client_secret: creds.clientSecret }).toString(),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const t = (tok?.ok ? await tok.json().catch(() => null) : null) as { access_token?: unknown; id_token?: unknown } | null;
  if (!t || typeof t.access_token !== "string") throw new Error("token_exchange_failed");
  const nonce = idTokenNonce(t.id_token);
  if (nonce !== undefined) {
    const a = Buffer.from(nonce ?? "");
    const b = Buffer.from(st.nonce);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("nonce_mismatch");
  }
  const info = await doFetch(ROBLOX_USERINFO, { headers: { authorization: `Bearer ${t.access_token}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const u = (info?.ok ? await info.json().catch(() => null) : null) as { sub?: unknown; preferred_username?: unknown; name?: unknown } | null;
  const sub = u && (typeof u.sub === "string" || typeof u.sub === "number") ? String(u.sub) : "";
  if (!sub || sub.length > 200) throw new Error("userinfo_failed");
  const username = typeof u!.preferred_username === "string" && u!.preferred_username ? u!.preferred_username.slice(0, 80) : null;
  const displayName = typeof u!.name === "string" && u!.name ? u!.name.slice(0, 80) : null;
  return { subject: sub, label: username ?? displayName, username, displayName };
}
