import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { planFromCookie } from "@/lib/billing/plan-cookie";
import { assertSameOrigin } from "@/lib/security/origin";
import { whopPurchaseUrl } from "@/lib/billing/whop";

export const runtime = "nodejs";

/** Whop's hosted billing page for the customer's membership (manage or cancel). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "billing_portal", { perIp: 10 });
    const ws = await requireAccount(req);
    const row = await getWorkspace(ws.id);
    const url = whopPurchaseUrl(row?.billing.manageUrl) ?? whopPurchaseUrl(planFromCookie(req.headers.get("cookie"), ws.email)?.manageUrl);
    if (!url) throw new HttpError(409, "No subscription to manage yet.", "no_subscription");
    return json({ url });
  } catch (e) {
    return errorResponse(e);
  }
}
