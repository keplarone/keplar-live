import { errorResponse, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { requireAccount } from "@/lib/create/platform/workspace";
import { updateWorkspace } from "@/lib/accounts/workspaces";
import { planCookieHeader, signPlanCookie } from "@/lib/billing/plan-cookie";
import { claimFromPayment } from "@/lib/billing/sync";
import { listPaidPayments, whopCheckoutConfigured } from "@/lib/billing/whop";
import { assertSameOrigin } from "@/lib/security/origin";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Refresh plan": after checkout (or any time), look for a paid Whop payment
 * made for this signed-in email, and record the plan. Only payments whose
 * checkout metadata carries this exact email count, so it can't be claimed
 * for someone else. Sets the signed, HttpOnly plan cookie (no database needed).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "billing_sync", { perIp: 20 });
    const ws = await requireAccount(req);
    await limitRequest(req, "billing_sync", { perIp: 20, perAccount: 6, accountId: ws.id });
    if (!whopCheckoutConfigured() || !ws.email) return json({ configured: false, plan: ws.plan });
    // A refund or dispute (webhook) moved this account to Free; "Refresh plan" must not undo that. Only a new payment webhook can.
    const { getWorkspace } = await import("@/lib/accounts/workspaces");
    if ((await getWorkspace(ws.id))?.billing.status === "unpaid") return json({ configured: true, plan: ws.plan, found: false, blocked: "A refund or dispute is on file for this account. Contact team@keplar.one." });
    const payments = await listPaidPayments({ email: ws.email });
    const best = payments.map((p) => claimFromPayment(p, ws.email!)).filter((c): c is NonNullable<typeof c> => Boolean(c)).sort((a, b) => (a.plan === b.plan ? b.periodEnd.localeCompare(a.periodEnd) : a.plan === "pro" ? -1 : 1))[0];
    if (!best) return json({ configured: true, plan: ws.plan, found: false });
    await updateWorkspace(ws.id, { plan: best.plan, billing: { status: "active", subscriptionId: best.membershipId, periodStart: best.periodStart, periodEnd: best.periodEnd, manageUrl: best.manageUrl, mode: "live", cancelAtPeriodEnd: false, paymentFailedAt: null } });
    const { value, maxAgeSec } = signPlanCookie(ws.email, { plan: best.plan, periodStart: best.periodStart, periodEnd: best.periodEnd, manageUrl: best.manageUrl });
    return json({ configured: true, plan: best.plan, found: true }, { headers: { "set-cookie": planCookieHeader(value, maxAgeSec, (process.env.BETTER_AUTH_URL || siteUrl).startsWith("https://")) } });
  } catch (e) {
    return errorResponse(e);
  }
}
