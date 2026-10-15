/**
 * Computation reuse: exact, deterministic, short-lived, per person. Never "similar enough".
 *
 * What is reused (each a pure function of its input, so a stored result is exactly what recomputing would give):
 *   - transcribe:v1  a speech-to-text result for byte-identical audio (the same chunk re-sent by a retry or a re-attached video),
 *                    keyed with the engine tier (free and paid engines give different text);
 *   - link:v1        what Keplar read at a URL (fetch + extract), for the same URL and reading limits.
 * What is NOT reused, on purpose: answers. An answer depends on the conversation, memory, the date and the panel, and a near-identical
 * prompt can need a different answer; approximate matching would trade correctness for cost.
 *
 * Privacy: these endpoints promise "nothing is stored", so results live only in this server instance's memory: scoped to the person
 * (workspace + person, the signed device cookie, or the IP when signed out without one: never shared across people), for minutes,
 * bounded in count and bytes, and never written to disk or the database. Errors are never cached. Identical work already in flight
 * is shared instead of started twice (single-flight). Hit, miss, share, store and skip counts are kept (counts only) for /admin.
 */
import { keepAlive } from "@/lib/create/platform/after";
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";

export type ReusePolicy = { ns: string; version: number; ttlMs: number; maxValueBytes: number };

export const REUSE = {
  transcribe: { ns: "transcribe", version: 1, ttlMs: 15 * 60_000, maxValueBytes: 64_000 },
  link: { ns: "link", version: 1, ttlMs: 10 * 60_000, maxValueBytes: 400_000 },
} as const satisfies Record<string, ReusePolicy>;

const MAX_ENTRIES = 400;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

type Entry = { value: unknown; bytes: number; expires: number; ns: string };
const entries = new Map<string, Entry>(); // insertion order = least recently used first
const inflight = new Map<string, Promise<unknown>>();
let totalBytes = 0;

type Counts = { hit: number; miss: number; shared: number; store: number; skip: number; tooLarge: number };
const zero = (): Counts => ({ hit: 0, miss: 0, shared: 0, store: 0, skip: 0, tooLarge: 0 });
const counts = new Map<string, Counts>();
const pending = new Map<string, Counts>();
const bump = (ns: string, k: keyof Counts) => {
  (counts.get(ns) ?? counts.set(ns, zero()).get(ns)!)[k]++;
  (pending.get(ns) ?? pending.set(ns, zero()).get(ns)!)[k]++;
  maybeFlush();
};

const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");

/** The person a result belongs to. Signed out: the signed device id, else the IP. */
export const reuseScope = (ws: { id: string; anonymous: boolean; userId?: string | null }, o: { deviceId?: string | null; ip?: string }): string =>
  ws.anonymous ? (o.deviceId ? `dev:${o.deviceId}` : `ip:${o.ip ?? "unknown"}`) : `ws:${ws.id}:u:${ws.userId ?? "owner"}`;

const keyOf = (p: ReusePolicy, scope: string, input: string | Uint8Array) => `${p.ns}:v${p.version}:${sha(`${scope}\u0000${sha(input)}`)}`;

function evict(now: number) {
  for (const [k, e] of entries) if (e.expires <= now) { entries.delete(k); totalBytes -= e.bytes; }
  while (entries.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
    const first = entries.keys().next();
    if (first.done) break;
    const e = entries.get(first.value)!;
    entries.delete(first.value);
    totalBytes -= e.bytes;
  }
}

/**
 * The stored result for exactly this input and person, or compute it once. `skip`: the caller says this input must not be reused
 * (a sensitive context); it is computed and nothing is kept. A compute error propagates and is never cached.
 */
