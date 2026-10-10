/**
 * Keplar usage cooldown: per-user rolling spend velocity across ALL spend paths.
 *
 * Every metered charge (answers, Create, slides, study, agents, media) lands in the Usage ledger
 * (`compute_ledger`: usd + timestamp, in Neon in production) through `charge` / `chargeUnits`.
 * After each charge `evaluateCooldown` sums the last hour (and the last 30 minutes) from that one
 * ledger. A user who spends faster than the plan allows is put on a cooldown (30 min, 45 min, then
 * 60 min on repeats within 24 h). While it lasts, new paid work is refused with the reset time.
 *
 * - Plus/Pro/Business only. Free spends $0. The admin account (team@keplar.one) is exempt and keeps
 *   its own $25/day cap (spend.ts).
 * - Spend made before a cooldown started never counts toward the next one, so a cooldown cannot
 *   retrigger itself the moment it ends.
 * - Constants live here; each can be overridden with an env var (see `cooldownConfig`).
 */
import { limitsFor, type LimitPlan } from "@/lib/orchestration/limits";
import { formatResetIn } from "@/lib/orchestration/plans";
import { now } from "./ids";
import { collection } from "./store";
import type { Workspace } from "./workspace";

export type CooldownConfig = {
  /** Charged USD (provider cost x the 1.1 margin) allowed per rolling hour, by plan. */
  hourlyUsd: Partial<Record<LimitPlan, number>>;
  /** Cooldown when more than this share of the plan's daily cap is spent inside `quickWindowMin`. */
  quickFraction: number;
  quickWindowMin: number;
  windowMin: number;
  /** Cooldown length by strike (1st, 2nd, 3rd and later), minutes. */
  durationsMin: number[];
  /** A strike is forgotten when the previous cooldown started more than this long ago. */
  strikeMemoryMs: number;
};

const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function cooldownConfig(): CooldownConfig {
  return {
    hourlyUsd: { lite: num("KEPLAR_COOLDOWN_LITE_HOURLY_USD", 0.8), plus: num("KEPLAR_COOLDOWN_PLUS_HOURLY_USD", 2), pro: num("KEPLAR_COOLDOWN_PRO_HOURLY_USD", 4), business: num("KEPLAR_COOLDOWN_BUSINESS_HOURLY_USD", 4) },
    quickFraction: num("KEPLAR_COOLDOWN_QUICK_FRACTION", 0.6),
    quickWindowMin: num("KEPLAR_COOLDOWN_QUICK_WINDOW_MIN", 30),
    windowMin: num("KEPLAR_COOLDOWN_WINDOW_MIN", 60),
    durationsMin: [num("KEPLAR_COOLDOWN_MIN_1", 30), num("KEPLAR_COOLDOWN_MIN_2", 45), num("KEPLAR_COOLDOWN_MIN_3", 60)],
    strikeMemoryMs: 24 * 3_600_000,
  };
}

export type CooldownRow = {
  id: string;
  workspaceId: string;
  /** When the current/last cooldown started and ends (ISO). */
  startedAt: string;
  until: string;
  /** Consecutive cooldowns inside the memory window; picks the length. */
  strikes: number;
  reason: "hourly" | "quick";
  /** USD spent in the window that tripped it. */
  spentUsd: number;
  updatedAt: string;
};

const STATE = "state";
const rows = () => collection<CooldownRow>("usage_cooldown");
type LedgerRow = { id: string; workspaceId: string; usd: number; at: string };
const ledger = () => collection<LedgerRow>("compute_ledger");

/** Plans the cooldown applies to: paid and not admin. */
export const cooldownApplies = (ws: Pick<Workspace, "plan" | "admin" | "anonymous">) => !ws.admin && !ws.anonymous && ws.plan !== "free";

export type CooldownInfo = { until: string; startedAt: string; strikes: number; reason: CooldownRow["reason"]; message: string; remainingMs: number };

export function cooldownMessage(until: string, at = Date.now()): string {
  const t = new Date(until);
  const hhmm = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")} UTC`;
  return `Keplar usage cooldown: you've used a lot in a short time, so new requests are paused for ${formatResetIn(until, at)} (until ${hhmm}). Your credits are kept and nothing is lost. This protects your plan and keeps Keplar fast for everyone.`;
}

