/**
 * Whop events → workspace plan. Idempotent by webhook-id.
 *
 * The workspace is found by email (checkout metadata), by membership id, or by
 * the payment id remembered when the payment succeeded. Plan state lives on the
 * workspace row: durable with DATABASE_URL (Neon), otherwise per instance, which
 * is why checkout return also sets a signed plan cookie (plan-cookie.ts).
 */
import { securityEvent } from "@/lib/security/events";
import { collection } from "@/lib/create/platform/store";
import { now } from "@/lib/create/platform/ids";
import { alertOwner } from "@/lib/accounts/alerts";
import { userIdForEmail } from "@/lib/accounts/magic-token";
import { authSecret } from "@/lib/accounts/secret";
import { ensureWorkspaceForUser, updateWorkspace, workspaces, type WorkspaceRow } from "@/lib/accounts/workspaces";
import type { PlanId } from "@/lib/create/platform/plans";
import { isPaidPlan, planForWhopPlanId, type GrantablePlan, type PaidPlan } from "./plans";
import { EMBED_SOURCE, verifyEmbedRef } from "./embed";
import { extensionValidDays, packForWhopPlanId, type Pack } from "./extensions";
import { extensionForPayment, grantExtension, revokeExtensionByPayment } from "@/lib/create/platform/extensions";
import { revokeStudioTopUp, syncStudioTopUp } from "./studio-topup";
import { attributionFromMetadata, type Attribution } from "@/lib/seo/attribution";

type EventRow = { id: string; workspaceId: string; type: string; at: string; result: string };
const events = () => collection<EventRow>("billing_events");
type PaymentRow = {
  id: string; workspaceId: string; email: string; plan: GrantablePlan; membershipId: string | null; at: string;
  /** What Whop says was charged, in USD (webhook payload or a later API backfill). Missing on older rows: never guessed. */
  amountUsd?: number; netUsd?: number; refundedAt?: string; disputedAt?: string;
  /** Coarse first-touch attribution from the checkout metadata (landing page, source class, campaign); a label, never an entitlement. */
  attribution?: Attribution;
};
const paymentsMap = () => collection<PaymentRow>("whop_payments");
const SYSTEM = "system";

export type WhopEvent = { id?: string; type: string; data: Record<string, unknown> };

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
const lc = (v: unknown) => str(v)?.trim().toLowerCase() ?? null;
const usdNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : typeof v === "string" && /^\d{1,9}(\.\d{1,6})?$/.test(v) ? Number(v) : null);
/** Dollar amounts Whop reports on a payment: the charge (`usd_total`, or `total` when the currency is USD) and what is left after Whop's fees. */
export function amountsOf(data: Record<string, unknown>): { amountUsd: number | null; netUsd: number | null } {
  const usd = !str(data.currency) || str(data.currency)!.toLowerCase() === "usd";
  const amountUsd = usdNum(data.usd_total) ?? (usd ? usdNum(data.total) ?? usdNum(data.final_amount) : null);
  const net = usd ? usdNum(data.amount_after_fees) : null;
  return { amountUsd, netUsd: net !== null && amountUsd !== null && net <= amountUsd ? net : null };
}
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 864e5).toISOString();

type Ids = { email: string | null; plan: GrantablePlan | null; membershipId: string | null; paymentId: string | null; userId: string | null; planId: string | null; periodEnd: string | null; manageUrl: string | null };

/**
 * Email from checkout metadata. Hosted checkouts set it on the server. Embedded checkouts set it in the browser, so
 * it counts only with a valid server signature (keplar_ref); otherwise it is ignored.
 */
export function trustedEmail(md: Record<string, unknown>): string | null {
  if (md.source === EMBED_SOURCE) return verifyEmbedRef(md.keplar_ref)?.toLowerCase() ?? null;
  return lc(md.email);
}

