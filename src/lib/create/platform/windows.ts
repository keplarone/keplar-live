/**
 * Rolling usage windows (5-hour and weekly) for Plus and Pro, enforced server-side.
 * Config: src/lib/orchestration/plans.ts (WINDOW_LIMITS, USAGE_WINDOWS). Counters live in the
 * store (Neon in production), one row per workspace and window, so every instance sees the same
 * numbers. Increments are atomic; an expired window is replaced by a fresh one on the next charge.
 * Admin and plans without limits are exempt.
 */
import { USAGE_WINDOWS, windowLimitsFor, formatResetIn, formatResetDay, type WindowId } from "@/lib/orchestration/plans";
import { collection } from "./store";
import type { Workspace } from "./workspace";

type WindowRow = { id: string; workspaceId: string; start: string; end: string; units: number };
/** One collection per window; a row per opened window, id = its start time. */
const rows = (id: WindowId) => collection<WindowRow>(`usage_window_${id}`);
const IDS: WindowId[] = ["fiveHour", "weekly"];

/** The live window: the earliest unexpired row (a racing creator may leave a later, empty one). */
async function liveRow(wsId: string, id: WindowId, at: number): Promise<WindowRow | null> {
  const live = (await rows(id).list(wsId, (r) => new Date(r.end).getTime() > at)).sort((x, y) => x.start.localeCompare(y.start));
  return live[0] ?? null;
}

export type WindowMeter = { id: WindowId; label: string; used: number; limit: number; resetsAt: string | null };

/** The limits that apply to this workspace, or null (Free, Business, admin). */
export const windowLimitsOf = (ws: Pick<Workspace, "plan" | "admin">) => (ws.admin ? null : windowLimitsFor(ws.plan));

export async function windowMeters(ws: Workspace, at = Date.now()): Promise<WindowMeter[] | null> {
  const limits = windowLimitsOf(ws);
  if (!limits) return null;
  return Promise.all(
    IDS.map(async (id) => {
      const live = await liveRow(ws.id, id, at);
      return { id, label: USAGE_WINDOWS[id].label, used: live ? Math.round(live.units) : 0, limit: limits[id], resetsAt: live ? live.end : null };
    }),
  );
}

/** Count credits against both windows (after a successful charge). The increment is atomic in the store. */
export async function recordWindowUsage(ws: Workspace, units: number, at = Date.now()) {
  const limits = windowLimitsOf(ws);
  if (!limits || !(units > 0)) return;
  for (const id of IDS) {
    let live = await liveRow(ws.id, id, at);
    if (!live) {
      // Window closed (or never opened): drop old rows and open a new one starting now.
      // Only expired rows go: a racing request may already have opened (and charged) the new one.
      for (const old of await rows(id).list(ws.id, (r) => new Date(r.end).getTime() <= at)) await rows(id).remove(ws.id, old.id);
      const start = new Date(at).toISOString();
      await rows(id).insertIfAbsent({ id: start, workspaceId: ws.id, start, end: new Date(at + USAGE_WINDOWS[id].ms).toISOString(), units: 0 });
      live = await liveRow(ws.id, id, at);
    }
    if (!live) continue;
    await rows(id).increment(ws.id, live.id, { units }, live);
    // Racing creators can open two rows a millisecond apart; readers use the earliest. If ours is no longer the earliest, move the units
    // there so the count the meter reads is the whole count (this was a rare lost increment: ~1 in 300 bursts of 12 first charges).
    const head = await liveRow(ws.id, id, at);
    if (head && head.id !== live.id) {
      await rows(id).increment(ws.id, head.id, { units }, head);
      await rows(id).increment(ws.id, live.id, { units: -units }, live);
    }
  }
}

export type WindowBlock = { id: WindowId; label: string; resetsAt: string; remaining: number; message: string };

export function windowMessage(m: Pick<WindowMeter, "id" | "label">, resetsAt: string, plan: Workspace["plan"], at = Date.now()) {
  const when = m.id === "weekly" ? `It resets in ${formatResetIn(resetsAt, at)} (${formatResetDay(resetsAt)}).` : `It resets in ${formatResetIn(resetsAt, at)}.`;
  const up = plan === "plus" ? " Upgrade to Pro for higher limits." : plan === "lite" ? " Upgrade to Plus for higher limits." : "";
  return `You've reached your ${m.label.toLowerCase()} usage limit. ${when} Your monthly credits are kept.${up}`;
}

/**
 * Credits left in the tightest window (Infinity when none apply), and the window that binds.
 * `blocked` is set when a window has no credits left, or fewer than `needs`.
 */
export async function windowRoom(ws: Workspace, needs = 0, at = Date.now()): Promise<{ remaining: number; binding: WindowBlock | null; blocked: WindowBlock | null }> {
  const meters = await windowMeters(ws, at);
  if (!meters) return { remaining: Infinity, binding: null, blocked: null };
  let binding: WindowBlock | null = null;
  let remaining = Infinity;
  for (const m of meters) {
    const left = Math.max(0, m.limit - m.used);
    if (left < remaining) {
      remaining = left;
      binding = { id: m.id, label: m.label, resetsAt: m.resetsAt ?? new Date(at + USAGE_WINDOWS[m.id].ms).toISOString(), remaining: left, message: windowMessage(m, m.resetsAt ?? new Date(at + USAGE_WINDOWS[m.id].ms).toISOString(), ws.plan, at) };
    }
  }
  const blocked = binding && (remaining <= 0 || (needs > 0 && needs > remaining)) ? binding : null;
  return { remaining, binding, blocked };
}
