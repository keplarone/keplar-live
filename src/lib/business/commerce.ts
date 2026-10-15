/** Commerce: products live in the site spec; orders are direct charges on the owner's connected account. */
import { id, now } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";
import { projects } from "@/lib/create/repo";
import { audit, inbox, logActivity, orders } from "./repo";
import { applicationFee, createCheckoutSession, getAccount, inCurrentMode, PAUSED_MESSAGE, paymentsPaused, stripeMode } from "./stripe";
import { upsertContact } from "./crm";
import { emit } from "./events";
import type { Order } from "./types";

export function safeReturnPath(raw: unknown, fallback: string) {
  const s = typeof raw === "string" ? raw : "";
  return /^\/sites\/[a-z0-9._/-]*$/i.test(s) && !s.includes("..") ? s : fallback;
}

/** Public origin used for Stripe's success/cancel URLs. NEXT_PUBLIC_SITE_URL wins over the request origin. */
export function siteOrigin(requestUrl?: string) {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (env && /^https?:\/\//.test(env)) return env;
  if (requestUrl) return new URL(requestUrl).origin;
  return "https://keplar.one";
}

export async function startCheckout(input: { projectId: string; productId: string; returnPath?: string; origin?: string }) {
  const project = await projects().findSystemBy("id", input.projectId);
  if (!project || project.takenDown) throw new HttpError(404, "This store isn't available.");
  const product = project.spec?.products.find((p) => p.id === input.productId);
  if (!product) throw new HttpError(404, "Product not found.");
  if (await paymentsPaused()) throw new HttpError(503, PAUSED_MESSAGE, "payments_paused");
  const acct = await getAccount(project.workspaceId);
  if (!acct || !acct.chargesEnabled) throw new HttpError(409, "This store isn't accepting payments yet.", "payments_not_enabled");
  const orderId = id("ord");
  const returnPath = safeReturnPath(input.returnPath, `/sites/${project.slug}/`);
  const session = await createCheckoutSession(acct, { orderId, projectId: project.id, productId: product.id, productName: product.name, amount: product.price, currency: product.currency, origin: input.origin ?? siteOrigin(), returnPath });
  const order: Order = {
    id: orderId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    productId: product.id,
    productName: product.name,
    amount: product.price,
    currency: product.currency,
    applicationFeeAmount: applicationFee(product.price),
    status: "pending",
    checkoutSessionId: session.id,
    customerEmail: null,
    contactId: null,
    returnPath,
    createdAt: now(),
    paidAt: null,
    source: "keplar",
    stripeAccountId: acct.stripeAccountId,
    livemode: stripeMode() === "live",
  };
  await orders().insert(order);
  return { order, session };
}

export async function orderBySession(sessionId: string) {
  return orders().findSystemBy("checkoutSessionId", sessionId);
}

/**
 * Webhook-equivalent handler (checkout.session.completed / .expired).
 * Live: /api/business/stripe/webhook verifies the signature, then calls this.
 */
export async function completeCheckout(sessionId: string, outcome: "paid" | "cancelled", customerEmail?: string, extra: { livemode?: boolean; paymentIntentId?: string | null; stripeAccountId?: string } = {}) {
  const order = await orderBySession(sessionId);
  if (!order) throw new HttpError(404, "Checkout session not found.");
  if (order.status !== "pending") return order; // idempotent
  if (outcome === "cancelled") return orders().update(order.workspaceId, order.id, { status: "cancelled" });
  let contactId: string | null = null;
  if (customerEmail) {
    const c = await upsertContact(order.workspaceId, { email: customerEmail, source: "checkout", projectId: order.projectId });
    contactId = c.id;
  }
  const paid = await orders().update(order.workspaceId, order.id, {
    status: "paid",
    paidAt: now(),
    customerEmail: customerEmail ?? null,
    contactId,
    ...(extra.paymentIntentId !== undefined ? { paymentIntentId: extra.paymentIntentId } : {}),
    ...(extra.stripeAccountId ? { stripeAccountId: extra.stripeAccountId } : {}),
    ...(extra.livemode !== undefined ? { livemode: extra.livemode } : {}),
  });
  const amount = `${(order.amount / 100).toFixed(2)} ${order.currency.toUpperCase()}`;
  await logActivity(order.workspaceId, contactId, "order_paid", `Order ${order.productName} · ${amount}`, order.id);
  await inbox().insert({ id: id("msg"), workspaceId: order.workspaceId, channel: "order", direction: "in", from: customerEmail ?? "Customer", to: "Store", subject: `New order: ${order.productName}`, body: `Paid ${amount}.`, contactId, read: false, mock: false, at: now() });
  await audit(order.workspaceId, "system", "order.paid", order.id, amount);
  await emit(order.workspaceId, "order.paid", { orderId: order.id });
  return paid;
}

export async function listOrders(workspaceId: string) {
  return (await orders().list(workspaceId, inCurrentMode)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