export async function reuse<T>(p: ReusePolicy, scope: string | null, input: string | Uint8Array, compute: () => Promise<T>, o: { skip?: boolean; now?: () => number } = {}): Promise<{ value: T; hit: boolean }> {
  const now = o.now ?? Date.now;
  if (!scope || o.skip) {
    bump(p.ns, "skip");
    return { value: await compute(), hit: false };
  }
  const key = keyOf(p, scope, input);
  const t = now();
  const e = entries.get(key);
  if (e && e.expires > t) {
    entries.delete(key);
    entries.set(key, e); // most recently used
    bump(p.ns, "hit");
    return { value: e.value as T, hit: true };
  }
  if (e) { entries.delete(key); totalBytes -= e.bytes; }
  const running = inflight.get(key);
  if (running) {
    bump(p.ns, "shared");
    return { value: (await running) as T, hit: true };
  }
  bump(p.ns, "miss");
  const job = compute();
  inflight.set(key, job);
  try {
    const value = await job;
    const bytes = JSON.stringify(value ?? null).length;
    if (bytes > p.maxValueBytes) bump(p.ns, "tooLarge");
    else {
      entries.set(key, { value, bytes, expires: now() + p.ttlMs, ns: p.ns });
      totalBytes += bytes;
      bump(p.ns, "store");
      evict(now());
    }
    return { value, hit: false };
  } finally {
    inflight.delete(key);
  }
}

/** Forget one input's result (for example after the person changes what a link should read). */
export function invalidate(p: ReusePolicy, scope: string, input: string | Uint8Array): boolean {
  const key = keyOf(p, scope, input);
  const e = entries.get(key);
  if (!e) return false;
  entries.delete(key);
  totalBytes -= e.bytes;
  return true;
}

/** This instance's counts and memory use (counts only, never keys or values). */
export function reuseStats(): { namespaces: Record<string, Counts & { hitRate: number | null }>; entries: number; bytes: number } {
  const namespaces: Record<string, Counts & { hitRate: number | null }> = {};
  for (const [ns, c] of counts) {
    const asked = c.hit + c.shared + c.miss;
    namespaces[ns] = { ...c, hitRate: asked ? (c.hit + c.shared) / asked : null };
  }
  return { namespaces, entries: entries.size, bytes: totalBytes };
}

/* ── daily counts across instances, for /admin/reliability (counts only) ── */

type DayRow = { id: string; workspaceId: "system"; day: string; ns: string } & Counts;
const days = () => collection<DayRow>("system_reuse_day");
let lastFlush = 0;

function maybeFlush(at = Date.now()): void {
  if (at - lastFlush < 60_000) return;
  lastFlush = at;
  keepAlive(flushReuseCounts(at), "reuse counts");
}

export async function flushReuseCounts(at = Date.now()): Promise<void> {
  const day = new Date(at).toISOString().slice(0, 10);
  const batch = [...pending.entries()];
  pending.clear();
  for (const [ns, c] of batch) {
    await days().increment("system", `${day}:${ns}`, { ...c }, { id: `${day}:${ns}`, workspaceId: "system", day, ns, ...zero() });
  }
}

/** Last `n` days of counts per namespace. */
export async function reuseDays(n = 7, at = Date.now()): Promise<{ ns: string; hit: number; shared: number; miss: number; store: number; skip: number; hitRate: number | null }[]> {
  const from = new Date(at - n * 864e5).toISOString().slice(0, 10);
  const rows = await days().listSystem((r) => r.day >= from);
  const by = new Map<string, Counts>();
  for (const r of rows) {
    const c = by.get(r.ns) ?? by.set(r.ns, zero()).get(r.ns)!;
    for (const k of Object.keys(c) as (keyof Counts)[]) c[k] += r[k] ?? 0;
  }
  return [...by.entries()].map(([ns, c]) => {
    const asked = c.hit + c.shared + c.miss;
    return { ns, hit: c.hit, shared: c.shared, miss: c.miss, store: c.store, skip: c.skip, hitRate: asked ? (c.hit + c.shared) / asked : null };
  });
}

/** Tests only. */
export function resetReuse(): void {
  entries.clear();
  inflight.clear();
  counts.clear();
  pending.clear();
  totalBytes = 0;
  lastFlush = 0;
}
