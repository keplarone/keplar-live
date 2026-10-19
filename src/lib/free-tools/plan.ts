/**
 * Study plan scheduler: a day-by-day plan from a topic list, an exam date and weekly hours. Pure and deterministic, so it
 * runs in the browser. Each topic is studied once in the first part of the time (hard topics get double weight), reviewed
 * about two and five days later in the time kept free for reviews, and everything is reviewed in the last days, hard topics first.
 */
export type PlanInput = { topics: string; exam: string; hoursPerWeek: number; daysPerWeek: number; today: string };
export type PlanItem = { topic: string; kind: "learn" | "review" | "final"; minutes: number; hard: boolean };
export type PlanDay = { date: string; items: PlanItem[]; minutes: number };
export type Plan = { ok: true; days: PlanDay[]; warnings: string[]; minutesPerDay: number; totalMinutes: number; topics: { name: string; hard: boolean }[] } | { ok: false; error: string };

const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

export function parseTopics(text: string): { name: string; hard: boolean }[] {
  const seen = new Set<string>();
  const out: { name: string; hard: boolean }[] = [];
  for (const raw of text.split("\n")) {
    const hard = /^\s*\*/.test(raw);
    const name = raw.replace(/^\s*\*\s*/, "").trim().slice(0, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, hard });
  }
  return out.slice(0, 40);
}

export function buildPlan(input: PlanInput): Plan {
  const topics = parseTopics(input.topics);
  if (!topics.length) return { ok: false, error: "List at least one topic." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.exam)) return { ok: false, error: "Enter the exam date." };
  const hours = Number(input.hoursPerWeek);
  if (!Number.isFinite(hours) || hours < 1 || hours > 80) return { ok: false, error: "Hours per week must be between 1 and 80." };
  const perWeek = Math.min(7, Math.max(1, Math.round(Number(input.daysPerWeek) || 6)));
  const span = daysBetween(input.today, input.exam);
  if (span < 1) return { ok: false, error: "The exam date must be after today." };
  // Study days: the first `perWeek` days of every seven, from today up to the day before the exam.
  const dates: string[] = [];
  for (let i = 0; i < Math.min(span, 365); i++) if (i % 7 < perWeek) dates.push(addDays(input.today, i));
  if (!dates.length) return { ok: false, error: "There is no study day before the exam." };
  const minutesPerDay = Math.max(15, Math.round((hours * 60) / perWeek));
  const N = dates.length;
  const finalDays = N >= 4 ? Math.min(2, Math.max(1, Math.floor(N * 0.15))) : N >= 2 ? 1 : 0;
  const learnDays = Math.max(1, Math.min(N - finalDays, Math.ceil((N - finalDays) * 0.6)));
  const weight = (t: { hard: boolean }) => (t.hard ? 2 : 1);
  const totalWeight = topics.reduce((n, t) => n + weight(t), 0);
  // First study is spread over the learning window and takes at most 60% of each day; the rest of every day is kept for the
  // spaced reviews that follow, so reviews land near their due day instead of piling up after all the first study.
  const cap = minutesPerDay;
  const learnCap = Math.max(15, Math.round(cap * 0.6));
  const learnBudget = learnDays * learnCap;
  const learnMinutes = new Map(topics.map((t) => [t.name, Math.max(20, Math.round((learnBudget * weight(t)) / totalWeight))]));
  const days: (PlanDay & { learn: number })[] = dates.map((date) => ({ date, items: [], minutes: 0, learn: 0 }));
  const warnings: string[] = [];
  const roomOn = (i: number, kind: PlanItem["kind"]) => (kind === "learn" ? Math.min(cap - days[i].minutes, learnCap - days[i].learn) : cap - days[i].minutes);
  // Place a block on the first day at or after `from` with room; split across days when a block is longer than a day.
  const place = (from: number, until: number, item: PlanItem): number => {
    let left = item.minutes;
    let last = from;
    for (let i = from; i < Math.min(until, days.length) && left > 0; i++) {
      const room = roomOn(i, item.kind);
      if (room < Math.min(15, left)) continue;
      const take = Math.min(room, left);
      days[i].items.push({ ...item, minutes: take });
      days[i].minutes += take;
      if (item.kind === "learn") days[i].learn += take;
      left -= take;
      last = i;
    }
    if (left > 0) {
      // No room before the deadline: put the rest on the last allowed day over capacity rather than dropping it.
      const i = Math.min(days.length - 1, Math.max(from, Math.min(until, days.length) - 1));
      days[i].items.push({ ...item, minutes: left });
      days[i].minutes += left;
      if (item.kind === "learn") days[i].learn += left;
      last = i;
    }
    return last;
  };
  const learnEnd = N - finalDays;
  let cursor = 0;
  const firstStudy = new Map<string, number>();
  for (const t of topics) {
    const last = place(cursor, learnEnd, { topic: t.name, kind: "learn", minutes: learnMinutes.get(t.name)!, hard: t.hard });
    firstStudy.set(t.name, last);
    cursor = days[last].learn >= learnCap ? last + 1 : last;
  }
  for (const t of topics) {
    const s = firstStudy.get(t.name)!;
    const base = learnMinutes.get(t.name)!;
    for (const [gap, share] of [[2, 0.4], [5, 0.25]] as const) {
      const at = s + gap;
      if (at >= learnEnd) continue;
      place(at, learnEnd, { topic: t.name, kind: "review", minutes: Math.max(10, Math.round(base * share)), hard: t.hard });
    }
  }
  if (finalDays > 0) {
    const finalBudget = finalDays * cap;
    const ordered = [...topics].sort((a, b) => Number(b.hard) - Number(a.hard));
    let from = learnEnd;
    for (const t of ordered) {
      const last = place(from, N, { topic: t.name, kind: "final", minutes: Math.max(10, Math.round((finalBudget * weight(t)) / totalWeight)), hard: t.hard });
      from = days[last].minutes >= cap ? last + 1 : last;
    }
  }
  const totalMinutes = days.reduce((n, d) => n + d.minutes, 0);
  const over = days.filter((d) => d.minutes > cap * 1.25).length;
  if (over) warnings.push(`${over} day${over > 1 ? "s" : ""} run${over > 1 ? "" : "s"} well over your daily time. Add hours, drop a topic, or start earlier.`);
  if (learnDays * cap / topics.length < 25) warnings.push("There is less than half an hour of first study per topic. The plan will feel rushed; consider fewer topics or more hours.");
  if (finalDays === 0) warnings.push("With so few days there is no final review pass; everything is first study.");
  return { ok: true, days: days.filter((d) => d.items.length).map(({ date, items, minutes }) => ({ date, items, minutes })), warnings, minutesPerDay, totalMinutes, topics };
}
