import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { getAccount, onboardingLink } from "@/lib/business/stripe";
import { siteOrigin } from "@/lib/business/commerce";
import { audit } from "@/lib/business/repo";
import { auditActor, requireBusinessRole } from "@/lib/business/team";
import { owner } from "../../_owner";

export const runtime = "nodejs";

/** A fresh single-use Stripe-hosted onboarding (or update) link for the owner's connected account. */
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    requireBusinessRole(ws, "set up payments");
    if (!ws.entitlements.commerce) throw new EntitlementError("Selling on your site is available on Plus and up.", "plus");
    const acct = await getAccount(ws.id);
    if (!acct) throw new HttpError(409, "Set up payments first.", "no_account");
    const link = await onboardingLink(acct, siteOrigin(req.url));
    await audit(ws.id, auditActor(ws), "stripe.onboarding_link", acct.stripeAccountId, "created");
    return json(link);
  } catch (e) {
    return errorResponse(e);
  }
}
