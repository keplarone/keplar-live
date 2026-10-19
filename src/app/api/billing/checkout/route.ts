import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest, rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { embedPlanId, isPaidPlan } from "@/lib/billing/plans";
import { createCheckoutConfiguration, whopCheckoutConfigured } from "@/lib/billing/whop";
import { sanitizeAttribution } from "@/lib/seo/attribution";

export const runtime = "nodejs";

/** Signed-in + verified users only; same-origin, rate limited per IP and per account. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "billing_checkout", { perIp: 10 });
    if (!whopCheckoutConfigured()) return json({ configured: false, error: "Checkout opens soon." }, { status: 503 });
    const ws = await requireAccount(req);
    // Per account only here: the per-IP hit was already counted above (counting it twice halved the documented 10/min).
    await rateLimit(`acct:${ws.id}:billing_checkout`, 5);
    const { plan, attribution } = await body<{ plan?: string; attribution?: unknown }>(req);
    if (!isPaidPlan(plan)) throw new HttpError(400, "Choose lite, plus or pro.");
    if (plan === "lite" && !embedPlanId("lite")) throw new HttpError(404, "This plan is not available yet.", "plan_unavailable");
    if (!ws.email) throw new HttpError(400, "Your account needs an email address.");
    // Coarse first-touch attribution (landing page, source class, campaign) rides along as metadata; it grants nothing (src/lib/seo/attribution.ts).
    const c = await createCheckoutConfiguration({ plan, email: ws.email, workspaceId: ws.id, origin: new URL(req.url).origin, attribution: sanitizeAttribution(attribution) });
    return json({ configured: true, url: c.url });
  } catch (e) {
    return errorResponse(e);
  }
}
