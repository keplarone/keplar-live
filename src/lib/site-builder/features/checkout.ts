/**
 * Checkout (BETA): buy buttons on a published site. The product list lives in the placeholder, the money moves through the owner's own
 * Stripe Connect account (direct charge, Stripe-hosted checkout page), and the order is confirmed only by Stripe's signed webhook.
 * Pure parsing here; the Stripe calls are in handlers.ts through the existing business/commerce adapter.
 */
import { ALLOWED_CURRENCIES, getAccount, orderLimits, paymentsPaused, stripeConfigured, stripeMode } from "@/lib/business/stripe";
import { workspaceById } from "@/lib/create/platform/workspace";

export type CheckoutProduct = { id: string; name: string; price: number; description: string };
export const MAX_PRODUCTS = 12;
export const MAX_QTY = 10;

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "item";

/** "Name;7.50;Short description|Name two;12". Prices are in the major unit; bad rows are dropped. Ids are stable per name. */
export function parseProducts(raw: string | undefined): CheckoutProduct[] {
  const out: CheckoutProduct[] = [];
  const seen = new Set<string>();
  for (const row of (raw ?? "").split("|").slice(0, MAX_PRODUCTS)) {
    const [name = "", price = "", description = ""] = row.split(";").map((x) => x.trim());
    const m = price.match(/^\$?(\d{1,6})(?:\.(\d{1,2}))?$/);
    if (!name || !m) continue;
    const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
    if (cents < 50) continue;
    let id = slugOf(name);
    for (let n = 2; seen.has(id); n++) id = `${slugOf(name).slice(0, 26)}-${n}`;
    seen.add(id);
    out.push({ id, name: name.slice(0, 80), price: cents, description: description.slice(0, 160) });
  }
  return out;
}

export function currencyOf(attrs: Record<string, string>): string {
  const c = (attrs.currency || "usd").toLowerCase();
  return (ALLOWED_CURRENCIES as readonly string[]).includes(c) ? c : "usd";
}

export const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export type PayState = { open: true; mode: "test" | "live" } | { open: false; why: string };
/** Can this site take a payment right now? Every reason is written for the visitor; the owner sees the detail in More > Features. */
export async function payState(workspaceId: string): Promise<PayState> {
  const closed = (why: string): PayState => ({ open: false, why });
  if (!stripeConfigured()) return closed("Online ordering isn't switched on yet.");
  if (await paymentsPaused()) return closed("Online ordering is paused for a moment. Please try again shortly.");
  const ws = await workspaceById(workspaceId).catch(() => null);
  if (!ws?.entitlements.commerce) return closed("Online ordering isn't switched on yet.");
  const acct = await getAccount(workspaceId);
  if (!acct || !acct.chargesEnabled) return closed("Online ordering isn't switched on yet.");
  return { open: true, mode: stripeMode() };
}

export const withinLimits = (total: number) => {
  const l = orderLimits();
  return total >= l.min && total <= l.max;
};
