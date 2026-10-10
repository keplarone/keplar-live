/**
 * An exam date from words ("Nov 3", "November 3rd", "3 November 2026", "11/3", "2026-11-03", "tomorrow", "in 3 weeks", "next
 * Friday"), for "my exam is on Nov 3" in the chat. Pure: `today` is the person's local day (YYYY-MM-DD). The result is a YYYY-MM-DD
 * day from today on; a date without a year is the next one to come. Anything unclear is null (the card then asks in the Plan tab).
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/** The person's local day, YYYY-MM-DD. */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function valid(y: number, m: number, d: number): Date | null {
  if (!(m >= 0 && m < 12 && d >= 1 && d <= 31)) return null;
  const x = utc(y, m, d);
  return x.getUTCMonth() === m ? x : null;
}

/** With no year: this year's date, or next year's when it has passed. */
function upcoming(t: Date, m: number, d: number): Date | null {
  const a = valid(t.getUTCFullYear(), m, d);
  if (a && a >= t) return a;
  return valid(t.getUTCFullYear() + 1, m, d);
}

export function examDateFrom(text: string, today: string): string | null {
  const tm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!tm) return null;
  const t = utc(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]));
  const s = text.toLowerCase().replace(/[,.]/g, " ").replace(/\b(?:on|the|of|it's|its)\b/g, " ").replace(/\s+/g, " ").trim();
  let out: Date | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) out = valid(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  else if (s === "today") out = t;
  else if (s === "tomorrow") out = utc(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1);
  else if ((m = /^in (\d{1,3}|a|one|two|three|four|five|six) (day|week|month)s?$/.exec(s))) {
    const n = ({ a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 } as Record<string, number>)[m[1]] ?? Number(m[1]);
    out = m[2] === "month" ? valid(t.getUTCFullYear(), t.getUTCMonth() + n, t.getUTCDate()) ?? utc(t.getUTCFullYear(), t.getUTCMonth() + n + 1, 0) : utc(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + n * (m[2] === "week" ? 7 : 1));
    if (m[2] === "month" && out.getUTCFullYear() > t.getUTCFullYear() + 5) out = null;
  } else if ((m = /^(?:(next|this) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(s))) {
    // "Friday" and "next Friday" are both the coming Friday (a week out when today is Friday); M/D dates are US order.
    let add = (DAYS.indexOf(m[2]) - t.getUTCDay() + 7) % 7;
    if (add === 0) add = 7;
    out = utc(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + add);
  } else if ((m = /^([a-z]{3,9}) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(s)) || (m = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})(?: (\d{4}))?$/.exec(s))) {
    const [mon, day] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const mi = MONTHS.indexOf(mon.slice(0, 3));
    if (mi >= 0 && (mon.length === 3 || mon === "sept" || "january february march april may june july august september october november december".split(" ").includes(mon))) {
      out = m[3] ? valid(Number(m[3]), mi, Number(day)) : upcoming(t, mi, Number(day));
    }
  } else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(s))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    out = y ? valid(y, Number(m[1]) - 1, Number(m[2])) : upcoming(t, Number(m[1]) - 1, Number(m[2]));
  }
  if (!out || out < t || out.getUTCFullYear() > t.getUTCFullYear() + 5) return null;
  return iso(out);
}
