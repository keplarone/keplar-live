import { NextResponse } from "next/server";
import { getSession } from "@/lib/accounts/auth";
import { authSecret } from "@/lib/accounts/secret";
import { signedInAt, signedInRecently } from "@/lib/accounts/reauth";
import { businessUrl, isBusinessHost, safeBusinessNext } from "@/lib/business-site";
import { isNonceHash, signTicket } from "@/lib/business/handoff";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { hostOf } from "@/lib/domains/routing";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Step 2 of the Keplar Business sign-in handoff (src/lib/business/handoff.ts), on keplar.one: with the Keplar session,
 * sign a one-minute ticket bound to the Business browser's nonce and send the browser back to business.keplar.one.
 * Not signed in yet: Keplar One's own sign-in first (password, Google, Microsoft, passkey, email link, two-factor), then here again.
 */
export async function GET(req: Request) {
  if (isBusinessHost(hostOf(req))) return new NextResponse("Not found.", { status: 404 });
  await limitRequest(req, "business_handoff", { perIp: 30 });
  const url = new URL(req.url);
  const n = url.searchParams.get("n");
  const next = safeBusinessNext(url.searchParams.get("next"));
  if (!isNonceHash(n)) return NextResponse.redirect(businessUrl("/?signin=invalid"), 303);
  // reauth=1: Business asked for a fresh sign-in (src/lib/accounts/reauth.ts). The Business session inherits this
  // session's sign-in time, so an older Keplar session signs in again here first.
  const reauth = url.searchParams.get("reauth") === "1";
  const session = await getSession(req.headers);
  if (!session || (reauth && !signedInRecently(session))) {
    const back = `/api/business/handoff?n=${encodeURIComponent(n)}&next=${encodeURIComponent(next)}${reauth ? "&reauth=1" : ""}`;
    return NextResponse.redirect(`${siteUrl}/signin?${reauth ? "reauth=1&" : ""}next=${encodeURIComponent(back)}`, 303);
  }
  const ticket = signTicket(authSecret(), { userId: session.user.id, email: session.user.email, name: session.user.name ?? null, authAt: signedInAt(session) }, n);
  const res = NextResponse.redirect(businessUrl(`/api/auth/business/finish?t=${encodeURIComponent(ticket)}&next=${encodeURIComponent(next)}`), 303);
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
