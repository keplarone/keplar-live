import { currentWorkspace } from "@/lib/create/platform/workspace";
import { meter } from "@/lib/create/platform/compute";
import { errorResponse, json, unavailableResponse } from "@/lib/create/platform/http";
import { storeUnavailableNow } from "@/lib/create/platform/neon";
import { embedPlanId } from "@/lib/billing/plans";
import { checkoutAvailable } from "@/lib/billing/whop";
import { getSession } from "@/lib/accounts/auth";
import { dailyMeter, dailySubjects } from "@/lib/usage/daily";
import { limitsFor } from "@/lib/orchestration/limits";
import { clientIpOf } from "@/lib/create/platform/ratelimit";
import { freeQuestionLimit } from "@/lib/cost/hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one Usage meter: /app, Create and Business all read this ledger.
 * `?lite=1` (the site nav's plan check, on every marketing page view): a signed-out visitor gets their plan and sign-in state
 * without the meter, so a page view never touches the database (the meter took ~6 queries per view and kept it awake).
 * Signed-in callers and the app's own meter (no `lite`) get the full answer as before.
 */
export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    // A session can't be checked while the database is down (it reads as signed out): say "unavailable", never "signed out".
    if (ws.anonymous && storeUnavailableNow()) return unavailableResponse();
    if (ws.anonymous && new URL(req.url).searchParams.get("lite") === "1") {
      return json({ plan: "free", signedIn: false, account: null, verified: false, admin: false, lite: true, checkout: checkoutAvailable(), liteCheckout: Boolean(embedPlanId("lite")) });
    }
    // Who this browser is signed in as: the app keys its chat list and local caches by this id (never anyone else's).
    const who = ws.userId ? await getSession(req.headers) : null;
    const account = ws.userId ? { id: ws.userId, email: ws.email, name: who?.user.name || null } : null;
    // Free: questions left today (the same exact count /api/keplar claims from), so the Ask UI and the account page agree.
    const daily = ws.plan === "free" && !ws.admin ? await dailyMeter(dailySubjects({ workspaceId: ws.id, anonymous: ws.anonymous, ip: clientIpOf(req), cookie: req.headers.get("cookie"), secure: false, limit: await freeQuestionLimit(ws.anonymous, limitsFor("free").dailyRequests), ipLimit: limitsFor("free").dailyIpRequests })) : null;
    return json({ ...(await meter(ws)), daily, signedIn: Boolean(ws.userId), account, verified: ws.verified, checkout: checkoutAvailable(), liteCheckout: Boolean(embedPlanId("lite")) });
  } catch (e) {
    return errorResponse(e);
  }
}
