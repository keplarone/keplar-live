/**
 * Space Studio storage (src/lib/space-studio). Plans and linked identities for the Space Studio desktop app, kept apart from
 * Keplar One / Keplar Business billing.
 *
 * - space_subscriptions   one row per workspace (id "sub"): the core Subscription. Missing = Free. Written ONLY by a verified
 *                         billing webhook (./billing.ts) or an admin grant (grantSubscription). Prices are not published, so
 *                         nothing in the app can buy a plan.
 * - space_identities      one row per workspace (id "ids"): the identities linked to it (Roblox for now; the Keplar account
 *                         itself is not stored here, it is the signed-in account).
 * - space_identity_index  system rows keyed `${provider}:${subject}` -> owning workspace id. insertIfAbsent makes the claim
 *                         race-safe: two accounts can never own one Roblox account.
 * - space_usage           cloud minutes per workspace per month (id = "YYYY-MM"), via atomic increment.
 * - space_credits         credits used per workspace, one row per window: "5h:<n>" (Free 5-hour limit), "wk:<n>" (Free weekly limit)
 *                         and "m:YYYY-MM" (paid monthly allowance), via atomic increment. Windows are the ones in core credits.ts.
 * - space_locks           short per-workspace locks around read-modify-write of the subscription row.
 * - space_billing_events  system idempotency log of applied billing events (retained: a financial record, ids and plans only).
 */
import { collection, type Row } from "@/lib/create/platform/store";
import { applyBillingEvent, fiveHourWindow, monthWindow, previousMonth, weekWindow, type BillingEvent, type CreditUsage, type Identity, type IdentityIndex, type PlanId, type Provider, type Subscription } from "./core";

export const SPACE_INDEX_WS = "space_identity";
export const SPACE_SYSTEM_WS = "system";

type SubRow = Row & { sub: Subscription };
type IdsRow = Row & { identities: Identity[] };
type IndexRow = Row & { owner: string; provider: Provider; linkedAt: string };
type UsageRow = Row & { minutes: number };
type LockRow = Row & { until: number };
type CreditRow = Row & { credits: number };
type EventRow = Row & { target: string; type: BillingEvent["type"]; plan: PlanId; occurredAt: number; receivedAt: string; source: "webhook" | "admin" };

export const subscriptions = () => collection<SubRow>("space_subscriptions");
export const identityRows = () => collection<IdsRow>("space_identities");
export const identityIndex = () => collection<IndexRow>("space_identity_index");
export const usage = () => collection<UsageRow>("space_usage");
export const locks = () => collection<LockRow>("space_locks");
export const creditRows = () => collection<CreditRow>("space_credits");
export const billingEvents = () => collection<EventRow>("space_billing_events");

export const indexKey = (provider: Provider, subject: string) => `${provider}:${subject}`;
export const monthId = (now: number) => new Date(now).toISOString().slice(0, 7);

/** The stored subscription, or null (= Free). Never derived from anything a client sends. */
export async function loadSubscription(wsId: string): Promise<Subscription | null> {
  return (await subscriptions().get(wsId, "sub"))?.sub ?? null;
}

export async function loadIdentities(wsId: string): Promise<Identity[]> {
  return (await identityRows().get(wsId, "ids"))?.identities ?? [];
}

async function saveIdentities(wsId: string, identities: Identity[]) {
  if (!(await identityRows().update(wsId, "ids", { identities }))) {
    const r = await identityRows().insertIfAbsent({ id: "ids", workspaceId: wsId, identities });
    if (!r.inserted) await identityRows().update(wsId, "ids", { identities });
  }
}

/** Index lookups for core planLink. */
export const indexReader: IdentityIndex = {
  async ownerOf(provider, subject) {
    return (await identityIndex().get(SPACE_INDEX_WS, indexKey(provider, subject)))?.owner ?? null;
  },
};

/**
 * Commit a link planned by core planLink. The index claim is the race-safe step: if another account claimed the same identity
 * between the plan and now, nothing is written and the result is a conflict.
 */
export async function commitLink(wsId: string, identity: Identity, identities: Identity[]): Promise<{ ok: true } | { ok: false; code: "identity_conflict" }> {
  const claim = await identityIndex().insertIfAbsent({ id: indexKey(identity.provider, identity.subject), workspaceId: SPACE_INDEX_WS, owner: wsId, provider: identity.provider, linkedAt: identity.linkedAt });
  if (!claim.inserted && claim.row.owner !== wsId) return { ok: false, code: "identity_conflict" };
  await saveIdentities(wsId, identities);
  return { ok: true };
}

/** Commit an unlink planned by core planUnlink: frees the index entry (only if this workspace owns it). */
export async function commitUnlink(wsId: string, removed: Identity, identities: Identity[]) {
  await saveIdentities(wsId, identities);
  const key = indexKey(removed.provider, removed.subject);
  const row = await identityIndex().get(SPACE_INDEX_WS, key);
  if (row?.owner === wsId) await identityIndex().remove(SPACE_INDEX_WS, key);
}

/** Cloud minutes used this month (Space Studio jobs only). */
export async function minutesThisMonth(wsId: string, now = Date.now()): Promise<number> {
  return (await usage().get(wsId, monthId(now)))?.minutes ?? 0;
}

