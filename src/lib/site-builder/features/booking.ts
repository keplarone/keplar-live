/** Appointment slots. Pure functions: given a placeholder's availability and the moment, which start times can be booked. */
export type Availability = { days: Set<number>; startMin: number; endMin: number; slot: number; tz: string };

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseAvailability(attrs: Record<string, string>): Availability {
  const days = new Set<number>();
  for (const part of (attrs.days || "mon-fri").split(",")) {
    const [a, b] = part.split("-");
    const i = DAY_NAMES.indexOf(a);
    const j = b ? DAY_NAMES.indexOf(b) : i;
    if (i < 0 || j < 0) continue;
    for (let d = i; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === j) break;
    }
  }
  const [from, to] = (attrs.hours || "09:00-17:00").split("-");
  const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return { days, startMin: mins(from), endMin: mins(to), slot: Number(attrs.slot || 30), tz: attrs.tz || "UTC" };
}

/** Offset (ms) of `tz` from UTC at the instant `ts`. */
function offsetAt(ts: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(ts / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `tz` reads y-m-d hh:mm. */
export function zonedToUtc(y: number, m: number, d: number, minutes: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let ts = guess - offsetAt(guess, tz);
  ts = guess - offsetAt(ts, tz); // second pass settles the DST edge
  return ts;
}

/** Calendar date (y, m, d, weekday) of instant `ts` in `tz`. */
function dateIn(ts: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

export type Slot = { iso: string; day: string; label: string };

/** Free slots over the next `horizonDays` days, at least `noticeMin` minutes from now, minus those in `taken` (ISO strings). */
export function freeSlots(a: Availability, now: number, taken: Set<string>, horizonDays = 14, noticeMin = 120): Slot[] {
  const out: Slot[] = [];
  const start = dateIn(now, a.tz);
  for (let off = 0; off < horizonDays; off++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + off));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (!a.days.has(day.getUTCDay())) continue;
    for (let t = a.startMin; t + a.slot <= a.endMin; t += a.slot) {
      const ts = zonedToUtc(y, m, d, t, a.tz);
      if (ts < now + noticeMin * 60_000) continue;
      const iso = new Date(ts).toISOString();
      if (taken.has(iso)) continue;
      out.push({ iso, day: new Intl.DateTimeFormat("en-US", { timeZone: a.tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(ts)), label: new Intl.DateTimeFormat("en-US", { timeZone: a.tz, hour: "numeric", minute: "2-digit" }).format(new Date(ts)) });
    }
  }
  return out;
}

export const whenLabel = (iso: string, tz: string) => `${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))} (${tz})`;
