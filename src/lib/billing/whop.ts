/**
 * Whop billing for Keplar's own plans (Lite $20, Plus $45, Pro $99 per month).
 *
 *  - Checkout: POST https://api.whop.com/api/v1/checkout_configurations with an
 *    inline renewal plan; the response's `purchase_url` is where we send the
 *    customer. `metadata` ({email, plan, workspace_id}) is copied onto the
 *    resulting payment and membership, which is how webhooks find the account.
 *  - Webhook (/api/webhooks/whop): Standard Webhooks signature, see verifyWebhook().
 *  - Not configured (no WHOP_API_KEY / WHOP_COMPANY_ID): nothing here runs and the
 *    UI says "Checkout opens soon". Nothing is faked.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site";
import { HttpError } from "@/lib/create/platform/http";
import { embedPlanId, PAID_PLANS, type PaidPlan } from "./plans";

export const WHOP_API = "https://api.whop.com/api/v1";
export const WHOP_ORIGIN = "https://whop.com";

const env = (k: string) => process.env[k]?.trim() || "";
export const whopCheckoutConfigured = () => Boolean(env("WHOP_API_KEY") && env("WHOP_COMPANY_ID"));
/** Any way to sell a plan: the hosted API flow, or an embedded checkout plan id. */
export const checkoutAvailable = () => whopCheckoutConfigured() || Boolean(embedPlanId("plus") || embedPlanId("pro") || embedPlanId("lite"));
export const whopWebhookConfigured = () => Boolean(env("WHOP_WEBHOOK_SECRET"));

/** BETTER_AUTH_URL wins (production); the request origin is only a dev fallback. */
export const baseUrl = (origin?: string) => (env("BETTER_AUTH_URL") || origin || siteUrl).replace(/\/$/, "");

