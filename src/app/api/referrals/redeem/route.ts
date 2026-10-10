import { currentWorkspace } from "@/lib/create/platform/workspace";
import { errorResponse, json } from "@/lib/create/platform/http";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { isSameOrigin } from "@/lib/security/origin";
import { HttpError } from "@/lib/create/platform/http";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { minuteLimit } from "@/lib/tools/access";
import { clearInviteCookies, clientIp, cookieOf, withCookies } from "@/lib/referrals/http";
import { redeemReferral } from "@/lib/referrals/repo";
import { DEV_COOKIE, REF_COOKIE } from "@/lib/referrals/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The new account claims the invite its browser opened. Needs a signed-in session with a verified email; the invite code comes from the
 * HttpOnly cookie set by /invite/<code> (never from the request body). Safe to call repeatedly: one reward per account.
 */
export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req);
    assertSameAccount(req, ws.userId);
    await minuteLimit(`referral-redeem:${ws.id}`, 10);
    const code = cookieOf(req, REF_COOKIE);
    if (!code) return json({ status: "none" });
    if (!ws.email || !ws.verified) throw new HttpError(403, "Verify your email address first.", "unverified");
    const row = await getWorkspace(ws.id);
    const r = await redeemReferral({
      code: code.toLowerCase(),
      account: { workspaceId: ws.id, userId: ws.userId, email: ws.email, createdAt: row?.createdAt ?? new Date().toISOString() },
      ip: clientIp(req),
      deviceId: cookieOf(req, DEV_COOKIE),
    });
    // Every outcome is final for this browser, so the code is forgotten (the claim itself is on file).
    return withCookies(json("claim" in r ? { status: r.status, message: r.message, friendCredits: r.claim.friendCredits } : { status: r.status }), clearInviteCookies(req));
  } catch (e) {
    return errorResponse(e);
  }
}
