/**
 * The sales beacon endpoint's logic (POST /api/space-studio/beacon). The caller is a Roblox game server running the script from
 * ./beacon-script.ts, authenticated by its experience's beacon token (Authorization: Bearer ssb_...). Only the token's sha256 is
 * stored; the lookup goes hash -> (workspace, universe) and must match the experience's current token.
 *
 * - space_sales  one row per (universe, event id), insertIfAbsent: a retried or replayed batch is never counted twice. Holds the item
 *                id, kind, price and time only. Kept 8 days (events older than 7 days are refused, so a pruned id can't come back).
 * Accepted sales are added to the per-minute and per-hour revenue rows (./stats.ts) at the SALE time.
 */
import { HttpError } from "@/lib/create/platform/http";
import { collection, type Row } from "@/lib/create/platform/store";
import { BEACON_WS, beaconIndex, experiences, hashToken, TOKEN_RE, type ExperienceRow } from "./experiences";
import { hourIso, minuteIso, MINUTE_KEEP_MS, netRobux, revHour, revMin } from "./stats";

export const BEACON_LIMITS = { maxEvents: 50, maxBytes: 32 * 1024, perTokenPerMinute: 120, maxFutureSec: 10 * 60, maxAgeSec: 7 * 86_400, maxRobux: 1_000_000 } as const;

export type SaleEvent = { id: string; kind: "product" | "gamepass"; itemId: number; robux: number; at: number };
type SaleRow = Row & { universeId: string; kind: SaleEvent["kind"]; itemId: number; robux: number; net: number; at: string; t: string };
export const sales = () => collection<SaleRow>("space_sales");

/** The experience a bearer token belongs to, or null (unknown, malformed, rotated or removed). */
export async function beaconOwner(authorization: string | null): Promise<ExperienceRow | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!m || !TOKEN_RE.test(m[1]!)) return null;
  const hash = hashToken(m[1]!);
  const idx = await beaconIndex().get(BEACON_WS, hash);
  if (!idx) return null;
  const exp = await experiences().get(idx.owner, idx.universeId);
  return exp && exp.beaconHash === hash ? exp : null;
}

/** Validates a beacon body. Throws 400 with the first problem; nothing is stored from an invalid batch. */
export function validateEvents(raw: unknown, nowSec: number): SaleEvent[] {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bad = (m: string) => new HttpError(400, m, "invalid_event");
  if (!Array.isArray(b.events)) throw bad("events must be a list.");
  if (b.events.length > BEACON_LIMITS.maxEvents) throw bad(`Send at most ${BEACON_LIMITS.maxEvents} events per request.`);
  return b.events.map((e, i) => {
    const r = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const n = `Event ${i + 1}`;
    if (typeof r.id !== "string" || !/^[A-Za-z0-9{}_:.-]{1,64}$/.test(r.id)) throw bad(`${n}: id must be 1-64 letters, digits or -_{}:.`);
    if (r.kind !== "product" && r.kind !== "gamepass") throw bad(`${n}: kind must be product or gamepass.`);
    if (typeof r.itemId !== "number" || !Number.isSafeInteger(r.itemId) || r.itemId <= 0) throw bad(`${n}: itemId must be a positive integer.`);
    if (typeof r.robux !== "number" || !Number.isInteger(r.robux) || r.robux < 0 || r.robux > BEACON_LIMITS.maxRobux) throw bad(`${n}: robux must be a whole number from 0 to 1,000,000.`);
    if (typeof r.at !== "number" || !Number.isFinite(r.at)) throw bad(`${n}: at must be a unix time in seconds.`);
    if (r.at > nowSec + BEACON_LIMITS.maxFutureSec) throw bad(`${n}: at is in the future.`);
    if (r.at < nowSec - BEACON_LIMITS.maxAgeSec) throw bad(`${n}: at is older than 7 days.`);
    return { id: r.id, kind: r.kind, itemId: r.itemId, robux: r.robux, at: r.at };
  });
}

/** Store a validated batch for one experience. Idempotent per (universe, event id). */
export async function ingest(exp: ExperienceRow, events: SaleEvent[], now = Date.now()): Promise<{ accepted: number; duplicates: number }> {
  const ws = exp.workspaceId;
  const u = exp.universeId;
  const receivedAt = new Date(now).toISOString();
  let accepted = 0;
  let duplicates = 0;
  let newest: string | null = null;
  for (const e of events) {
    const atMs = Math.round(e.at * 1000);
    const at = new Date(atMs).toISOString();
    const net = netRobux(e.robux);
    const put = await sales().insertIfAbsent({ id: `${u}:${e.id}`, workspaceId: ws, universeId: u, kind: e.kind, itemId: e.itemId, robux: e.robux, net, at, t: receivedAt });
    if (!put.inserted) {
      duplicates++;
      continue;
    }
    accepted++;
    const delta = { net, sales: 1, product: e.kind === "product" ? net : 0, gamepass: e.kind === "gamepass" ? net : 0 };
    const zero = { net: 0, sales: 0, product: 0, gamepass: 0 };
    const h = hourIso(atMs);
    await revHour().increment(ws, `${u}:${h}`, delta, { id: `${u}:${h}`, workspaceId: ws, universeId: u, t: h, ...zero });
    if (now - atMs < MINUTE_KEEP_MS) {
      const m = minuteIso(atMs);
      await revMin().increment(ws, `${u}:${m}`, delta, { id: `${u}:${m}`, workspaceId: ws, universeId: u, t: m, ...zero });
    }
    if (!newest || at > newest) newest = at;
  }
  const stored = (await experiences().get(ws, u))?.lastSaleAt ?? null;
  await experiences().update(ws, u, { beaconLastEventAt: receivedAt, ...(newest && (!stored || newest > stored) ? { lastSaleAt: newest } : {}) });
  return { accepted, duplicates };
}
