/**
 * Space Studio account view: who is signed in, how (Keplar / Google), what is linked (Roblox), and what the stored Space Studio
 * plan allows. Identities are keyed by (provider, subject), never by email; matching emails never merge accounts.
 *
 * - keplar: the signed-in Keplar account itself (label = its email). Always present while signed in, never unlinkable here.
 * - google: shown as linked only when THIS session was started with Google (known from the session record when the account
 *   database is connected). Google sign-in resolves to the same Keplar account by verified email, so it is managed by the
 *   account, not unlinked here.
 * - roblox: a connection proven by Roblox OAuth (./roblox-oauth.ts), stored in space_identities. Once linked, it can also be used
 *   to sign in to this account ("Sign in with Roblox", ./roblox-signin.ts); the stored canSignIn flag stays false because the
 *   Keplar account (email) remains the account's own sign-in method and unlinking Roblox never strands anyone.
 *
 * robloxRequired: the core (Roblox) workspace needs a linked Roblox account only once Roblox OAuth is configured on the server
 * (ROBLOX_OAUTH_CLIENT_ID + ROBLOX_OAUTH_CLIENT_SECRET). Without it, linking is impossible, so it is not required.
 */
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { getSession } from "@/lib/accounts/auth";
import { HttpError } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { isSameOrigin } from "@/lib/security/origin";
import { listSessions, persistenceEnabled } from "@/lib/accounts/persist";
import { enabledOAuthProviders } from "@/lib/accounts/oauth";
import { effectivePlan, PLANS, unlinkBlockedReason, type Identity, type Provider, type Subscription } from "./core";
import { loadIdentities } from "./store";

/** Signed-in owner of a Space Studio request (personal workspace). Writes: same-origin and rate limited, like Roblox Cloud. */
export async function spaceOwner(req: Request, write: boolean, limit = 60): Promise<Workspace> {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req); // 401 when signed out
  if (ws.anonymous || !ws.userId) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
  assertSameAccount(req, ws.userId);
  if (write) await rateLimit(`space-studio:${ws.id}`, limit, 60, { shared: true });
  return ws;
}

export type SpaceSession = { userId: string; email: string; sessionId: string; authAt: number | null; name?: string | null; image?: string | null };

export const robloxOAuthConfigured = (env: Record<string, string | undefined> = process.env) => Boolean(env.ROBLOX_OAUTH_CLIENT_ID?.trim() && env.ROBLOX_OAUTH_CLIENT_SECRET?.trim());

export function providersView(env: Record<string, string | undefined> = process.env) {
  return { keplar: true as const, google: enabledOAuthProviders(env).google, roblox: robloxOAuthConfigured(env) };
}

/**
 * The session's sign-in time. Better Auth keeps the session's createdAt across the sliding cookie refresh, so it is when the
 * person last actually signed in. Null when unknown: linking and unlinking then ask for a fresh sign-in.
 */
export async function spaceSession(req: Request): Promise<SpaceSession | null> {
  const s = await getSession(req.headers);
  if (!s) return null;
  const at = Date.parse(String(s.session.createdAt ?? ""));
  const u = s.user as { name?: unknown; image?: unknown };
  return { userId: s.user.id, email: s.user.email, sessionId: s.session.id, authAt: Number.isFinite(at) ? at : null, name: typeof u.name === "string" ? u.name : null, image: typeof u.image === "string" ? u.image : null };
}

async function sessionProvider(s: SpaceSession): Promise<string | null> {
  if (!persistenceEnabled()) return null;
  try {
    return (await listSessions(s.userId)).find((r) => r.id === s.sessionId)?.provider ?? null;
  } catch {
    return null;
  }
}

/** All identities of the signed-in account: derived (keplar, google) + stored (roblox). */
export async function allIdentities(wsId: string, s: SpaceSession): Promise<Identity[]> {
  const t = s.authAt ? new Date(s.authAt).toISOString() : new Date(0).toISOString();
  const out: Identity[] = [{ provider: "keplar", subject: s.userId, label: s.email, linkedAt: t, canSignIn: true }];
  if ((await sessionProvider(s)) === "google") out.push({ provider: "google", subject: `account:${s.userId}`, label: s.email, linkedAt: t, canSignIn: true });
  for (const i of await loadIdentities(wsId)) if (i.provider === "roblox") out.push(i);
  return out;
}