/** Pull the identifiers we use out of a payment or membership object. */
export function extract(data: Record<string, unknown>): Ids {
  const md = obj(data.metadata) ?? {};
  const membership = obj(data.membership);
  const user = obj(data.user);
  const planId = str(data.plan_id) ?? str(obj(data.plan)?.id);
  const email = trustedEmail(md) ?? lc(data.customer_email) ?? lc(user?.email);
  // A known Whop plan id decides the tier. Metadata only decides it for the hosted checkout (server-set).
  // Embedded checkouts set metadata in the browser: for them only a known Whop plan id can grant a tier.
  const planRaw = planForWhopPlanId(planId) ?? (md.source === EMBED_SOURCE ? null : md.plan);
  const isMembership = typeof data.id === "string" && data.id.startsWith("mem_");
  return {
    email,
    // Business is granted only by its own Whop plan id (never by metadata alone).
    plan: planForWhopPlanId(planId) === "business" ? "business" : isPaidPlan(planRaw) ? planRaw : null,
    membershipId: isMembership ? str(data.id) : str(data.membership_id) ?? str(membership?.id),
    paymentId: isMembership ? null : str(data.id),
    userId: str(data.user_id) ?? str(user?.id),
    planId,
    periodEnd: str(data.renewal_period_end) ?? str(data.current_period_end),
    manageUrl: str(data.manage_url) ?? str(membership?.manage_url),
  };
}

async function workspaceFor(ids: Pick<Ids, "email" | "membershipId" | "paymentId">): Promise<WorkspaceRow | null> {
  if (ids.paymentId) {
    const p = await paymentsMap().get(SYSTEM, ids.paymentId);
    if (p) {
      const w = await workspaces().findSystemBy("ownerEmail", p.email, { ci: true });
      if (w) return w;
    }
  }
  if (ids.membershipId) {
    const w = await workspaces().findSystemBy("billing.subscriptionId", ids.membershipId);
    if (w) return w;
  }
  if (ids.email) {
    return ensureWorkspaceForUser({ id: userIdForEmail(authSecret(), ids.email), email: ids.email });
  }
  return null;
}

async function grant(ws: WorkspaceRow, plan: GrantablePlan, ids: Ids, paidAt: string | null) {
  securityEvent({ kind: "billing.change", code: `grant:${plan}`, where: "webhook/whop", accountId: ws.id });
  const start = paidAt ?? now();
  const end = ids.periodEnd ?? addDays(start, 31);
  await updateWorkspace(ws.id, {
    plan,
    billing: {
      customerId: ids.userId ?? ws.billing.customerId,
      subscriptionId: ids.membershipId ?? ws.billing.subscriptionId,
      status: "active",
      lookupKey: ids.planId ?? ws.billing.lookupKey,
      periodStart: start,
      periodEnd: end,
      cancelAtPeriodEnd: false,
      paymentFailedAt: null,
      mode: "live",
      manageUrl: ids.manageUrl ?? ws.billing.manageUrl ?? null,
    },
  });
}

async function revoke(ws: WorkspaceRow, status: "canceled" | "unpaid") {
  securityEvent({ kind: "billing.change", code: `revoke:${status}`, where: "webhook/whop", accountId: ws.id });
  await updateWorkspace(ws.id, { plan: "free", billing: { status, subscriptionId: null, cancelAtPeriodEnd: false, periodStart: null, periodEnd: null } });
}

/** Apply one verified Whop event. Returns a short result string (never user data). */
export async function handleWhopEvent(event: WhopEvent, webhookId: string): Promise<{ duplicate: boolean; result: string }> {
  // Atomic claim: two concurrent deliveries of the same webhook-id cannot both apply (the loser sees the claim and returns a duplicate).
  // A failed handler releases the claim so Whop's retry is processed; a claim stuck "processing" for > 2 minutes (crashed instance) is taken over.
  const claim: EventRow = { id: webhookId, workspaceId: SYSTEM, type: event.type, at: now(), result: PROCESSING };
  const first = await events().insertIfAbsent(claim);
  if (!first.inserted) {
    const stale = first.row.result === PROCESSING && Date.now() - Date.parse(first.row.at) > 120_000;
    if (!stale) return { duplicate: true, result: first.row.result };
    await events().update(SYSTEM, webhookId, { at: now() });
  }
  try {
    const result = await applyWhopEvent(event, webhookId);
    await events().update(SYSTEM, webhookId, { result, at: now() });
    return { duplicate: false, result };
  } catch (e) {
    await events().remove(SYSTEM, webhookId).catch(() => undefined);
    throw e;
  }
}

