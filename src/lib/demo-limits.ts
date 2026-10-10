/**
 * Landing-page live demo caps. Guests try Ask on the home page without an account. The request goes to the normal /api/keplar
 * pipeline, so the server's Free anonymous limits (per-person daily questions, free models only, shared-pool governor) still
 * apply and are the real guard; these numbers are the demo's own, smaller allowance shown in the UI. Change them here only.
 */
export const DEMO_DAILY_LIMIT = 5;
export const DEMO_MAX_PROMPT_CHARS = 400;
export const DEMO_BURST_PER_MIN = 3;
/** Client counter (localStorage) so the UI can show remaining tries without a round-trip. */
export const DEMO_STORAGE_KEY = "keplar-demo-v1";

export function demoDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type DemoLedger = { day: string; used: number; recent: number[] };

/** Pure: may a guest ask now, and what does the ledger look like after they do. */
export function demoCheck(l: DemoLedger | null, now: number): { ok: true; next: DemoLedger; left: number } | { ok: false; reason: "daily" | "burst"; left: number } {
  const day = demoDay(new Date(now));
  const cur: DemoLedger = l && l.day === day ? l : { day, used: 0, recent: [] };
  const recent = cur.recent.filter((t) => now - t < 60_000);
  if (cur.used >= DEMO_DAILY_LIMIT) return { ok: false, reason: "daily", left: 0 };
  if (recent.length >= DEMO_BURST_PER_MIN) return { ok: false, reason: "burst", left: DEMO_DAILY_LIMIT - cur.used };
  const next = { day, used: cur.used + 1, recent: [...recent, now] };
  return { ok: true, next, left: DEMO_DAILY_LIMIT - next.used };
}
