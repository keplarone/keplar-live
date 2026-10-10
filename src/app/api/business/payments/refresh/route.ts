import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { getAccount, stripeConfigured } from "@/lib/business/stripe";
import { fetchV2Account, refreshConnectAccount } from "@/lib/business/connect-webhook";
import { owner } from "../../_owner";

export const runtime = "nodejs";

/** Re-reads the connected account from Stripe (after returning from onboarding) and updates its status. */
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const acct = await getAccount(ws.id);
    if (!acct) throw new HttpError(409, "Set up payments first.", "no_account");
    if (!stripeConfigured()) return json({ account: acct, refreshed: false });
    return json({ account: await refreshConnectAccount(acct, { fetchV2Account }), refreshed: true });
  } catch (e) {
    return errorResponse(e);
  }
}
