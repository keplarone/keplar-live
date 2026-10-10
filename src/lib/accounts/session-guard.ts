/**
 * Server-side check of a cookie session against the Neon records (see persist.ts).
 * Shared by `getSession` and the session endpoints. No database: the cookie session is returned unchanged.
 * A database error fails closed: a session we cannot check is treated as signed out.
 */
import { persistenceEnabled, validateSession, type Validation } from "./persist";
import { ipFromHeaders } from "./persist";

type Sess = {
  session: { id: string; userId: string; createdAt: Date | string; expiresAt: Date | string; updatedAt?: Date | string };
  user: { id: string; email: string; name?: string | null };
};

const CACHE_MS = 15_000;
const g = globalThis as unknown as { __keplarSessionOk?: Map<string, { userId: string; at: number }> };
const cache = () => (g.__keplarSessionOk ??= new Map());

/** Called after a revoke on this instance so the change is visible immediately here (others see it within CACHE_MS). */
export const forgetSession = (id: string) => void cache().delete(id);
export const forgetAllSessions = () => cache().clear();

export async function guardSession<T extends Sess>(s: T | null, headers: Headers | null | undefined): Promise<T | null> {
  if (!s || !persistenceEnabled()) return s;
  const id = s.session.id;
  const hit = cache().get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.userId === s.user.id ? s : { ...s, user: { ...s.user, id: hit.userId }, session: { ...s.session, userId: hit.userId } };
  let v: Validation;
  try {
    v = await validateSession({
      id,
      userId: s.user.id,
      email: s.user.email,
      name: s.user.name,
      createdAt: new Date(s.session.createdAt),
      expiresAt: new Date(s.session.expiresAt),
      userAgent: headers?.get("user-agent"),
      ip: ipFromHeaders(headers),
    });
  } catch {
    console.error("[auth] session store unavailable; refusing the cookie session");
    cache().delete(id);
    return null;
  }
  if (!v.ok) {
    cache().delete(id);
    return null;
  }
  const map = cache();
  if (map.size > 5000) map.clear();
  map.set(id, { userId: v.userId, at: Date.now() });
  return v.userId === s.user.id ? s : { ...s, user: { ...s.user, id: v.userId }, session: { ...s.session, userId: v.userId } };
}
