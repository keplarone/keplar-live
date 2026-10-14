/**
 * Roblox's public web APIs (no keys, no cookies): place -> universe, experience details and live counters, icons, user profiles
 * and avatar headshots. Every call has a timeout and returns null (or throws a "roblox_unavailable" HttpError where the caller must
 * tell "not found" from "Roblox didn't answer") instead of a guess. Nothing here ever sends a Roblox cookie or password.
 *
 * `fetch` is read at call time, so tests can replace globalThis.fetch.
 */
import { HttpError } from "@/lib/create/platform/http";

const TIMEOUT_MS = 8_000;

async function getJson(url: string, timeoutMs = TIMEOUT_MS): Promise<{ status: number; data: unknown } | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch {
    return null;
  }
}

const unavailable = () => new HttpError(502, "Roblox didn't answer. Try again in a minute.", "roblox_unavailable");
const isId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length > 1000) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
};

/** Place id -> universe id. Null when Roblox says the place doesn't exist; throws roblox_unavailable when it didn't answer. */
export async function universeForPlace(placeId: string): Promise<string | null> {
  const r = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  if (!r || r.status >= 500 || r.status === 429) throw unavailable();
  if (r.status !== 200) return null;
  const u = (r.data as { universeId?: unknown } | null)?.universeId;
  return isId(u) ? String(u) : null;
}

export type GameInfo = { universeId: string; rootPlaceId: string | null; name: string; playing: number | null; visits: number | null; favorites: number | null };

function gameFrom(raw: unknown): GameInfo | null {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isId(g.id) || typeof g.name !== "string") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
  return { universeId: String(g.id), rootPlaceId: isId(g.rootPlaceId) ? String(g.rootPlaceId) : null, name: g.name.slice(0, 120), playing: n(g.playing), visits: n(g.visits), favorites: n(g.favoritedCount) };
}

/** Details and live counters for up to 50 universes in one call. Throws roblox_unavailable when Roblox didn't answer. */
export async function gamesInfo(universeIds: string[]): Promise<Map<string, GameInfo>> {
  const out = new Map<string, GameInfo>();
  if (!universeIds.length) return out;
  if (universeIds.length > 50) throw new Error("at most 50 universes per call");
  const r = await getJson(`https://games.roblox.com/v1/games?universeIds=${universeIds.join(",")}`);
  if (!r || r.status !== 200) throw unavailable();
  const list = (r.data as { data?: unknown } | null)?.data;
  if (Array.isArray(list)) for (const raw of list) {
    const g = gameFrom(raw);
    if (g) out.set(g.universeId, g);
  }
  return out;
}

/** The experience icon (150x150 PNG on Roblox's CDN), or null when Roblox has none ready or didn't answer. */
export async function gameIcon(universeId: string): Promise<string | null> {
  const r = await getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`);
  const item = r?.status === 200 ? ((r.data as { data?: unknown[] } | null)?.data?.[0] as { state?: unknown; imageUrl?: unknown } | undefined) : undefined;
  return item && (item.state === undefined || item.state === "Completed") ? httpsUrl(item.imageUrl) : null;
}

/** A Roblox user's public profile (username and display name), or null. */
export async function robloxUser(userId: string, timeoutMs = 3_000): Promise<{ username: string; displayName: string } | null> {
  if (!/^\d{1,20}$/.test(userId)) return null;
  const r = await getJson(`https://users.roblox.com/v1/users/${userId}`, timeoutMs);
  const u = r?.status === 200 ? (r.data as { name?: unknown; displayName?: unknown } | null) : null;
  if (!u || typeof u.name !== "string") return null;
  return { username: u.name.slice(0, 80), displayName: (typeof u.displayName === "string" && u.displayName ? u.displayName : u.name).slice(0, 80) };
}

/** The avatar headshot (150x150 PNG), or null. */
export async function robloxHeadshot(userId: string, timeoutMs = 3_000): Promise<string | null> {
  if (!/^\d{1,20}$/.test(userId)) return null;
  const r = await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`, timeoutMs);
  const item = r?.status === 200 ? ((r.data as { data?: unknown[] } | null)?.data?.[0] as { state?: unknown; imageUrl?: unknown } | undefined) : undefined;
  return item && (item.state === undefined || item.state === "Completed") ? httpsUrl(item.imageUrl) : null;
}
