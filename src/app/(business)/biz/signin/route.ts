import { NextResponse } from "next/server";
import { getSession } from "@/lib/accounts/auth";
import { businessUrl, isBusinessHost, safeBusinessNext } from "@/lib/business-site";
import { HANDOFF_NONCE_COOKIE, newNonce, nonceHash, NONCE_TTL_SECONDS } from "@/lib/business/handoff";
import { hostOf } from "@/lib/domains/routing";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

/**
 * business.keplar.one/signin (step 1 of the handoff, src/lib/business/handoff.ts): already signed in here, go straight on;
 * otherwise set this browser's nonce and ask keplar.one, where the Keplar account signs in, for a ticket.
 */
export async function GET(req: Request) {
  if (!isBusinessHost(hostOf(req))) return new NextResponse("Not found.", { status: 404 });
  const next = safeBusinessNext(new URL(req.url).searchParams.get("next"));
  if (await getSession(req.headers)) return NextResponse.redirect(businessUrl(next), 303);
  const nonce = newNonce();
  const res = NextResponse.redirect(`${siteUrl}/api/business/handoff?n=${nonceHash(nonce)}&next=${encodeURIComponent(next)}`, 303);
  res.cookies.set(HANDOFF_NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:", path: "/", maxAge: NONCE_TTL_SECONDS });
  res.headers.set("cache-control", "no-store");
  return res;
}