export async function addCloudMinutes(wsId: string, minutes: number, now = Date.now()) {
  if (!(minutes > 0) || !Number.isFinite(minutes)) return;
  const id = monthId(now);
  await usage().increment(wsId, id, { minutes }, { id, workspaceId: wsId, minutes: 0 });
}

const creditIds = (now: number) => ({ fiveHour: `5h:${fiveHourWindow(now)}`, week: `wk:${weekWindow(now)}`, month: `m:${monthWindow(now)}`, previousMonth: `m:${previousMonth(now)}` });

/** Credits used in each window that applies right now (core creditBalance turns this into what's left). */
export async function loadCreditUsage(wsId: string, now = Date.now()): Promise<CreditUsage> {
  const ids = creditIds(now);
  const [fiveHour, week, month, prev] = await Promise.all([ids.fiveHour, ids.week, ids.month, ids.previousMonth].map((id) => creditRows().get(wsId, id)));
  return { fiveHour: fiveHour?.credits ?? 0, week: week?.credits ?? 0, month: month?.credits ?? 0, previousMonth: prev?.credits ?? 0 };
}

/** Record credits spent, in every window at once (atomic per row). */
export async function addCredits(wsId: string, credits: number, now = Date.now()) {
  if (!(credits > 0) || !Number.isFinite(credits)) return;
  const ids = creditIds(now);
  await Promise.all([ids.fiveHour, ids.week, ids.month].map((id) => creditRows().increment(wsId, id, { credits }, { id, workspaceId: wsId, credits: 0 })));
}

/** A short per-workspace lock (insertIfAbsent) so concurrent billing events can't lose each other's update. */
export async function withSpaceLock<T>(wsId: string, fn: () => Promise<T>, opts: { waitMs?: number; holdMs?: number } = {}): Promise<T | null> {
  const holdMs = opts.holdMs ?? 15_000;
  const giveUp = Date.now() + (opts.waitMs ?? 4_000);
  for (;;) {
    const now = Date.now();
    const got = await locks().insertIfAbsent({ id: "sub", workspaceId: wsId, until: now + holdMs });
    if (got.inserted) break;
    if (got.row.until < now) {
      await locks().remove(wsId, "sub"); // an abandoned lock (crashed request)
      continue;
    }
    if (Date.now() >= giveUp) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    return await fn();
  } finally {
    await locks().remove(wsId, "sub").catch(() => undefined);
  }
}

export type ApplyOutcome = { status: "applied" | "duplicate" | "stale" | "busy"; sub: Subscription | null };

/**
 * Apply one VERIFIED billing event (or admin grant) to a workspace. Duplicate-safe twice over: the event log (insertIfAbsent by
 * event id) and the subscription's own appliedEvents list; out-of-order older events never override a newer one (core).
 */
export async function applyEventTo(wsId: string, ev: BillingEvent, source: EventRow["source"], nowIso = new Date().toISOString()): Promise<ApplyOutcome> {
  if (await billingEvents().get(SPACE_SYSTEM_WS, ev.id)) return { status: "duplicate", sub: await loadSubscription(wsId) };
  const out = await withSpaceLock(wsId, async (): Promise<ApplyOutcome> => {
    const current = await loadSubscription(wsId);
    if (current?.appliedEvents.includes(ev.id)) return { status: "duplicate", sub: current };
    const { sub, changed } = applyBillingEvent(current, ev, nowIso);
    if (!(await subscriptions().update(wsId, "sub", { sub }))) await subscriptions().insert({ id: "sub", workspaceId: wsId, sub });
    await billingEvents().insertIfAbsent({ id: ev.id, workspaceId: SPACE_SYSTEM_WS, target: wsId, type: ev.type, plan: ev.plan, occurredAt: ev.occurredAt, receivedAt: nowIso, source });
    return { status: changed ? "applied" : "stale", sub };
  });
  return out ?? { status: "busy", sub: null };
}

/** Admin grant (support, comps, testing): recorded as a billing event with source "admin". Callers must check admin rights. */
export function grantSubscription(wsId: string, plan: PlanId, periodEnd: string | null, grantId: string, now = Date.now()) {
  return applyEventTo(wsId, { id: `admin:${grantId}`, type: plan === "free" ? "subscription.revoked" : "subscription.activated", plan, periodEnd, occurredAt: now }, "admin", new Date(now).toISOString());
}

/** Account deletion: frees this workspace's identity-index claims (system rows), so a deleted account's Roblox identity can be linked again. */
export async function freeIdentityClaims(wsId: string): Promise<number> {
  let freed = 0;
  const keys = new Set((await loadIdentities(wsId)).map((i) => indexKey(i.provider, i.subject)));
  for (const k of keys) {
    const row = await identityIndex().get(SPACE_INDEX_WS, k);
    if (row?.owner === wsId && (await identityIndex().remove(SPACE_INDEX_WS, k))) freed++;
  }
  // Belt and braces: any claim still pointing at this workspace (e.g. a link whose identities row write failed).
  for (const row of await identityIndex().list(SPACE_INDEX_WS, (r) => r.owner === wsId)) if (await identityIndex().remove(SPACE_INDEX_WS, row.id)) freed++;
  return freed;
}
