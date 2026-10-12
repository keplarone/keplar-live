import { randomUUID } from "node:crypto";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { assertCanSpend, CreditLimitError } from "@/lib/create/platform/compute";
import { grantExtension, revokeExtensionByPayment } from "@/lib/create/platform/extensions";
import { HttpError } from "@/lib/create/platform/http";
import { collection, storeDurable } from "@/lib/create/platform/store";
import type { Workspace } from "@/lib/create/platform/workspace";
import { STUDIO_LIMITS } from "@/lib/studio/agent";
import { isTeamId } from "@/lib/team/rows";
import { canBuyExtension, extensionPack, extensionPacks, extensionValidDays, type PackId } from "./extensions";
import { whopCheckoutConfigured, whopWebhookConfigured } from "./whop";
import { topUpWhop, type SavedCard, type TopUpPayment, type TopUpVariant } from "./studio-topup-whop";

type Offer = { pack: PackId | "custom"; label: string; planId: string | null; credits: number; priceUsd: number; taxType: string; validDays: number };
type Method = { id: string; label: string };
type Quote = { id: string; workspaceId: string; userId: string; customerId: string; memberId: string; expiresAt: number; offers: Offer[]; methods: Method[] };
type Choice = Offer & { memberId: string; customerId: string; methodId: string; methodLabel: string; monthlyLimit: number };
type Setting = { id: string; workspaceId: string; enabled: boolean; revision: string; consentAt: string; choice?: Choice };
type Attempt = Choice & {
  id: string; workspaceId: string; sequence: number; revision: string; createdAt: string; paymentNonce: string;
  status: "pending" | "paid" | "failed" | "skipped" | "revoked"; paymentId?: string; revokedAt?: string;
};
const settings = () => collection<Setting>("studio_topup_settings");
const quotes = () => collection<Quote>("studio_topup_quotes");
const attempts = () => collection<Attempt>("studio_topup_attempts");
const companyId = () => process.env.WHOP_COMPANY_ID?.trim();
async function saveSetting(row: Setting) {
  const saved = await settings().insertIfAbsent(row);
  if (!saved.inserted) await settings().update(row.workspaceId, row.id, row);
}
const fail = (message: string) => new HttpError(409, message, "studio_topup");
const pending = { status: "pending" as const, message: "Confirming your top-up with Whop. No second payment will be started while this one is unresolved." };

async function owner(ws: Workspace) {
  if (ws.anonymous || !ws.verified || !ws.userId || ws.team || isTeamId(ws.id) || ws.via) throw new HttpError(403, "Auto top-up is available in your verified personal account.");
  const row = await getWorkspace(ws.id);
  if (!row || row.ownerUserId !== ws.userId) throw new HttpError(403, "Only the account owner can manage auto top-up.");
  return row;
}

async function eligible(ws: Workspace) {
  const row = await owner(ws);
  if (ws.admin || !canBuyExtension(ws.plan)) throw fail("Auto top-up is available on Lite, Plus and Pro.");
  if (!storeDurable() || !whopCheckoutConfigured() || !whopWebhookConfigured()) throw fail("Auto top-up is not configured yet.");
  if (!row.billing.subscriptionId || !row.billing.customerId || !["active", "trialing"].includes(row.billing.status)) throw fail("Connect an active Whop subscription before enabling auto top-up.");
  return row;
}

async function membership(ws: Workspace) {
  const row = await eligible(ws);
  const m = await topUpWhop<{ id: string; status: string; company: { id: string }; user: { id: string }; member: { id: string } }>(`/memberships/${encodeURIComponent(row.billing.subscriptionId!)}`);
  if (m.id !== row.billing.subscriptionId || !["active", "trialing"].includes(m.status) || m.company?.id !== companyId() || m.user?.id !== row.billing.customerId || !m.member?.id) throw fail("Your Whop membership could not be verified.");
  return { memberId: m.member.id, customerId: m.user.id };
}

async function cards(memberId: string): Promise<Method[]> {
  const q = new URLSearchParams({ member_id: memberId, future_usage: "off_session", expired: "false", broken: "false", first: "100" });
  const list = await topUpWhop<{ data: SavedCard[] }>(`/payment_methods?${q}`);
  return (list.data ?? []).filter((m) => m.payment_method_type === "card" && !m.card?.expired && /^\d{4}$/.test(m.card?.last4 ?? "")).map((m) => ({ id: m.id, label: `${m.card?.brand || "Card"} ending ${m.card!.last4}` }));
}

