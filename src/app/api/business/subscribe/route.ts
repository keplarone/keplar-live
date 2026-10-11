import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest, rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { getBusinessAccount } from "@/lib/business/account";
import { businessWhopPlanId, isSelfServeTier } from "@/lib/business/tiers";
import { embedMetadata } from "@/lib/billing/embed";
import { createBusinessCheckout, whopCheckoutConfigured } from "@/lib/billing/whop";
import { businessUrl } from "@/lib/business-site";

export const runtime = "nodejs";

/**
 * Starts a Keplar Business checkout for Starter, Growth or Scale (billed monthly). Signed in, verified, with a business
 * account; same-origin; rate limited. Enterprise is sold by contract (business.keplar.one inquiry), never here.
 *
 * mode "embed" (the default on business.keplar.one/account) returns the config for Whop's embedded checkout, as Keplar One's
 * /checkout does: the tier's own Whop plan id decides what is sold, and the account email is signed on the server
 * (keplar_ref) so the webhook can trust it. mode "hosted" creates a Whop-hosted checkout and returns its URL (the fallback
 * when the embed can't load).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "business_subscribe", { perIp: 20 });
    const ws = await requireAccount(req);
    await rateLimit(`acct:${ws.id}:business_subscribe`, 10);
    const { tier, mode } = await body<{ tier?: string; mode?: string }>(req);
    if (!isSelfServeTier(tier)) throw new HttpError(400, "Choose Starter, Growth or Scale. Enterprise starts with an inquiry.");
    if (!ws.email) throw new HttpError(400, "Your account needs an email address.");
    if (!(await getBusinessAccount(ws.id))) throw new HttpError(409, "Create your business account first.", "no_business_account");
    const planId = businessWhopPlanId(tier);
    const soon = () => json({ configured: false, error: "This plan opens for purchase soon. Send us an inquiry and we will set you up." }, { status: 503 });
    if (!planId) return soon();
    if (mode !== "hosted") {
      const metadata = { ...embedMetadata({ email: ws.email, plan: "business", workspaceId: ws.id }), tier, cycle: "monthly" };
      return json({ configured: true, embed: { planId, metadata, returnUrl: businessUrl("/?purchased=1") }, hosted: whopCheckoutConfigured() });
    }
    if (!whopCheckoutConfigured()) return soon();
    const c = await createBusinessCheckout({ planId, tier, email: ws.email, workspaceId: ws.id });
    return json({ configured: true, url: c.url });
  } catch (e) {
    return errorResponse(e);
  }
}
