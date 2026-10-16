/**
 * How the chat's email and calendar cards turn what the person sees into what is sent. Pure and client-safe.
 */

export const isAddress = (s: string | undefined) => /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]{2,}$/.test((s ?? "").trim());

const pad = (n: number) => String(Math.abs(Math.trunc(n))).padStart(2, "0");

/** "+02:00" / "-04:00" for a UTC offset in minutes east of UTC. */
export function offsetText(minutesEast: number): string {
  return `${minutesEast < 0 ? "-" : "+"}${pad(minutesEast / 60)}:${pad(minutesEast % 60)}`;
}

/**
 * Start and end as RFC 3339 times with the person's own offset on that day (so a Friday after a clock change is still right).
 * `offsetAt` is injectable for tests; by default it is the device's time zone.
 */
export function eventTimes(date: string, time: string, minutes: number, offsetAt: (local: Date) => number = (d) => -d.getTimezoneOffset()): { start: string; end: string } | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const tm = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (!dm || !tm || !(minutes > 0)) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2])];
  const startLocal = new Date(y, mo, d, h, mi);
  const endLocal = new Date(startLocal.getTime() + minutes * 60_000);
  const stamp = (l: Date) => `${l.getFullYear()}-${pad(l.getMonth() + 1)}-${pad(l.getDate())}T${pad(l.getHours())}:${pad(l.getMinutes())}:00${offsetText(offsetAt(l))}`;
  return { start: stamp(startLocal), end: stamp(endLocal) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The calendar tile on the event card: "Oct" over "16", with "Friday" under it. */
export function dateTile(date: string | undefined): { month: string; day: string; weekday: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return { month: MONTHS[d.getUTCMonth()], day: String(d.getUTCDate()), weekday: DAYS[d.getUTCDay()] };
}

/** "3:00 PM – 3:30 PM" for the card's summary line. */
export function timeRange(time: string | undefined, minutes: number | undefined): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (!m) return null;
  const at = (total: number) => {
    const h = Math.floor(total / 60) % 24;
    return `${h % 12 || 12}:${pad(total % 60)} ${h < 12 ? "AM" : "PM"}`;
  };
  const start = Number(m[1]) * 60 + Number(m[2]);
  return minutes ? `${at(start)} – ${at(start + minutes)}` : at(start);
}

/** Gmail's own compose window with the draft filled in: the person sends it there. Used when Gmail can't be connected here. */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const q = new URLSearchParams({ view: "cm", fs: "1", ...(to ? { to } : {}), su: subject, body });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/** Google Calendar's own "new event" page with the event filled in (local, floating time): the person saves it there. */
export function calendarTemplateUrl(title: string, date: string, time: string, minutes: number, details = ""): string | null {
  const t = eventTimes(date, time, minutes, () => 0);
  if (!t) return null;
  const compact = (s: string) => s.slice(0, 19).replace(/[-:]/g, "");
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${compact(t.start)}/${compact(t.end)}`, ...(details ? { details } : {}) });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