/** Owner-approved pricing: $1 = 120 credits. The browser never chooses the credit grant. */
export function customTopUpConfig() {
  const creditsPerUsd = Number(process.env.KEPLAR_STUDIO_TOPUP_CREDITS_PER_USD?.trim() || "120");
  if (!Number.isInteger(creditsPerUsd) || creditsPerUsd < 1 || creditsPerUsd > 10_000) return null;
  const minUsd = Math.max(5, Math.ceil(STUDIO_LIMITS.reserveUnits / creditsPerUsd * 100) / 100);
  const maxUsd = Math.min(500, Math.floor(200_000 / creditsPerUsd * 100) / 100);
  return { creditsPerUsd, minUsd, maxUsd, validDays: extensionValidDays() };
}

async function offer(pack: PackId | "custom", amountUsd?: number): Promise<Offer> {
  if (pack === "custom") {
    const config = customTopUpConfig();
    if (!config) throw fail("Custom top-up pricing is not configured yet.");
    const amount = amountUsd ?? config.minUsd;
    const cents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount < config.minUsd || amount > config.maxUsd || Math.abs(amount * 100 - cents) > 0.000001) throw new HttpError(400, `Choose an amount from $${config.minUsd} to $${config.maxUsd}, with no more than two decimal places.`);
    return { pack, label: "Custom amount", planId: null, credits: Math.floor(cents * config.creditsPerUsd / 100), priceUsd: cents / 100, taxType: "unspecified", validDays: config.validDays };
  }
  const p = extensionPack(pack);
  if (!p.planId || p.credits < STUDIO_LIMITS.reserveUnits) throw fail("This credit pack is not available for Studio auto top-up.");
  const v = await topUpWhop<TopUpVariant>(`/variants/${encodeURIComponent(p.planId)}`);
  if (v.id !== p.planId || (v.account?.id ?? v.company?.id) !== companyId() || v.plan_type !== "one_time" || v.currency !== "usd" || !Number.isFinite(v.initial_price) || v.initial_price <= 0 || v.initial_price >= 10_000) throw fail("This credit pack does not have a supported one-time USD price.");
  return { pack, label: p.label, planId: p.planId, credits: p.credits, priceUsd: v.initial_price, taxType: v.tax_type, validDays: extensionValidDays() };
}

export async function studioTopUpState(ws: Workspace) {
  await owner(ws);
  const s = await settings().get(ws.id, ws.id);
  return { enabled: s?.enabled ?? false, choice: s?.choice ? { credits: s.choice.credits, priceUsd: s.choice.priceUsd, monthlyLimit: s.choice.monthlyLimit, methodLabel: s.choice.methodLabel } : null };
}

/** A short-lived server quote binds the exact pack and saved card shown at consent. */
export async function studioTopUpQuote(ws: Workspace, amountUsd?: number) {
  const member = await membership(ws);
  const [methods, offers] = await Promise.all([
    cards(member.memberId),
    Promise.all([...(customTopUpConfig() ? [offer("custom", amountUsd)] : []), ...extensionPacks().filter((p) => p.available).map((p) => offer(p.id))]),
  ]);
  if (!offers.length) throw fail("Top-up pricing is not configured yet.");
  if (!methods.length) throw fail("No saved card is available for auto top-up. Add a payment method in your Whop account first.");
  const quote: Quote = { id: randomUUID(), workspaceId: ws.id, userId: ws.userId!, ...member, expiresAt: Date.now() + 10 * 60_000, offers, methods };
  await quotes().insert(quote);
  // Quotes hold no authority after expiry, and keeping old ones serves no purpose.
  for (const old of await quotes().list(ws.id, (q) => q.expiresAt < Date.now())) await quotes().remove(ws.id, old.id);
  return { quoteId: quote.id, offers: offers.map((p) => ({ pack: p.pack, label: p.label, credits: p.credits, priceUsd: p.priceUsd, validDays: p.validDays })), methods, custom: customTopUpConfig() };
}

export async function configureStudioTopUp(ws: Workspace, input: { enabled?: unknown; quoteId?: unknown; pack?: unknown; methodId?: unknown; monthlyLimit?: unknown }) {
  await owner(ws);
  if (typeof input.enabled !== "boolean") throw new HttpError(400, "Choose whether to enable auto top-up.");
  const cur = await settings().get(ws.id, ws.id);
  if (!input.enabled) {
    await saveSetting({ ...cur, id: ws.id, workspaceId: ws.id, enabled: false, revision: randomUUID(), consentAt: new Date().toISOString() });
    return studioTopUpState(ws);
  }
  await eligible(ws);
  const q = typeof input.quoteId === "string" ? await quotes().get(ws.id, input.quoteId) : null;
  if (!q || q.userId !== ws.userId || q.expiresAt < Date.now()) throw fail("These payment details expired. Open auto top-up again to review the current price.");
  const p = q.offers.find((p) => p.pack === input.pack);
  const method = q.methods.find((m) => m.id === input.methodId);
  if (!p || !method || !Number.isInteger(input.monthlyLimit) || Number(input.monthlyLimit) < 1 || Number(input.monthlyLimit) > 10) throw new HttpError(400, "Choose a credit pack, saved card and monthly limit of 1–10 top-ups.");
  const choice: Choice = { ...p, memberId: q.memberId, customerId: q.customerId, methodId: method.id, methodLabel: method.label, monthlyLimit: Number(input.monthlyLimit) };
  await saveSetting({ id: ws.id, workspaceId: ws.id, enabled: true, revision: randomUUID(), consentAt: new Date().toISOString(), choice });
  return studioTopUpState(ws);
}

