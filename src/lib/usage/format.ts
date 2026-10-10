/** Client-safe formatting for the Free daily question meter. */
export function formatDailyReset(iso: string, locale?: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "at 00:00 UTC";
  const d = new Date(t);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return `${sameDay ? "today" : "tomorrow"} at ${time}`;
}

/** "47 of 50 left" */
export const dailyLeftText = (m: { left: number; limit: number }) => `${m.left} of ${m.limit} left`;
