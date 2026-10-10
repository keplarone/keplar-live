/**
 * Keplar Usage costing for Create + Business OS.
 * 1 unit = $0.002 of actual provider spend (same rule as the /app meter).
 * Live mode meters provider-reported cost (OpenRouter `usage.cost`, sandbox
 * CPU-seconds, etc.). Where a provider reports no cost, the catalog estimates
 * below are used (provider price pages checked Sep 2026, docs/create.md §1).
 */
import { collection } from "./store";
import { id, now } from "./ids";
import { EntitlementError } from "./plans";
import type { Workspace } from "./workspace";
import { adminCapped, freePaused, recordAdminSpend, recordSpend } from "./spend";
import { recordWindowUsage, windowMeters, windowRoom } from "./windows";
import { activeCooldown, assertNotCoolingDown, evaluateCooldown } from "./cooldown";
import { BREAKER_NOTICE, breakerLevel, paidMediaPaused } from "./breaker";
import { assertOpsAllows } from "@/lib/ops/controls";
import { canBuyExtension } from "@/lib/billing/extensions";
import { drawExtension, extensionBalance, extensionSummary } from "./extensions";
import { afterChargeOverage, applyChargeMultiplier, costGuardForSpend, ledgerFeature, overageInstead } from "@/lib/cost/hooks";

export const USD_PER_UNIT = 0.002;
export const toUnits = (usd: number) => Math.max(1, Math.ceil(usd / USD_PER_UNIT));

/** Catalog estimates in USD (TODO(founder approval): estimates, not prices). */
export const COST_ESTIMATES_USD = {
  "site.generate": 0.25, // ~30k in / 15k out tokens on a mid-tier coding model
  "site.iterate": 0.08,
  "sandbox.preview": 0.005, // Vercel Sandbox: ~2 min wall, ~30 s active CPU
  "site.deploy": 0.01, // static build + upload
  "domain.add": 0, // no per-domain fee on Vercel Pro
  "scan.site": 0.001,
  "agent.step": 0.01, // one small-model call
  "agent.run.base": 0.002,
  "email.send": 0,
  "social.post": 0,
  "mcp.call": 0.002, // one call to a connected app server (egress + handshake); the server's own cost is not ours
} as const;

export type MeteredAction = keyof typeof COST_ESTIMATES_USD | "image.generate" | "video.generate" | "site.build" | "site.edit" | "photo.read" | "site.enhance" | "app.build" | "app.ai" | "app.design";

export function estimateUnits(action: MeteredAction, usd?: number): number {
  const base = usd ?? (COST_ESTIMATES_USD as Record<string, number>)[action] ?? 0;
  return base === 0 ? 0 : toUnits(base);
}

/** `extUnits`: the part of `units` paid from purchased extension credits (not from the plan allowance, so not counted against it). */
type LedgerRow = { id: string; workspaceId: string; action: string; units: number; usd: number; ref?: string; at: string; estimated: boolean; extUnits?: number; feature?: string };
const ledger = () => collection<LedgerRow>("compute_ledger");

export async function usedThisPeriod(ws: Workspace): Promise<number> {
  const { start, end } = ws.period;
  const range = { field: "at", gte: start, lt: end };
  const [all, ext] = await Promise.all([ledger().sum(ws.id, "units", range), ledger().sum(ws.id, "extUnits", range)]);
  return Math.max(0, all - ext);
}

/** Extension credits apply to paid, non-admin accounts only (Free uses free models and has no credits to extend). */
const extendable = (ws: Workspace) => !ws.admin && canBuyExtension(ws.plan);

/** Credits the plan's own allowance still covers right now: the tighter of the monthly credits and the rolling windows. */
async function baseLeft(ws: Workspace, used?: number): Promise<number> {
  const u = used ?? (await usedThisPeriod(ws));
  const room = await windowRoom(ws);
  return Math.max(0, Math.min(ws.entitlements.monthlyUnits - u, room.remaining));
}

/**
 * Split a charge into the part the plan's allowance covers and the part bought extension credits cover (spent only once
 * the allowance or a window is used up). The extension part is debited here, atomically.
 */
async function fund(ws: Workspace, units: number): Promise<{ base: number; ext: number }> {
  if (!extendable(ws) || !(units > 0)) return { base: units, ext: 0 };
  if ((await extensionBalance(ws.id)) <= 0) return { base: units, ext: 0 };
  const want = Math.max(0, units - (await baseLeft(ws)));
  if (want === 0) return { base: units, ext: 0 };
  const got = await drawExtension(ws.id, want);
  return { base: units - got, ext: got };
}
/** @deprecated use usedThisPeriod (resets on the billing date). */
export const usedThisMonth = usedThisPeriod;