async function settle(a: Attempt, paymentId = a.paymentId) {
  if (!paymentId) return pending;
  const p = await topUpWhop<TopUpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
  if ((a.paymentId && a.paymentId !== paymentId) || p.id !== paymentId || p.company?.id !== companyId() || p.member?.id !== a.memberId || p.user?.id !== a.customerId || (a.planId && p.plan?.id !== a.planId) || p.currency !== "usd" || p.metadata?.studio_topup_attempt !== a.id || p.metadata?.studio_topup_nonce !== a.paymentNonce) throw fail("Whop returned payment details that do not match this top-up. Contact support before trying another payment.");
  await attempts().update(a.workspaceId, a.id, { paymentId });
  const current = await attempts().get(a.workspaceId, a.id);
  if (current?.revokedAt || p.refunded_at || /refund|dispute|resolution/.test(p.substatus ?? "")) {
    await attempts().update(a.workspaceId, a.id, { status: "revoked", revokedAt: current?.revokedAt ?? new Date().toISOString() });
    await revokeExtensionByPayment(paymentId, "studio_topup_reversed");
    throw fail("The last top-up was reversed. Review your payment in Whop.");
  }
  if (p.status === "paid" && p.substatus === "succeeded") {
    if (a.pack === "custom" && (!p.plan?.id || typeof p.subtotal !== "number" || Math.round(p.subtotal * 100) !== Math.round(a.priceUsd * 100))) throw fail("Whop has not confirmed the custom top-up amount. Contact support to check this payment.");
    if (typeof p.total !== "number" || !(p.total > 0)) throw fail("Whop has not confirmed the top-up amount. Contact support to check this payment.");
    await grantExtension({ workspaceId: a.workspaceId, paymentId, pack: a.pack, credits: a.credits, validDays: a.validDays, whopPlanId: p.plan?.id, paidAt: p.paid_at, amountUsd: p.total });
    await attempts().update(a.workspaceId, a.id, { status: "paid" });
    // A concurrent refund cannot leave newly granted credits spendable.
    if ((await attempts().get(a.workspaceId, a.id))?.revokedAt) {
      await revokeExtensionByPayment(paymentId, "studio_topup_reversed");
      throw fail("The last top-up was reversed. Review your payment in Whop.");
    }
    return { status: "ready" as const, message: `${a.credits.toLocaleString()} credits added.` };
  }
  if (["void", "uncollectible"].includes(p.status ?? "") || ["failed", "blocked", "canceled", "uncollectible"].includes(p.substatus ?? "")) {
    await attempts().update(a.workspaceId, a.id, { status: "failed" });
    throw fail("The top-up did not complete. Check your card in Whop, then review and enable auto top-up again.");
  }
  return pending;
}