async function whopFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = env("WHOP_API_KEY");
  if (!key) throw new HttpError(503, "Checkout opens soon.", "billing_unconfigured");
  return fetch(`${WHOP_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

/** Only ever send customers to Whop's own domain. */
export function whopPurchaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw, WHOP_ORIGIN);
    return u.protocol === "https:" && (u.hostname === "whop.com" || u.hostname.endsWith(".whop.com")) ? u.toString() : null;
  } catch {
    return null;
  }
}

export type CheckoutInput = { plan: PaidPlan; email: string; workspaceId: string; origin?: string };

/** The request body for an inline monthly plan; the first charge is the plan price (no extra initial fee). */
export function checkoutBody(input: CheckoutInput & { plan: Exclude<PaidPlan, "lite"> }) {
  const p = PAID_PLANS[input.plan];
  return {
    plan: {
      company_id: env("WHOP_COMPANY_ID"),
      currency: "usd",
      plan_type: "renewal",
      billing_period: 30,
      renewal_price: p.usdMonthly,
      initial_price: 0,
      title: p.name,
      description: `${p.name}, billed monthly.`,
      visibility: "hidden",
      product: { external_identifier: p.productKey, title: p.name },
    },
    metadata: { email: input.email.trim().toLowerCase(), plan: input.plan, workspace_id: input.workspaceId, source: "keplar.one" },
    redirect_url: `${baseUrl(input.origin)}/account?checkout=success`,
  };
}

/** Keplar Lite is sold through its existing Whop plan (WHOP_PLAN_LITE): the plan id decides price and product, never the browser. */
export function liteCheckoutBody(input: CheckoutInput) {
  return {
    plan_id: embedPlanId("lite") ?? "",
    metadata: { email: input.email.trim().toLowerCase(), plan: "lite", workspace_id: input.workspaceId, source: "keplar.one" },
    redirect_url: `${baseUrl(input.origin)}/account?checkout=success`,
  };
}

/**
 * Checkout for a limit-extension pack: the pack's own one-time Whop plan id decides price and product (never the browser).
 * Metadata carries the account email for the webhook; it deliberately has no `plan`, so it can never change a subscription.
 */
export function extensionCheckoutBody(input: { planId: string; pack: string; email: string; workspaceId: string; origin?: string }) {
  return {
    plan_id: input.planId,
    metadata: { email: input.email.trim().toLowerCase(), kind: "extension", pack: input.pack, workspace_id: input.workspaceId, source: "keplar.one" },
    redirect_url: `${baseUrl(input.origin)}/app?extension=success`,
  };
}

export async function createExtensionCheckout(input: { planId: string; pack: string; email: string; workspaceId: string; origin?: string }): Promise<{ id: string; url: string }> {
  if (!whopCheckoutConfigured()) throw new HttpError(503, "Checkout opens soon.", "billing_unconfigured");
  const res = await whopFetch("/checkout_configurations", { method: "POST", body: JSON.stringify(extensionCheckoutBody(input)) }).catch(() => null);
  if (!res || !res.ok) {
    if (res) console.error("[whop] extension checkout_configurations failed with status", res.status);
    throw new HttpError(502, "Checkout couldn't start. Please try again in a moment.", "whop_error");
  }
  const j = (await res.json().catch(() => null)) as { id?: string; purchase_url?: string } | null;
  const url = whopPurchaseUrl(j?.purchase_url);
  if (!j?.id || !url) throw new HttpError(502, "Checkout couldn't start. Please try again in a moment.", "whop_error");
  return { id: j.id, url };
}

export async function createCheckoutConfiguration(input: CheckoutInput): Promise<{ id: string; url: string }> {
  if (!whopCheckoutConfigured()) throw new HttpError(503, "Checkout opens soon.", "billing_unconfigured");
  if (input.plan === "lite" && !embedPlanId("lite")) throw new HttpError(404, "This plan is not available yet.", "plan_unavailable");
  const res = await whopFetch("/checkout_configurations", { method: "POST", body: JSON.stringify(input.plan === "lite" ? liteCheckoutBody(input) : checkoutBody({ ...input, plan: input.plan })) }).catch(() => null);
  if (!res || !res.ok) {
    if (res) console.error("[whop] checkout_configurations failed with status", res.status);
    throw new HttpError(502, "Checkout couldn't start. Please try again in a moment.", "whop_error");
  }
  const j = (await res.json().catch(() => null)) as { id?: string; purchase_url?: string } | null;
  const url = whopPurchaseUrl(j?.purchase_url);
  if (!j?.id || !url) throw new HttpError(502, "Checkout couldn't start. Please try again in a moment.", "whop_error");
  return { id: j.id, url };
}

/* ───────────────────── payments lookup (return from checkout / restore) ───────────────────── */

export type WhopPayment = {
  id: string;
  status?: string;
  substatus?: string;
  paid_at?: string | null;
  checkout_configuration_id?: string | null;
  metadata?: Record<string, unknown> | null;
  membership?: { id?: string; status?: string; manage_url?: string | null } | null;
  plan?: { id?: string } | null;
  /** Amounts as Whop returns them (dollars). */
  total?: number | null;
  usd_total?: number | null;
  currency?: string | null;
  amount_after_fees?: number | null;
};

/** Recent paid payments, newest first. Filter by checkout configuration when known. Returns [] on any API problem. */
export async function listPaidPayments(opts: { checkoutConfigurationId?: string; email?: string } = {}): Promise<WhopPayment[]> {
  if (!whopCheckoutConfigured()) return [];
  const q = new URLSearchParams({ company_id: env("WHOP_COMPANY_ID"), first: "50", order: "paid_at", direction: "desc" });
  q.append("statuses[]", "paid");
  if (opts.checkoutConfigurationId) q.append("checkout_configuration_ids[]", opts.checkoutConfigurationId);
  if (opts.email) q.set("query", opts.email);
  const res = await whopFetch(`/payments?${q}`).catch(() => null);
  if (!res?.ok) return [];
  const j = (await res.json().catch(() => null)) as { data?: WhopPayment[] } | null;
  return Array.isArray(j?.data) ? j.data : [];
}

/* ───────────────────────────── webhook signature ───────────────────────────── */

export const WEBHOOK_TOLERANCE_SEC = 5 * 60;

/** Candidate HMAC keys: Whop's literal secret bytes, and the Standard Webhooks base64-decoded form. */
function webhookKeys(secret: string): Buffer[] {
  const keys = [Buffer.from(secret, "utf8")];
  const b64 = secret.replace(/^(whsec_|ws_)/, "");
  const dec = Buffer.from(b64, "base64");
  if (dec.length >= 16) keys.push(dec);
  return keys;
}

/**
 * Standard Webhooks: signed content is `${webhook-id}.${webhook-timestamp}.${rawBody}`,
 * HMAC-SHA256, base64, header `webhook-signature: v1,<sig> [v1,<sig2> ...]`.
 * Constant-time comparison; timestamps more than 5 minutes off are rejected (replay).
 */
export function verifyWebhook(rawBody: string, headers: { get(name: string): string | null }, secret: string, nowMs = Date.now()): boolean {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!secret || !id || !ts || !sigHeader) return false;
  if (!/^\d{9,12}$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > WEBHOOK_TOLERANCE_SEC) return false;
  const content = `${id}.${ts}.${rawBody}`;
  const given = sigHeader.split(" ").map((s) => s.trim()).filter((s) => s.startsWith("v1,")).map((s) => s.slice(3));
  if (!given.length) return false;
  for (const key of webhookKeys(secret)) {
    const want = createHmac("sha256", key).update(content).digest();
    for (const g of given) {
      const got = Buffer.from(g, "base64");
      if (got.length === want.length && timingSafeEqual(got, want)) return true;
    }
  }
  return false;
}

/** For tests and local replays: sign a payload exactly as Whop does. */
export function signWebhook(rawBody: string, id: string, ts: number, secret: string): string {
  return `v1,${createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${ts}.${rawBody}`).digest("base64")}`;
}

/* ───────────────────── Keplar Business (business.keplar.one) ───────────────────── */

/**
 * Checkout for a Keplar Business tier: the tier's own Whop plan id (WHOP_PLAN_BIZ_<TIER>_MONTHLY) decides price and
 * product; the webhook grants the business plan from that id alone (src/lib/business/tiers.ts). Returns to business.keplar.one.
 */
export function businessCheckoutBody(input: { planId: string; tier: string; email: string; workspaceId: string }) {
  return {
    plan_id: input.planId,
    metadata: { email: input.email.trim().toLowerCase(), plan: "business", tier: input.tier, cycle: "monthly", workspace_id: input.workspaceId, source: "business.keplar.one" },
    redirect_url: "https://business.keplar.one/?purchased=1",
  };
}

export async function createBusinessCheckout(input: { planId: string; tier: string; email: string; workspaceId: string }): Promise<{ id: string; url: string }> {
  if (!whopCheckoutConfigured()) throw new HttpError(503, "Checkout opens soon.", "billing_unconfigured");
  const res = await whopFetch("/checkout_configurations", { method: "POST", body: JSON.stringify(businessCheckoutBody(input)) }).catch(() => null);
  if (!res || !res.ok) {
    if (res) console.error("[whop] business checkout_configurations failed with status", res.status);
    throw new HttpError(502, "Checkout couldn't start. Please try again in a moment.", "whop_error");
  }
  const j = (await res.json().catch(() => null)) as { id?: string; purchase_url?: string } | null;
  const url = whopPurchaseUrl(j?.purchase_url);
  if (!j?.id || !url) throw new HttpError(502, "Checkout couldn't start. Please try again in a moment.", "whop_error");
  return { id: j.id, url };
}
