import { currentWorkspace } from "@/lib/create/platform/workspace";
import { errorResponse, json } from "@/lib/create/platform/http";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { getWorkspace } from "@/lib/accounts/workspaces";
import { minuteLimit } from "@/lib/tools/access";
import { cookieOf, clientIp, deviceCookie, originFor, withCookies } from "@/lib/referrals/http";
import { ensureProfile, inviteUrl, summaryFor } from "@/lib/referrals/repo";
import { DEV_COOKIE } from "@/lib/referrals/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in person's invite link, rewards, caps and the outcome of each friend (masked). */
export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req); // 401 when signed out
    assertSameAccount(req, ws.userId);
    await minuteLimit(`referrals:${ws.id}`, 30);
    if (!ws.email || !ws.verified) return json({ error: "Verify your email address first." }, { status: 403 });
    const row = await getWorkspace(ws.id);
    const profile = await ensureProfile({ workspaceId: ws.id, userId: ws.userId, email: ws.email }, { ip: clientIp(req), deviceId: cookieOf(req, DEV_COOKIE) }, row?.createdAt ?? new Date().toISOString());
    const summary = await summaryFor(profile);
    return withCookies(json({ ...summary, link: inviteUrl(originFor(req), profile.code), termsUrl: "/referral-terms" }), deviceCookie(req));
  } catch (e) {
    return errorResponse(e);
  }
}