/** Called only by the verified-account Studio route. Safety/cooldown errors never trigger a charge. */
export async function runStudioTopUp(ws: Workspace) {
  await owner(ws);
  try {
    await assertCanSpend(ws, STUDIO_LIMITS.reserveUnits, { kind: "agent", dailySafetyCap: false });
    return { status: "ready" as const, message: "Credits are available." };
  } catch (e) { if (!(e instanceof CreditLimitError)) throw e; }
  await eligible(ws);
  const history = (await attempts().list(ws.id)).sort((a, b) => b.sequence - a.sequence);
  const latest = history[0];
  // Never retry an ambiguous create, including across months or disable/re-enable.
  if (latest?.status === "pending") return settle(latest);
  const s = await settings().get(ws.id, ws.id);
  if (!s?.enabled || !s.choice) throw fail("Studio needs more credits. Enable auto top-up or add credits to continue.");
  if (latest && (latest.revokedAt || ["failed", "revoked"].includes(latest.status)) && latest.revision === s.revision) throw fail("Review your last payment and enable auto top-up again before another charge.");
  const month = new Date().toISOString().slice(0, 7);
  if (history.filter((a) => a.createdAt.startsWith(month) && a.status !== "skipped").length >= s.choice.monthlyLimit) throw fail("Your monthly auto top-up limit has been reached. Review it in auto top-up settings to continue.");
  const [m, p] = await Promise.all([membership(ws), offer(s.choice.pack, s.choice.priceUsd)]);
  if (m.memberId !== s.choice.memberId || m.customerId !== s.choice.customerId || p.planId !== s.choice.planId || p.priceUsd !== s.choice.priceUsd || p.credits !== s.choice.credits || p.taxType !== s.choice.taxType || p.validDays !== s.choice.validDays) throw fail("The payment details changed. Review and enable auto top-up again before being charged.");
  if (!(await cards(m.memberId)).some((card) => card.id === s.choice!.methodId)) throw fail("Your saved card is no longer available. Review auto top-up settings.");
  const sequence = (latest?.sequence ?? 0) + 1;
  const a: Attempt = { ...s.choice, id: `${ws.id}_topup_${sequence}`, workspaceId: ws.id, sequence, revision: s.revision, createdAt: new Date().toISOString(), status: "pending", paymentNonce: randomUUID() };
  // The next immutable sequence is a durable single-writer lock. A loser never charges.
  const claimed = await attempts().insertIfAbsent(a);
  if (!claimed.inserted) return claimed.row.status === "pending" ? settle(claimed.row) : { status: "ready" as const, message: "Payment status updated. Checking credits again." };
  const fresh = await settings().get(ws.id, ws.id);
  if (!fresh?.enabled || fresh.revision !== s.revision) {
    await attempts().update(ws.id, a.id, { status: "skipped" });
    throw fail("Auto top-up settings changed. No payment was started.");
  }
  // Another tab or a manual checkout may have added credits while we verified the card.
  try {
    await assertCanSpend(ws, STUDIO_LIMITS.reserveUnits, { kind: "agent", dailySafetyCap: false });
    await attempts().update(ws.id, a.id, { status: "skipped" });
    return { status: "ready" as const, message: "Credits are available." };
  } catch (e) {
    if (!(e instanceof CreditLimitError)) {
      await attempts().update(ws.id, a.id, { status: "skipped" });
      throw e;
    }
  }
  let creationReturned = false;
  try {
    const payment = await topUpWhop<TopUpPayment>("/payments", {
      account_id: companyId(), member_id: a.memberId, payment_method_id: a.methodId, capture: true,
      ...(a.pack === "custom" ? { plan: {
        currency: "usd", plan_type: "one_time", initial_price: a.priceUsd, visibility: "hidden",
        title: "Keplar Studio credits", description: `${a.credits} credits, valid for ${a.validDays} days.`,
        product: { external_identifier: "keplar-studio-custom-credits", title: "Keplar Studio credits", visibility: "hidden" },
      } } : { plan_id: a.planId }),
      metadata: { kind: "studio_auto_topup", studio_topup_attempt: a.id, studio_topup_nonce: a.paymentNonce, workspace_id: ws.id, source: "keplar.one" },
    });
    creationReturned = true;
    if (!payment.id) return pending;
    await attempts().update(ws.id, a.id, { paymentId: payment.id });
    return await settle(a, payment.id);
  } catch (e) {
    if (e instanceof HttpError && e.code === "studio_topup") throw e;
    if (!creationReturned && e instanceof HttpError && e.code === "topup_provider" && [400, 401, 403, 404, 422].includes(Number(e.extra?.providerStatus))) {
      await attempts().update(ws.id, a.id, { status: "failed" });
      throw fail("Whop rejected the top-up request. Contact support to check payment setup, then review and enable auto top-up again.");
    }
    // Keep the claim forever until a signed webhook or payment retrieval resolves it.
    return pending;
  }
}

/** Signed webhooks recover payment IDs even if the create request timed out. */
export async function syncStudioTopUp(data: Record<string, unknown>) {
  const metadata = data.metadata as Record<string, unknown> | undefined;
  if (metadata?.kind !== "studio_auto_topup") return false;
  if (typeof metadata.studio_topup_attempt !== "string" || typeof data.id !== "string") throw fail("Missing auto top-up payment reference.");
  const a = await attempts().findSystemBy("id", metadata.studio_topup_attempt);
  if (!a) throw fail("Unknown auto top-up payment reference.");
  try { await settle(a, data.id); }
  catch (e) { if (!(e instanceof HttpError && ["failed", "revoked"].includes((await attempts().get(a.workspaceId, a.id))?.status ?? ""))) throw e; }
  return true;
}

export async function revokeStudioTopUp(paymentId: string, reason: string) {
  const a = await attempts().findSystemBy("paymentId", paymentId);
  if (!a) return false;
  await attempts().update(a.workspaceId, a.id, { status: "revoked", revokedAt: new Date().toISOString() });
  await revokeExtensionByPayment(paymentId, reason);
  return true;
}
