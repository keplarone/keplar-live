/**
 * "Friday", "tomorrow at 3pm", "next Tuesday at 10:30", "on Oct 23 at noon": the day and time a chat request names, read
 * against the person's local day. Pure and client-safe.
 *
 * It only reads what the words say. A missing time stays missing (the event card asks for it); nothing is guessed silently.
 */

export type When = {
  /** YYYY-MM-DD, when the words name a day. */
  date?: string;
  /** HH:MM (24-hour), when the words name a time. */
  time?: string;
  /** Minutes, when the words name a length ("for an hour", "30 minutes"). */
  minutes?: number;
  /** The words it was read from, shown on the card ("next Friday at 3pm"). */
  words: string;
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayOf = (today: string) => new Date(`${today}T00:00:00Z`);
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const DAY_RE = /\b(?:(this|next|on)\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b/i;
const MONTH_DAY_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b|\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
const TIME_RE = /\b(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\W|$)|\bat\s+(\d{1,2}):(\d{2})\b|\bat\s+(\d{1,2})\b(?!\s*(?:min|hour|hr))|\b(noon|midday|midnight)\b/i;
const LENGTH_RE = /\bfor\s+(?:an?\s+)?(half an hour|(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h)|hour)\b|\b(\d+)\s*(?:-\s*)?(minutes?|mins?)\b/i;

function dayFrom(t: string, today: string): { date: string; words: string } | null {
  const base = dayOf(today);
  let m = /\b(today|tonight|tomorrow|tmrw|day after tomorrow)\b/i.exec(t);
  if (m) {
    const w = m[1].toLowerCase();
    return { date: iso(plus(base, w === "today" || w === "tonight" ? 0 : w === "day after tomorrow" ? 2 : 1)), words: m[0] };
  }
  m = MONTH_DAY_RE.exec(t);
  if (m) {
    const mon = MONTHS.indexOf((m[1] ?? m[4]).slice(0, 3).toLowerCase());
    const day = Number(m[2] ?? m[3]);
    if (mon >= 0 && day >= 1 && day <= 31) {
      let year = base.getUTCFullYear();
      let d = new Date(Date.UTC(year, mon, day));
      if (d.getUTCMonth() !== mon) return null; // Feb 30
      if (d < base) d = new Date(Date.UTC(++year, mon, day));
      return { date: iso(d), words: m[0] };
    }
  }
  m = DAY_RE.exec(t);
  if (m) {
    const want = DAYS.findIndex((d) => d.startsWith(m![2].toLowerCase().slice(0, 3)));
    if (want < 0) return null;
    // "Friday" / "this Friday" / "next Friday": the next Friday after today (today's own day counts as next week's).
    let ahead = (want - base.getUTCDay() + 7) % 7 || 7;
    if (m[1]?.toLowerCase() === "this" && want === base.getUTCDay()) ahead = 0;
    return { date: iso(plus(base, ahead)), words: m[0] };
  }
  return null;
}

function timeFrom(t: string): { time: string; words: string } | null {
  const m = TIME_RE.exec(t);
  if (!m) return null;
  if (m[7]) return { time: m[7].toLowerCase() === "midnight" ? "00:00" : "12:00", words: m[0] };
  let h: number;
  let min = 0;
  if (m[1]) {
    h = Number(m[1]);
    min = Number(m[2] ?? 0);
    const pm = m[3].toLowerCase().startsWith("p");
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (pm ? 12 : 0);
  } else if (m[4]) {
    h = Number(m[4]);
    min = Number(m[5]);
  } else {
    // "at 3": a bare hour reads as working hours (8 to 11 morning, 12 to 7 afternoon/evening).
    h = Number(m[6]);
    if (h < 1 || h > 12) return null;
    if (h <= 7) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return { time: `${pad(h)}:${pad(min)}`, words: m[0] };
}

function lengthFrom(t: string): { minutes: number; words: string } | null {
  const m = LENGTH_RE.exec(t);
  if (!m) return null;
  if (m[4]) return { minutes: Number(m[4]), words: m[0] };
  if (/half an hour/i.test(m[1])) return { minutes: 30, words: m[0] };
  if (/^hour$/i.test(m[1])) return { minutes: 60, words: m[0] };
  const n = Number(m[2]);
  const minutes = /^h/i.test(m[3]) ? Math.round(n * 60) : Math.round(n);
  return minutes >= 5 && minutes <= 24 * 60 ? { minutes, words: m[0] } : null;
}

/** The day, time and length the words name, or null when they name none of them. */
export function whenFrom(text: string, today: string): When | null {
  const day = dayFrom(text, today);
  const time = timeFrom(text);
  const len = lengthFrom(text);
  if (!day && !time && !len) return null;
  const words = [day?.words, time?.words, len?.words].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { ...(day ? { date: day.date } : {}), ...(time ? { time: time.time } : {}), ...(len ? { minutes: len.minutes } : {}), words };
}

/** The words with every day, time and length phrase removed (what is left is the title, the people and the place). */
export function withoutWhen(text: string): string {
  return text
    .replace(/\b(?:on\s+|this\s+|next\s+)?(?:today|tonight|tomorrow|tmrw|day after tomorrow)\b/gi, " ")
    .replace(new RegExp(MONTH_DAY_RE.source, "gi"), " ")
    .replace(new RegExp(DAY_RE.source, "gi"), " ")
    .replace(new RegExp(TIME_RE.source, "gi"), " ")
    .replace(new RegExp(LENGTH_RE.source, "gi"), " ")
    .replace(/\s+(?:on|at|for|from)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