/** Derived identities belong to the Keplar account and can't be unlinked from Space Studio. */
export const DERIVED: ReadonlySet<Provider> = new Set(["keplar", "google"]);

export type IdentityView = { provider: Provider; linked: boolean; label: string | null; linkedAt: string | null; canUnlink: boolean; unlinkBlockedReason: string | null };

export function identityViews(ids: Identity[]): IdentityView[] {
  const providers: Provider[] = ["keplar", "google", "roblox"];
  return providers.map((p) => {
    const i = ids.find((x) => x.provider === p);
    if (!i) return { provider: p, linked: false, label: null, linkedAt: null, canUnlink: false, unlinkBlockedReason: null };
    const blocked = DERIVED.has(p) ? (p === "keplar" ? "Your Keplar account" : "Part of your Keplar account (same verified email)") : unlinkBlockedReason(ids, p);
    return { provider: p, linked: true, label: i.label, linkedAt: p === "keplar" ? null : i.linkedAt, canUnlink: !blocked, unlinkBlockedReason: blocked };
  });
}

/** The contract's plan block, from the STORED subscription only. */
export function planView(sub: Subscription | null, now = Date.now()) {
  const plan = effectivePlan(sub, now);
  const status: "active" | "none" | "expired" | "canceled" = !sub || sub.plan === "free" ? "none"
    : plan !== "free" ? "active"
    : sub.status === "canceled" ? "canceled" : "expired";
  return { id: plan, name: PLANS[plan].name, status, renewsAt: plan !== "free" && sub?.status !== "canceled" ? sub?.periodEnd ?? null : null };
}

export type MeProfile = { displayName: string; username: string | null; avatarUrl: string | null };
const PROFILE_TTL_MS = 24 * 3_600_000;
const PROFILE_FAIL_TTL_MS = 10 * 60_000;
const httpsOrNull = (v: string | null | undefined) => (v && /^https:\/\//.test(v) && v.length <= 2000 ? v : null);

/**
 * The person's display profile for /me. With a linked Roblox account: its display name, username and avatar headshot (Roblox's
 * public users and thumbnails APIs, 3 s timeouts, cached on the identities row for 24 h; null fields when Roblox didn't answer).
 * Otherwise: the Keplar account's name (or the email's local part) and its picture when the account has one (e.g. from Google).
 */
export async function meProfile(wsId: string, s: SpaceSession, now = Date.now()): Promise<MeProfile> {
  const local = s.email.split("@")[0] || s.email;
  const rb = (await loadIdentities(wsId)).find((i) => i.provider === "roblox");
  if (!rb) return { displayName: s.name?.trim() || local, username: null, avatarUrl: httpsOrNull(s.image) };
  const { loadRobloxProfileCache, saveRobloxProfileCache } = await import("./store");
  let c = await loadRobloxProfileCache(wsId);
  if (!c || c.subject !== rb.subject || now - c.fetchedAt >= (c.ok ? PROFILE_TTL_MS : PROFILE_FAIL_TTL_MS)) {
    const { robloxHeadshot, robloxUser } = await import("./roblox-api");
    const [user, avatarUrl] = await Promise.all([robloxUser(rb.subject), robloxHeadshot(rb.subject)]);
    c = { subject: rb.subject, username: user?.username ?? null, displayName: user?.displayName ?? null, avatarUrl, fetchedAt: now, ok: Boolean(user && avatarUrl) };
    await saveRobloxProfileCache(wsId, c).catch(() => undefined);
  }
  return { displayName: c.displayName ?? rb.label ?? s.name?.trim() ?? local, username: c.username ?? rb.label ?? null, avatarUrl: httpsOrNull(c.avatarUrl) };
}
