import { errorResponse } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { robloxOAuthConfigured, spaceSession } from "@/lib/space-studio/account";
import { planLink } from "@/lib/space-studio/core";
import { appUrl, clearLinkCookie, finishLink, readLinkState } from "@/lib/space-studio/roblox-oauth";
import { commitLink, indexReader, loadIdentities } from "@/lib/space-studio/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (q: string) => new Response(null, { status: 302, headers: { location: appUrl(q), "set-cookie": clearLinkCookie(), "cache-control": "no-store" } });

/**
 * Roblox OAuth callback -> 302 /space-studio/app?view=account&linked=roblox | &link_error=<code>. Always a redirect (signed-out
 * callers included), changes nothing unless the same signed-in account that started the link comes back with a valid state.
 * Roblox tokens are used once to read userinfo and never stored or logged.
 */
export async function GET(req: Request) {
  try {
    await limitRequest(req, "space_roblox_link", { perIp: 20 });
    const url = new URL(req.url);
    if (!robloxOAuthConfigured()) return back("link_error=roblox_not_configured");
    const s = await spaceSession(req);
    if (!s) return back("link_error=signed_out");
    if (url.searchParams.get("error")) return back(`link_error=${url.searchParams.get("error") === "access_denied" ? "access_denied" : "roblox_error"}`);
    const ws = await currentWorkspace(req);
    const st = readLinkState(req, ws.id, url.searchParams.get("state"));
    const code = url.searchParams.get("code");
    if (!st || !code || code.length > 2048) return back("link_error=state_mismatch");
    let user;
    try {
      user = await finishLink(code, st, { clientId: process.env.ROBLOX_OAUTH_CLIENT_ID!.trim(), clientSecret: process.env.ROBLOX_OAUTH_CLIENT_SECRET!.trim() });
    } catch (e) {
      const c = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : "roblox_error";
      console.warn(`[space-studio] roblox link failed: ${c}`);
      return back(`link_error=${c}`);
    }
    const now = Date.now();
    const incoming = { provider: "roblox" as const, subject: user.subject, label: user.label, linkedAt: new Date(now).toISOString(), canSignIn: false };
    const current = await loadIdentities(ws.id);
    const plan = await planLink(ws.id, current, incoming, indexReader, s.authAt, now);
    if (!plan.ok) return back(`link_error=${plan.code}`);
    const done = await commitLink(ws.id, incoming, plan.identities);
    if (!done.ok) return back(`link_error=${done.code}`);
    return back("linked=roblox");
  } catch (e) {
    return errorResponse(e);
  }
}
