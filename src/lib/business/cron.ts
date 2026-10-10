/**
 * Minimal 5-field cron matcher (minute hour day-of-month month day-of-week). UTC unless an IANA time zone is given
 * (then the fields are the wall clock of that zone, so "0 8 * * *" in America/New_York stays 8:00 across daylight saving).
 * Supports `*`, `n`, `a-b`, lists, and `/step`. Day-of-week 0 and 7 are Sunday.
 * When both day fields are restricted, a day matches if either does (Vixie cron).
 * Agent templates store UTC crons (e.g. "0 14 * * 1-5" = weekdays 10:00 ET in EDT).
 */
type Field = { values: Set<number>; any: boolean };

const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function parseField(src: string, [lo, hi]: [number, number]): Field {
  const values = new Set<number>();
  for (const part of src.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bad cron step: ${part}`);
    let a: number, b: number;
    if (range === "*") [a, b] = [lo, hi];
    else if (range.includes("-")) [a, b] = range.split("-").map(Number) as [number, number];
    else {
      a = Number(range);
      b = stepRaw === undefined ? a : hi;
    }
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < lo || b > hi || a > b) throw new Error(`Bad cron field: ${part}`);
    for (let v = a; v <= b; v += step) values.add(v);
  }
  return { values, any: src === "*" };
}

export type Cron = { fields: Field[] };

export function parseCron(expr: string): Cron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Cron must have 5 fields: "${expr}"`);
  const fields = parts.map((p, i) => parseField(p, RANGES[i]));
  if (fields[4].values.has(7)) fields[4].values.add(0);
  return { fields };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Throws for a name Intl does not know. */
export function assertTimeZone(tz: string): string {
  try {
    formatter(tz);
    return tz;
  } catch {
    throw new Error(`Unknown time zone: ${tz}`);
  }
}

/** Offset (minutes, local minus UTC) of `tz` at instant `ms`. */
function offsetMinutes(tz: string, ms: number): number {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** A Date whose UTC getters read as the wall clock of `tz` at `d`. Offsets are cached per hour (zones change offset on the hour). */
const offCache = new Map<string, number>();
function wall(d: Date, tz?: string): Date {
  if (!tz || tz === "UTC") return d;
  const bucket = Math.floor(d.getTime() / 3_600_000);
  const key = `${tz}|${bucket}`;
  let off = offCache.get(key);
  if (off === undefined) {
    if (offCache.size > 20_000) offCache.clear();
    off = offsetMinutes(tz, bucket * 3_600_000);
    offCache.set(key, off);
  }
  return new Date(d.getTime() + off * 60_000);
}

export function cronMatches(expr: string | Cron, d: Date, tz?: string): boolean {
  const { fields } = typeof expr === "string" ? parseCron(expr) : expr;
  const [min, hour, dom, mon, dow] = fields;
  const w = wall(d, tz);
  if (!min.values.has(w.getUTCMinutes()) || !hour.values.has(w.getUTCHours()) || !mon.values.has(w.getUTCMonth() + 1)) return false;
  const domOk = dom.values.has(w.getUTCDate());
  const dowOk = dow.values.has(w.getUTCDay());
  if (dom.any || dow.any) return dom.any ? dowOk : domOk;
  return domOk || dowOk;
}

const floorMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

/** Most recent matching minute in (at - windowMinutes, at], as an ISO string, or null. */
export function latestSlot(expr: string, at: Date, windowMinutes: number, tz?: string): string | null {
  const cron = parseCron(expr);
  const start = floorMinute(at).getTime();
  for (let i = 0; i < windowMinutes; i++) {
    const t = new Date(start - i * 60_000);
    if (cronMatches(cron, t, tz)) return t.toISOString();
  }
  return null;
}

/** Next matching minute strictly after `from` (searches up to ~1 year). */
export function nextSlot(expr: string, from: Date, tz?: string): string | null {
  const cron = parseCron(expr);
  const t = floorMinute(from).getTime() + 60_000;
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const d = new Date(t + i * 60_000);
    if (cronMatches(cron, d, tz)) return d.toISOString();
  }
  return null;
}

/**
 * The shortest gap, in minutes, between two runs of this schedule, looking at the 15 days after `from`
 * (a schedule that runs less than twice in 8 days returns 15 days). Used to hold each plan to its fastest allowed cadence.
 */
export function minIntervalMinutes(expr: string, tz?: string, from: Date = new Date()): number {
  const cron = parseCron(expr);
  const start = floorMinute(from).getTime();
  let last: number | null = null;
  let best = 15 * 1440;
  for (let i = 1; i <= 15 * 1440; i++) {
    const t = start + i * 60_000;
    if (!cronMatches(cron, new Date(t), tz)) continue;
    if (last !== null) best = Math.min(best, (t - last) / 60_000);
    last = t;
  }
  return best;
}

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
/** Plain words for the common shapes; anything else is shown as the cron itself. */
export function describeCron(expr: string, tz?: string): string {
  const where = tz && tz !== "UTC" ? ` (${tz})` : " UTC";
  try {
    parseCron(expr);
  } catch {
    return expr;
  }
  const [m, h, dom, mon, dow] = expr.trim().split(/\s+/);
  const num = (x: string) => /^\d+$/.test(x);
  if (num(m) && num(h) && dom === "*" && mon === "*") {
    if (dow === "*") return `Every day at ${hhmm(+h, +m)}${where}`;
    if (dow === "1-5") return `Weekdays at ${hhmm(+h, +m)}${where}`;
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (/^[0-7](,[0-7])*$/.test(dow)) return `${dow.split(",").map((d) => names[+d]).join(" + ")} at ${hhmm(+h, +m)}${where}`;
  }
  if (num(m) && /^\*\/\d+$/.test(h) && dom === "*" && mon === "*" && dow === "*") return `Every ${h.slice(2)} hours at :${String(m).padStart(2, "0")}`;
  if (/^\*\/\d+$/.test(m) && h === "*" && dom === "*" && mon === "*" && dow === "*") return `Every ${m.slice(2)} minutes`;
  return `${expr}${where}`;
}
