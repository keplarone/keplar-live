import { NextResponse } from "next/server";
import { getSession } from "@/lib/accounts/auth";
import { businessUrl, isBusinessHost, safeBusinessNext } from "@/lib/business-site";
import { HANDOFF_NONCE_COOKIE, newNonce, nonceHash, NONCE_TTL_SECONDS } from "@/lib/business/handoff";
import { hostOf } from "@/lib/domains/routing";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

/**
 * business.keplar.one/signin (step 1 of the handoff, src/lib/business/handoff.ts): already signed in here, go straight on
 * (unless `reauth=1` asks for a fresh sign-in); otherwise set this browser's nonce and ask keplar.one, where the Keplar
 * account signs in, for a ticket.
 */
export async function GET(req: Request) {
  if (!isBusinessHost(hostOf(req))) return new NextResponse("Not found.", { status: 404 });
  const params = new URL(req.url).searchParams;
  const next = safeBusinessNext(params.get("next"));
  // reauth=1 ("Please sign in again to continue", src/lib/accounts/reauth.ts): go through the handoff even when signed in.
  const reauth = params.get("reauth") === "1";
  if (!reauth && (await getSession(req.headers))) return NextResponse.redirect(businessUrl(next), 303);
  const nonce = newNonce();
  const res = NextResponse.redirect(`${siteUrl}/api/business/handoff?n=${nonceHash(nonce)}&next=${encodeURIComponent(next)}${reauth ? "&reauth=1" : ""}`, 303);
  res.cookies.set(HANDOFF_NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:", path: "/", maxAge: NONCE_TTL_SECONDS });
  res.headers.set("cache-control", "no-store");
  return res;
}
