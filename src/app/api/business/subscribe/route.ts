import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest, rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { getBusinessAccount } from "@/lib/business/account";
import { businessWhopPlanId, isBillingCycle, isSelfServeTier } from "@/lib/business/tiers";
import { createBusinessCheckout, whopCheckoutConfigured } from "@/lib/billing/whop";

export const runtime = "nodejs";

/**
 * Starts a Keplar Business checkout for Starter, Growth or Scale (monthly or annual). Signed in, verified, with a business
 * account; same-origin; rate limited. Enterprise is sold by contract (business.keplar.one inquiry), never here.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "business_subscribe", { perIp: 10 });
    const ws = await requireAccount(req);
    await rateLimit(`acct:${ws.id}:business_subscribe`, 5);
    const { tier, cycle } = await body<{ tier?: string; cycle?: string }>(req);
    if (!isSelfServeTier(tier)) throw new HttpError(400, "Choose Starter, Growth or Scale. Enterprise starts with an inquiry.");
    if (!isBillingCycle(cycle)) throw new HttpError(400, "Choose monthly or annual billing.");
    if (!ws.email) throw new HttpError(400, "Your account needs an email address.");
    if (!(await getBusinessAccount(ws.id))) throw new HttpError(409, "Create your business account first.", "no_business_account");
    const planId = businessWhopPlanId(tier, cycle);
    if (!planId || !whopCheckoutConfigured()) return json({ configured: false, error: "This plan opens for purchase soon. Send us an inquiry and we will set you up." }, { status: 503 });
    const c = await createBusinessCheckout({ planId, tier, cycle, email: ws.email, workspaceId: ws.id });
    return json({ configured: true, url: c.url });
  } catch (e) {
    return errorResponse(e);
  }
}