const PROCESSING = "processing";

async function applyWhopEvent(event: WhopEvent, webhookId: string): Promise<string> {
  const data = obj(event.data) ?? {};
  const ids = extract(data);
  let result = "ignored";

  if (event.type.startsWith("payment.") && await syncStudioTopUp(data)) return "studio_topup_synced";

  // A one-time limit-extension purchase is never a plan change: it must not touch the subscription period, tier or status.
  const pack = packForWhopPlanId(ids.planId);
  if (pack) return applyExtensionEvent(event.type, data, ids, pack, webhookId);

  switch (event.type) {
    case "payment.succeeded": {
      const ws = await workspaceFor(ids);
      const plan = ids.plan ?? (ws && ws.plan !== "free" ? (ws.plan as GrantablePlan) : null);
      if (!ws || !plan) {
        result = "no_workspace";
        break;
      }
      if (ids.paymentId && ids.email) {
        const amt = amountsOf(data);
        const attribution = attributionFromMetadata(obj(data.metadata));
        await paymentsMap().insert({ id: ids.paymentId, workspaceId: SYSTEM, email: ids.email, plan, membershipId: ids.membershipId, at: now(), ...(amt.amountUsd !== null ? { amountUsd: amt.amountUsd } : {}), ...(amt.netUsd !== null ? { netUsd: amt.netUsd } : {}), ...(attribution ? { attribution } : {}) }).catch(() => undefined);
      }
      await grant(ws, plan, ids, str(data.paid_at));
      result = `plan=${plan}`;
      break;
    }
    case "membership.activated": {
      const ws = await workspaceFor(ids);
      const plan = ids.plan;
      if (!ws || !plan) {
        result = "no_workspace";
        break;
      }
      await grant(ws, plan, ids, str(data.created_at));
      result = `plan=${plan}`;
      break;
    }
    case "membership.deactivated": {
      const ws = await workspaceFor({ ...ids, email: null });
      if (!ws) {
        result = "no_workspace";
        break;
      }
      await revoke(ws, "canceled");
      result = "plan=free";
      break;
    }
    case "payment.failed": {
      // Access continues until the paid period ends (Whop retries the charge); a final failure arrives as membership.deactivated.
      const ws = await workspaceFor({ ...ids, email: null });
      if (!ws || ws.plan === "free") {
        result = "no_workspace";
        break;
      }
      await updateWorkspace(ws.id, { billing: { status: "past_due", paymentFailedAt: now() } });
      await alertOwner(`Whop payment failed for ${ws.ownerEmail ?? ws.id}`, `Event ${webhookId}. The ${ws.plan} plan stays active until the period ends unless Whop deactivates it.`).catch(() => undefined);
      result = "past_due";
      break;
    }
    case "membership.cancel_at_period_end_changed": {
      const ws = await workspaceFor({ ...ids, email: null });
      if (!ws || ws.plan === "free") {
        result = "no_workspace";
        break;
      }
      const cancel = data.cancel_at_period_end === true;
      await updateWorkspace(ws.id, { billing: { cancelAtPeriodEnd: cancel } });
      result = cancel ? "cancel_at_period_end" : "renewal_resumed";
      break;
    }
    case "refund.created":
    case "dispute.created": {
      const payment = obj(data.payment);
      const paymentId = str(data.payment_id) ?? str(payment?.id);
      if (paymentId && await revokeStudioTopUp(paymentId, event.type)) return "studio_topup_revoked";
      const membershipId = str(obj(payment?.membership)?.id) ?? str(payment?.membership_id) ?? ids.membershipId;
      // A refund of a limit-extension payment takes back only the unspent extension credits; the subscription is untouched.
      const paymentPlanId = str(payment?.plan_id) ?? str(obj(payment?.plan)?.id);
      if ((paymentId && (await extensionForPayment(paymentId))) || packForWhopPlanId(paymentPlanId)) {
        result = await revokeExtension(paymentId, event.type, webhookId);
        break;
      }
      if (paymentId) await paymentsMap().update(SYSTEM, paymentId, event.type === "refund.created" ? { refundedAt: now() } : { disputedAt: now() }).catch(() => undefined);
      const ws = await workspaceFor({ email: null, membershipId, paymentId });
      if (!ws) {
        result = "no_workspace";
        break;
      }
      await revoke(ws, "unpaid");
      await alertOwner(`Whop ${event.type === "refund.created" ? "refund" : "dispute"} for ${ws.ownerEmail ?? ws.id}`, `Event ${webhookId} (${event.type}). The account was moved to Free. Review it in your Whop dashboard.`).catch(() => undefined);
      result = "plan=free";
      break;
    }
  }

  return result;
}

