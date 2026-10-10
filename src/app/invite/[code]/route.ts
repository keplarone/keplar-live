import { CODE_RE, referralConfig } from "@/lib/referrals/config";
import { profileByCode } from "@/lib/referrals/repo";
import { inviteCookies, withCookies } from "@/lib/referrals/http";
import { minuteLimit } from "@/lib/tools/access";
import { clientIp } from "@/lib/referrals/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A shared invite link: remember the code in this browser (30 days) and go to sign-up. Nothing is rewarded here; the reward is decided
 * when the new account is signed in with a verified email (POST /api/referrals/redeem). Unknown or malformed codes just go to sign-up.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const code = raw.toLowerCase();
  const to = (q: string, cookies: string[] = []) => withCookies(new Response(null, { status: 303, headers: { location: new URL(`/signup${q}`, req.url).toString(), "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" } }), cookies);
  if (!CODE_RE.test(code) || !referralConfig().enabled) return to("");
  try {
    await minuteLimit(`invite:${clientIp(req) || "anon"}`, 60);
    if (!(await profileByCode(code))) return to("");
  } catch {
    return to("");
  }
  return to("?invited=1", inviteCookies(req, code));
}
