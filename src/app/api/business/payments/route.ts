import { body, errorResponse, json } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { CONNECT_WEBHOOK_EVENTS, CONNECT_WEBHOOK_PATH, CONNECT_WEBHOOK_V2_EVENTS, connectProblem, ensureAccount, getAccount, MAX_FEE_BPS, orderLimits, payoutSummary, paymentsPaused, STRIPE_API_VERSION, stripeConfigured, stripeMode, WEBHOOK_SECRET_ENV } from "@/lib/business/stripe";
import { siteOrigin } from "@/lib/business/commerce";
import { memberOf, requireBusinessRole } from "@/lib/business/team";
import { owner } from "../_owner";

export const runtime = "nodejs";

/** Status for the Payments card. `details=1` adds the connected account's balance and latest payouts. */
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    const account = await getAccount(ws.id);
    const configured = stripeConfigured();
    let payouts = null;
    let payoutsError: string | null = null;
    // Balance and payouts are the owner's bank-side data: teammates see the account status only.
    if (configured && account?.chargesEnabled && !memberOf(ws) && new URL(req.url).searchParams.get("details") === "1") {
      try {
        payouts = await payoutSummary(account);
      } catch {
        payoutsError = "Stripe didn't answer. Try again in a moment.";
      }
    }
    const limits = orderLimits();
    return json({
      configured,
      mode: stripeMode(),
      paused: await paymentsPaused(),
      apiVersion: STRIPE_API_VERSION,
      commerce: ws.entitlements.commerce,
      account,
      payouts,
      payoutsError,
      platformFeeBps: Math.min(Number(process.env.KEPLAR_APPLICATION_FEE_BPS ?? 0) || 0, MAX_FEE_BPS),
      limits: { minOrder: limits.min, maxOrder: limits.max },
      // Operator details (env names, exact mismatch, webhook setup) are for admins only; sellers just see "not set up".
      ...(ws.admin ? { admin: { problem: connectProblem(), secretEnv: WEBHOOK_SECRET_ENV[stripeMode()], webhook: { url: `${siteOrigin(req.url)}${CONNECT_WEBHOOK_PATH}`, events: CONNECT_WEBHOOK_EVENTS, thinEvents: CONNECT_WEBHOOK_V2_EVENTS } } } : {}),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    requireBusinessRole(ws, "set up payments");
    if (!ws.entitlements.commerce) throw new EntitlementError("Selling on your site is available on Plus and up.", "plus");
    const b = await body<{ email?: string; businessName?: string; country?: string }>(req);
    // The connected account is the owner's: never a teammate's address (a teammate acts in the owner's workspace with their own email).
    const account = await ensureAccount(ws.id, { email: memberOf(ws)?.ownerEmail || ws.email || (b.email ?? ""), businessName: (b.businessName ?? ws.name).slice(0, 120), country: b.country });
    return json({ account });
  } catch (e) {
    return errorResponse(e);
  }
}