export class CooldownError extends Error {
  status = 429;
  code = "cooldown" as const;
  constructor(public info: CooldownInfo) {
    super(info.message);
  }
}

/** The active cooldown for this workspace, or null. */
export async function activeCooldown(ws: Pick<Workspace, "id" | "plan" | "admin" | "anonymous">, at = Date.now()): Promise<CooldownInfo | null> {
  if (!cooldownApplies(ws)) return null;
  const row = await rows().get(ws.id, STATE);
  if (!row) return null;
  const end = new Date(row.until).getTime();
  if (!(end > at)) return null;
  return { until: row.until, startedAt: row.startedAt, strikes: row.strikes, reason: row.reason, message: cooldownMessage(row.until, at), remainingMs: end - at };
}

export async function assertNotCoolingDown(ws: Pick<Workspace, "id" | "plan" | "admin" | "anonymous">, at = Date.now()) {
  const c = await activeCooldown(ws, at);
  if (c) throw new CooldownError(c);
}

/** Charged USD in the last `minutes`, counting only spend after the last cooldown started. */
export async function spentSince(wsId: string, minutes: number, floor: string | null, at = Date.now()): Promise<number> {
  const from = new Date(at - minutes * 60_000).toISOString();
  const gte = floor && floor > from ? floor : from;
  return ledger().sum(wsId, "usd", { field: "at", gte });
}

export type Velocity = { hourUsd: number; quickUsd: number; hourlyLimit: number | null; quickLimit: number | null };

export async function velocity(ws: Pick<Workspace, "id" | "plan">, at = Date.now()): Promise<Velocity> {
  const cfg = cooldownConfig();
  const row = await rows().get(ws.id, STATE);
  const floor = row?.startedAt ?? null;
  const daily = limitsFor(ws.plan as LimitPlan).dailyUsd ?? (cfg.hourlyUsd[ws.plan as LimitPlan] ? (cfg.hourlyUsd[ws.plan as LimitPlan] as number) * 3 : null);
  const [hourUsd, quickUsd] = await Promise.all([spentSince(ws.id, cfg.windowMin, floor, at), spentSince(ws.id, cfg.quickWindowMin, floor, at)]);
  return { hourUsd, quickUsd, hourlyLimit: cfg.hourlyUsd[ws.plan as LimitPlan] ?? null, quickLimit: daily ? daily * cfg.quickFraction : null };
}

/**
 * Called after every successful charge. Starts a cooldown when the velocity is over the limits.
 * Never throws (a metering hiccup must not fail a request that already ran).
 */
export async function evaluateCooldown(ws: Workspace, at = Date.now()): Promise<CooldownInfo | null> {
  try {
    if (!cooldownApplies(ws)) return null;
    const existing = await rows().get(ws.id, STATE);
    if (existing && new Date(existing.until).getTime() > at) return activeCooldown(ws, at);
    const v = await velocity(ws, at);
    const reason: CooldownRow["reason"] | null = v.hourlyLimit !== null && v.hourUsd > v.hourlyLimit ? "hourly" : v.quickLimit !== null && v.quickUsd > v.quickLimit ? "quick" : null;
    if (!reason) return null;
    const cfg = cooldownConfig();
    const strikes = existing && at - new Date(existing.startedAt).getTime() < cfg.strikeMemoryMs ? existing.strikes + 1 : 1;
    const minutes = cfg.durationsMin[Math.min(strikes, cfg.durationsMin.length) - 1];
    const startedAt = new Date(at).toISOString();
    const until = new Date(at + minutes * 60_000).toISOString();
    const next: CooldownRow = { id: STATE, workspaceId: ws.id, startedAt, until, strikes, reason, spentUsd: reason === "hourly" ? v.hourUsd : v.quickUsd, updatedAt: now() };
    if (existing) await rows().update(ws.id, STATE, next);
    else await rows().insertIfAbsent(next);
    console.warn(`[cooldown] ${ws.id} strike ${strikes}, ${minutes} min, ${reason}, $${next.spentUsd.toFixed(2)}`);
    return activeCooldown(ws, at);
  } catch (e) {
    console.error("[cooldown] evaluate failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Test/admin helper: clear a workspace's cooldown and strikes. */
export async function clearCooldown(wsId: string) {
  await rows().remove(wsId, STATE);
}