/** Stop before starting when the allowance can't cover the estimate. No silent downgrade. */
export async function assertCanSpend(ws: Workspace, units: number, opts: { paidMedia?: boolean; kind?: "text" | "media" | "agent" } = {}) {
  // Operator kill switches first: global stop, media pause, agent pause (nothing is charged).
  await assertOpsAllows(opts.kind ?? (opts.paidMedia ? "media" : "text"));
  // Usage cooldown (spend velocity across every path); admin and Free are exempt.
  await assertNotCoolingDown(ws);
  // Cost guard (src/lib/cost): per-feature kill switch, negative-margin throttle, quotas, Free daily limits.
  await costGuardForSpend(ws);
  if (opts.paidMedia && units > 0 && paidMediaPaused(await breakerLevel())) {
    throw new EntitlementError("Image and video generation is paused for the rest of today because Keplar's daily budget is nearly used. It resumes at 00:00 UTC.");
  }
  if (ws.plan === "free" && (await freePaused())) {
    throw new EntitlementError("Free usage is paused for the rest of today because of high demand. It resumes at midnight UTC, or upgrade to keep going.", "plus");
  }
  if (ws.admin && (await adminCapped())) {
    throw new EntitlementError("The daily safety cap for this account is reached. It resets at 00:00 UTC.");
  }
  const room = await windowRoom(ws, units);
  // Bought extension credits cover what the allowance or a window cannot. Every cap above (cooldown, breakers, pauses) already applied.
  if (extendable(ws) && units > 0) {
    const bal = await extensionBalance(ws.id);
    if (bal > 0) {
      const left = Math.max(0, Math.min(ws.entitlements.monthlyUnits - (await usedThisPeriod(ws)), room.remaining));
      if (units <= left + bal) return;
    }
  }
  // Opt-in pay-as-you-go overage (flag, Plus/Pro) continues past the plan's limits up to the person's cap.
  if (await overageInstead(ws, units, async () => Boolean(room.blocked) || (await usedThisPeriod(ws)) + units > ws.entitlements.monthlyUnits)) return;
  if (room.blocked) throw new EntitlementError(room.blocked.message, ws.plan === "lite" ? "plus" : ws.plan === "plus" ? "pro" : undefined);
  const used = await usedThisPeriod(ws);
  if (used + units > ws.entitlements.monthlyUnits) {
    throw new EntitlementError(`This needs about ${units} credits and ${Math.max(0, ws.entitlements.monthlyUnits - used)} are left this period.`);
  }
}

export async function charge(ws: Workspace, action: MeteredAction, opts: { usd?: number; ref?: string } = {}) {
  const usd = opts.usd ?? (COST_ESTIMATES_USD as Record<string, number>)[action] ?? 0;
  const units = applyChargeMultiplier(estimateUnits(action, usd), action);
  if (units === 0) return 0;
  const f = await fund(ws, units);
  await ledger().insert({ id: id("cu"), workspaceId: ws.id, action, units, usd, ref: opts.ref, at: now(), estimated: opts.usd === undefined, feature: ledgerFeature(action), ...(f.ext > 0 ? { extUnits: f.ext } : {}) });
  await afterChargeOverage(ws, units, usd, () => usedThisPeriod(ws));
  await recordSpend(usd, ws.plan);
  await recordWindowUsage(ws, f.base);
  if (ws.admin) await recordAdminSpend(usd);
  await evaluateCooldown(ws);
  return units;
}

/** Record units already computed elsewhere (the /app orchestrator's own estimate or billed cost). */
export async function chargeUnits(ws: Workspace, action: string, units: number, usd: number, ref?: string) {
  if (!(units > 0)) return 0;
  units = applyChargeMultiplier(units, action);
  const f = await fund(ws, Math.ceil(units));
  await ledger().insert({ id: id("cu"), workspaceId: ws.id, action, units: Math.ceil(units), usd, ref, at: now(), estimated: true, feature: ledgerFeature(action), ...(f.ext > 0 ? { extUnits: f.ext } : {}) });
  await afterChargeOverage(ws, Math.ceil(units), usd, () => usedThisPeriod(ws));
  await recordSpend(usd, ws.plan);
  await recordWindowUsage(ws, f.base);
  if (ws.admin) await recordAdminSpend(usd);
  await evaluateCooldown(ws);
  return Math.ceil(units);
}

export async function meter(ws: Workspace) {
  const used = await usedThisPeriod(ws);
  const total = ws.entitlements.monthlyUnits;
  const paused = ws.plan === "free" ? await freePaused() : false;
  const windows = await windowMeters(ws);
  const cd = await activeCooldown(ws);
  const level = await breakerLevel();
  const extension = extendable(ws) ? await extensionSummary(ws.id) : null;
  return {
    extension,
    used, total: Number.isFinite(total) ? total : null, plan: ws.plan, periodStart: ws.period.start, resetsAt: ws.period.end, paused, admin: ws.admin, windows,
    cooldown: cd ? { until: cd.until, startedAt: cd.startedAt, strikes: cd.strikes, message: cd.message } : null,
    breaker: { level, notice: BREAKER_NOTICE[level] },
  };
}
