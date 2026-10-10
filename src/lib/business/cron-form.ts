/**
 * Agent schedules as people say them: the Agents tab's preset form (every day / weekdays / once a week / every N hours / custom
 * cron) and the chat's words ("every weekday at 9:30am"), both turned into the 5-field cron the agents route validates. Pure and
 * shared, so the tab and the chat card build the same cron; the server still checks it against the plan's fastest schedule.
 */
export type CronMode = "daily" | "weekdays" | "weekly" | "hours" | "custom";
export type CronForm = { mode: CronMode; time: string; dow: string; every: string; custom: string };

export function buildCron(mode: CronMode, time: string, dow: string, every: string, custom: string): string {
  const [h, m] = time.split(":").map((x) => Number(x));
  const hh = Number.isFinite(h) ? h : 8;
  const mm = Number.isFinite(m) ? m : 0;
  if (mode === "daily") return `${mm} ${hh} * * *`;
  if (mode === "weekdays") return `${mm} ${hh} * * 1-5`;
  if (mode === "weekly") return `${mm} ${hh} * * ${dow}`;
  if (mode === "hours") return `${mm} */${Math.max(1, Math.min(23, Number(every) || 6))} * * *`;
  return custom.trim();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The preset form that builds this cron (so editing starts from what is saved), or "custom" with the cron as typed. */
export function formFromCron(cron: string): CronForm {
  const base: CronForm = { mode: "custom", time: "08:00", dow: "1", every: "6", custom: cron };
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return base;
  const [mi, hr, dom, mon, dw] = f;
  if (!/^\d{1,2}$/.test(mi) || dom !== "*" || mon !== "*") return base;
  const mm = Number(mi);
  let n: RegExpExecArray | null;
  if ((n = /^\*\/(\d{1,2})$/.exec(hr)) && dw === "*") return { ...base, mode: "hours", every: String(Number(n[1])), time: `00:${pad(mm)}` };
  if (!/^\d{1,2}$/.test(hr)) return base;
  const time = `${pad(Number(hr))}:${pad(mm)}`;
  if (dw === "*") return { ...base, mode: "daily", time };
  if (dw === "1-5") return { ...base, mode: "weekdays", time };
  if (/^[0-6]$/.test(dw)) return { ...base, mode: "weekly", time, dow: dw };
  return base;
}

const DAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "8am", "8:30 pm", "18:00", "noon", "midnight" -> [hour, minute]. */
export function timeFrom(text: string): [number, number] | null {
  const t = text.trim().toLowerCase();
  if (t === "noon" || t === "midday") return [12, 0];
  if (t === "midnight") return [0, 0];
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.[0];
  if (mi > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === "p" ? 12 : 0); }
  else if (!m[2] && h > 23) return null;
  if (h > 23) return null;
  return [h, mi];
}

/**
 * A schedule in words -> cron: "every day at 8am", "daily at 18:00", "every weekday at 9:30am", "every Monday at 10",
 * "weekly on Fridays at 4pm", "every 6 hours", "hourly". A day-based schedule with no time runs at 08:00. Null when unclear.
 */
export function cronFromWords(text: string): string | null {
  const t = text.toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ").trim();
  let m: RegExpExecArray | null;
  if (/^(?:every hour|hourly|once an hour)$/.test(t)) return "0 * * * *";
  if ((m = /^every (\d{1,2}|two|three|four|six|eight|twelve) hours$/.exec(t))) {
    const n = ({ two: 2, three: 3, four: 4, six: 6, eight: 8, twelve: 12 } as Record<string, number>)[m[1]] ?? Number(m[1]);
    return n >= 1 && n <= 23 ? `0 */${n} * * *` : null;
  }
  const at = /^(.*?)(?:\s+at\s+(.+))?$/.exec(t)!;
  const when = at[1].trim();
  const hm = at[2] ? timeFrom(at[2]) : [8, 0] as [number, number];
  if (!hm) return null;
  const [h, mi] = hm;
  if (/^(?:every day|daily|each day|every morning|every evening|every night|once a day)$/.test(when)) return `${mi} ${h} * * *`;
  if (/^(?:every weekday|weekdays|on weekdays|each weekday|monday to friday|mondays? (?:to|through|-) fridays?)$/.test(when)) return `${mi} ${h} * * 1-5`;
  if ((m = /^(?:every|each|on|weekly on|once a week on) (sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?$/.exec(when))) return `${mi} ${h} * * ${DAY.indexOf(m[1])}`;
  return null;
}