/** Plan from a paid, verified Whop payment for this email, or null. Used on checkout return and "Refresh plan". */
export function claimFromPayment(p: { status?: string; paid_at?: string | null; metadata?: Record<string, unknown> | null; plan?: { id?: string } | null; membership?: { id?: string; status?: string; manage_url?: string | null } | null }, email: string) {
  const md = p.metadata ?? {};
  const tier = planForWhopPlanId(p.plan?.id) ?? (md.source !== EMBED_SOURCE && isPaidPlan(md.plan) ? md.plan : null);
  if (trustedEmail(md) !== email.trim().toLowerCase() || !tier) return null;
  if (p.status !== "paid") return null;
  const m = p.membership?.status;
  if (m && !["active", "trialing", "past_due"].includes(m)) return null;
  const start = str(p.paid_at) ?? now();
  const end = addDays(start, 31);
  if (Date.parse(end) < Date.now()) return null;
  return { plan: tier as PlanId & PaidPlan, periodStart: start, periodEnd: end, membershipId: str(p.membership?.id), manageUrl: str(p.membership?.manage_url) };
}

/** Limit-extension purchase events. Grants only on a verified `payment.succeeded` for a pack's own Whop plan id; idempotent by payment id. */
async function applyExtensionEvent(type: string, data: Record<string, unknown>, ids: Ids, pack: Pack, webhookId: string): Promise<string> {
  if (type !== "payment.succeeded") return "extension_ignored"; // membership.* / payment.failed for a one-time pack never change a plan
  const status = str(data.status);
  if ((status && status !== "paid") || str(data.refunded_at)) return "extension_not_paid";
  if (!ids.paymentId || !ids.email) return "extension_no_workspace";
  const ws = await workspaces().findSystemBy("ownerEmail", ids.email, { ci: true });
  if (!ws) {
    await alertOwner(`Whop limit-extension payment with no matching account`, `Event ${webhookId}: payment ${ids.paymentId} for the ${pack.id} pack was paid by ${ids.email}, which has no Keplar account. Nothing was granted. Match it by hand or refund it.`).catch(() => undefined);
    return "extension_no_workspace";
  }
  const { row, granted } = await grantExtension({ workspaceId: ws.id, paymentId: ids.paymentId, pack: pack.id, credits: pack.credits, validDays: extensionValidDays(), whopPlanId: ids.planId ?? undefined, paidAt: str(data.paid_at), amountUsd: amountsOf(data).amountUsd ?? undefined, netUsd: amountsOf(data).netUsd ?? undefined });
  if (!granted) return `extension_duplicate=${row.pack}`;
  return `extension=${pack.id}:${row.credits}`;
}

async function revokeExtension(paymentId: string | null, type: string, webhookId: string): Promise<string> {
  const row = paymentId ? await revokeExtensionByPayment(paymentId, type) : null;
  await alertOwner(`Whop ${type === "refund.created" ? "refund" : "dispute"} on a limit extension`, `Event ${webhookId} (${type}) for payment ${paymentId ?? "unknown"}. ${row ? `${row.credits} credits were granted; the unspent remainder was removed. The plan was not changed.` : "No matching extension grant was found; the plan was not changed."}`).catch(() => undefined);
  return row ? "extension_revoked" : "extension_refund_unmatched";
}
