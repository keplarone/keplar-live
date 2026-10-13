// Synced from keplarone/space-studio src/core — edit there, then copy.
/**
 * Space Studio plans and entitlements. Independent from Keplar One and Keplar Business subscriptions.
 *
 * Every decision here is made on the server from the stored subscription record (written only by verified billing events).
 * Nothing a client sends — a plan label, a cached flag, a request field — is ever an input to these functions.
 * Prices are not published: they will be set after measuring real inference, compute, storage and support costs (docs/pricing.md).
 */
import type { ModelId, PlanId } from "./models";
import { MODELS } from "./models";

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired" | "revoked";
export type Subscription = {
  plan: PlanId;
  status: SubscriptionStatus;
  /** End of the paid period (ISO). Past it, the paid plan no longer applies. */
  periodEnd: string | null;
  /** Billing events already applied (idempotency). */
  appliedEvents: string[];
  updatedAt: string;
  /** Monotonic order of the last applied billing event (provider timestamp, ms). Older events never override newer ones. */
  lastEventAt: number;
};

export type PlanFeatures = {
  name: string;
  cloud: boolean;
  maxConcurrentCloudJobs: number;
  cloudMinutesMonthly: number;
  gpuRenderMinutesMonthly: number;
  storageMb: number;
  models: ModelId[];
  team: boolean;
};

const RANK: Record<PlanId, number> = { free: 0, plus: 1, pro: 2, team: 3, enterprise: 4 };
const modelsFor = (p: PlanId) => MODELS.filter((m) => RANK[m.minPlan] <= RANK[p]).map((m) => m.id);

export const PLANS: Record<PlanId, PlanFeatures> = {
  free: { name: "Space Studio Free", cloud: false, maxConcurrentCloudJobs: 0, cloudMinutesMonthly: 0, gpuRenderMinutesMonthly: 0, storageMb: 500, models: modelsFor("free"), team: false },
  plus: { name: "Space Studio Plus", cloud: false, maxConcurrentCloudJobs: 0, cloudMinutesMonthly: 0, gpuRenderMinutesMonthly: 0, storageMb: 5_000, models: modelsFor("plus"), team: false },
  pro: { name: "Space Studio Pro", cloud: true, maxConcurrentCloudJobs: 2, cloudMinutesMonthly: 600, gpuRenderMinutesMonthly: 0, storageMb: 25_000, models: modelsFor("pro"), team: false },
  team: { name: "Space Studio Team", cloud: true, maxConcurrentCloudJobs: 4, cloudMinutesMonthly: 2_400, gpuRenderMinutesMonthly: 0, storageMb: 100_000, models: modelsFor("team"), team: true },
  enterprise: { name: "Space Studio Enterprise", cloud: true, maxConcurrentCloudJobs: 8, cloudMinutesMonthly: 10_000, gpuRenderMinutesMonthly: 0, storageMb: 500_000, models: modelsFor("enterprise"), team: true },
};

export const PRICING_NOTE = "Space Studio prices are not published yet. They will be set after measuring real model, compute and storage costs; until then paid plans can't be bought.";

export const isPlanId = (p: unknown): p is PlanId => typeof p === "string" && p in RANK;

/** The plan that applies right now. Anything not active and inside its period falls back to Free. */
export function effectivePlan(sub: Subscription | null, now: number): PlanId {
  if (!sub || !isPlanId(sub.plan) || sub.plan === "free") return "free";
  if (sub.status !== "active" && sub.status !== "trialing" && sub.status !== "past_due") return "free";
  if (sub.periodEnd && Date.parse(sub.periodEnd) <= now) return "free";
  return sub.plan;
}

export type CloudDecision = { allowed: true; plan: PlanId; features: PlanFeatures } | { allowed: false; plan: PlanId; code: "space_cloud_requires_pro" | "space_cloud_concurrency" | "space_cloud_quota"; reason: string };

/**
 * The one cloud gate, shared by Roblox Cloud and Blender Cloud: called when a job is created, when it is queued, when a worker
 * picks it up, and between slices of a long job.
 */
export function cloudDecision(sub: Subscription | null, now: number, usage: { runningJobs: number; minutesThisMonth: number }): CloudDecision {
  const plan = effectivePlan(sub, now);
  const f = PLANS[plan];
  if (!f.cloud) return { allowed: false, plan, code: "space_cloud_requires_pro", reason: "Roblox Cloud and Blender Cloud require Space Studio Pro or above." };
  if (usage.runningJobs >= f.maxConcurrentCloudJobs) return { allowed: false, plan, code: "space_cloud_concurrency", reason: `Your plan runs up to ${f.maxConcurrentCloudJobs} cloud jobs at once.` };
  if (usage.minutesThisMonth >= f.cloudMinutesMonthly) return { allowed: false, plan, code: "space_cloud_quota", reason: "This month's cloud minutes are used up." };
  return { allowed: true, plan, features: f };
}

export function modelAllowed(sub: Subscription | null, now: number, model: ModelId): boolean {
  return PLANS[effectivePlan(sub, now)].models.includes(model);
}

export type BillingEvent = { id: string; type: "subscription.activated" | "subscription.renewed" | "subscription.canceled" | "subscription.expired" | "subscription.revoked" | "subscription.past_due"; plan: PlanId; periodEnd: string | null; occurredAt: number };

/**
 * Apply one VERIFIED billing event (the caller checks the webhook signature first). Idempotent: an event id seen before changes
 * nothing; an event older than the last applied one never overrides it (out-of-order retries can't downgrade or re-grant).
 */
export function applyBillingEvent(sub: Subscription | null, ev: BillingEvent, nowIso: string): { sub: Subscription; changed: boolean } {
  const base: Subscription = sub ?? { plan: "free", status: "expired", periodEnd: null, appliedEvents: [], updatedAt: nowIso, lastEventAt: 0 };
  if (!ev || typeof ev.id !== "string" || !ev.id || !isPlanId(ev.plan) || !Number.isFinite(ev.occurredAt) || ev.occurredAt < 0) throw new Error("invalid billing event");
  if (base.appliedEvents.includes(ev.id)) return { sub: base, changed: false };
  const seen = [...base.appliedEvents, ev.id].slice(-200);
  if (ev.occurredAt < base.lastEventAt) return { sub: { ...base, appliedEvents: seen }, changed: false };
  const status: SubscriptionStatus =
    ev.type === "subscription.activated" || ev.type === "subscription.renewed" ? "active"
    : ev.type === "subscription.past_due" ? "past_due"
    : ev.type === "subscription.canceled" ? "canceled"
    : ev.type === "subscription.revoked" ? "revoked" : "expired";
  return { sub: { plan: ev.plan, status, periodEnd: ev.periodEnd, appliedEvents: seen, updatedAt: nowIso, lastEventAt: ev.occurredAt }, changed: true };
}

/** Policy for a job already running when access ends: stop at the next safe boundary, keep history and artifacts. */
export const RUNNING_JOB_ON_LOSS = "stop_at_boundary" as const;
