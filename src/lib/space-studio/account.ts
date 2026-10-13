/**
 * Space Studio account view: who is signed in, how (Keplar / Google), what is linked (Roblox), and what the stored Space Studio
 * plan allows. Identities are keyed by (provider, subject), never by email; matching emails never merge accounts.
 *
 * - keplar: the signed-in Keplar account itself (label = its email). Always present while signed in, never unlinkable here.
 * - google: shown as linked only when THIS session was started with Google (known from the session record when the account
 *   database is connected). Google sign-in resolves to the same Keplar account by verified email, so it is managed by the
 *   account, not unlinked here.
 * - roblox: a connection proven by Roblox OAuth (./roblox-oauth.ts), stored in space_identities. It is not a sign-in method yet
 *   (there is no "Sign in with Roblox"), so canSignIn is false.
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

export type SpaceSession = { userId: string; email: string; sessionId: string; authAt: number | null };

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
  return { userId: s.user.id, email: s.user.email, sessionId: s.session.id, authAt: Number.isFinite(at) ? at : null };
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
