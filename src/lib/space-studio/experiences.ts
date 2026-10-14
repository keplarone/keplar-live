/**
 * Experiences a Space Studio workspace tracks (at most 10), and their sales beacons.
 *
 * Collections (all rows are real data from Roblox's public APIs or from the person's own game; nothing is estimated here):
 * - space_experiences  per workspace, id = universe id: name, root place, icon, when it was added, the beacon token's HASH, when the
 *                      beacon last posted, the newest live counters sample and the newest sale time.
 * - space_beacons      system rows (workspace "space_beacon"), id = sha256(beacon token) -> { owner workspace, universe }. The token
 *                      itself is shown once and never stored. insertIfAbsent makes the claim unique.
 * - space_ccu_min / space_ccu_hour / space_rev_min / space_rev_hour / space_sales: see ./stats.ts and ./beacon.ts.
 */
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/create/platform/http";
import { collection, type Row } from "@/lib/create/platform/store";
import { beaconScript } from "./beacon-script";
import { gameIcon, gamesInfo, universeForPlace } from "./roblox-api";

export const MAX_EXPERIENCES = 10;
export const BEACON_WS = "space_beacon";

export type LastSample = { at: string; playing: number; visits: number; favorites: number };
export type ExperienceRow = Row & {
  universeId: string;
  placeId: string | null;
  name: string;
  iconUrl: string | null;
  addedAt: string;
  beaconHash: string;
  /** Last authenticated beacon post (a sale batch or the script's start-up hello). Null: the beacon never connected. */
  beaconLastEventAt: string | null;
  lastSampleAt: number | null;
  last: LastSample | null;
  lastSaleAt: string | null;
};
type BeaconIndexRow = Row & { owner: string; universeId: string; createdAt: string };

export const experiences = () => collection<ExperienceRow>("space_experiences");
export const beaconIndex = () => collection<BeaconIndexRow>("space_beacons");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newBeaconToken = () => `ssb_${randomBytes(32).toString("base64url")}`;
export const TOKEN_RE = /^ssb_[A-Za-z0-9_-]{43}$/;

const ID = /^[1-9]\d{0,19}$/;

/**
 * What the person pasted -> a place id or a universe id. Accepts a roblox.com game URL (https://www.roblox.com/games/<placeId>/...,
 * also with a locale segment or ?placeId=), a bare place id, or "universe:<id>".
 */
export function parseExperienceLink(raw: unknown): { placeId: string } | { universeId: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  const bad = () => new HttpError(400, "Paste a Roblox game link (roblox.com/games/...), a place id, or universe:<id>.", "bad_link");
  if (!s || s.length > 500) throw bad();
  const uni = /^universe:\s*(\d+)$/i.exec(s);
  if (uni) {
    if (!ID.test(uni[1]!)) throw bad();
    return { universeId: uni[1]! };
  }
  if (ID.test(s)) return { placeId: s };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw bad();
  }
  const host = u.hostname.toLowerCase();
  if (!(host === "roblox.com" || host.endsWith(".roblox.com"))) throw bad();
  const m = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/(\d+)(?:\/|$)/i.exec(u.pathname);
  const placeId = m?.[1] ?? u.searchParams.get("placeId") ?? "";
  if (!ID.test(placeId)) throw bad();
  return { placeId };
}

export type ExperienceView = { universeId: string; placeId: string | null; name: string; iconUrl: string | null; addedAt: string; beacon: { connected: boolean; lastEventAt: string | null } };

export const experienceView = (r: ExperienceRow): ExperienceView => ({
  universeId: r.universeId, placeId: r.placeId, name: r.name, iconUrl: r.iconUrl, addedAt: r.addedAt,
  beacon: { connected: r.beaconLastEventAt !== null, lastEventAt: r.beaconLastEventAt },
});

export async function listExperiences(wsId: string): Promise<ExperienceRow[]> {
  return (await experiences().list(wsId)).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

const beaconOut = (token: string) => ({ token, script: beaconScript(token) });

async function claimToken(wsId: string, universeId: string, now: string): Promise<{ token: string; hash: string }> {
  for (let i = 0; i < 3; i++) {
    const token = newBeaconToken();
    const hash = hashToken(token);
    if ((await beaconIndex().insertIfAbsent({ id: hash, workspaceId: BEACON_WS, owner: wsId, universeId, createdAt: now })).inserted) return { token, hash };
  }
  throw new HttpError(503, "Couldn't create a beacon token. Try again.", "beacon_unavailable");
}

/** Resolve the link with Roblox, store the experience and a fresh beacon. The token is returned once. */
export async function addExperience(wsId: string, link: unknown, now = Date.now()) {
  const ref = parseExperienceLink(link);
  const current = await listExperiences(wsId);
  if (current.length >= MAX_EXPERIENCES) throw new HttpError(409, `You can track up to ${MAX_EXPERIENCES} experiences. Remove one first.`, "too_many_experiences");
  const universeId = "universeId" in ref ? ref.universeId : await universeForPlace(ref.placeId);
  const notFound = () => new HttpError(404, "Roblox doesn't know that game. Check the link.", "experience_not_found");
  if (!universeId) throw notFound();
  if (current.some((e) => e.universeId === universeId)) throw new HttpError(409, "You already track this experience.", "experience_exists");
  const game = (await gamesInfo([universeId])).get(universeId);
  if (!game) throw notFound();
  const iconUrl = await gameIcon(universeId);
  const at = new Date(now).toISOString();
  const { token, hash } = await claimToken(wsId, universeId, at);
  const row: ExperienceRow = {
    id: universeId, workspaceId: wsId, universeId, placeId: "placeId" in ref ? ref.placeId : game.rootPlaceId, name: game.name, iconUrl, addedAt: at,
    beaconHash: hash, beaconLastEventAt: null, lastSampleAt: null, last: null, lastSaleAt: null,
  };
  const put = await experiences().insertIfAbsent(row);
  if (!put.inserted) {
    await beaconIndex().remove(BEACON_WS, hash);
    throw new HttpError(409, "You already track this experience.", "experience_exists");
  }
  return { experience: experienceView(row), beacon: beaconOut(token) };
}

/** New beacon token for a tracked experience; the old one stops working at once. */
export async function rotateBeacon(wsId: string, universeId: string, now = Date.now()) {
  const row = await experiences().get(wsId, universeId);
  if (!row) throw new HttpError(404, "You don't track that experience.", "experience_not_found");
  const { token, hash } = await claimToken(wsId, universeId, new Date(now).toISOString());
  await experiences().update(wsId, universeId, { beaconHash: hash });
  await beaconIndex().remove(BEACON_WS, row.beaconHash);
  return beaconOut(token);
}

/** Stop tracking: the experience, its beacon and every sample and sale recorded for it in this workspace. */
export async function removeExperience(wsId: string, universeId: string) {
  const row = await experiences().get(wsId, universeId);
  if (!row) throw new HttpError(404, "You don't track that experience.", "experience_not_found");
  await experiences().remove(wsId, universeId);
  await beaconIndex().remove(BEACON_WS, row.beaconHash);
  const { purgeUniverseData } = await import("./stats");
  await purgeUniverseData(wsId, universeId);
}

/** Account deletion: beacon index rows are system rows (not owned by the workspace), so they are freed explicitly. */
export async function freeBeaconClaims(wsId: string): Promise<number> {
  let n = 0;
  for (const r of await beaconIndex().list(BEACON_WS, (x) => x.owner === wsId)) if (await beaconIndex().remove(BEACON_WS, r.id)) n++;
  return n;
}
