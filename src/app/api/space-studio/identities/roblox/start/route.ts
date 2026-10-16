import { errorResponse, HttpError } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { robloxOAuthConfigured, spaceSession } from "@/lib/space-studio/account";
import { recentlyAuthenticated } from "@/lib/space-studio/core";
import { appUrl, beginLink } from "@/lib/space-studio/roblox-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET -> 302 to Roblox OAuth (PKCE S256). Signed-in only (401). 503 "roblox_not_configured" without ROBLOX_OAUTH_CLIENT_ID/SECRET.
 * A sign-in older than 10 minutes is sent back with link_error=reauth_required before anything is started.
 */
export async function GET(req: Request) {
  try {
    await limitRequest(req, "space_roblox_link", { perIp: 20 });
    const s = await spaceSession(req);
    if (!s) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
    if (!robloxOAuthConfigured()) throw new HttpError(503, "Roblox linking isn't set up on this server yet.", "roblox_not_configured");
    if (!recentlyAuthenticated(s.authAt, Date.now())) return Response.redirect(appUrl("link_error=reauth_required"), 302);
    const ws = await currentWorkspace(req);
    let started: ReturnType<typeof beginLink>;
    try {
      started = beginLink(ws.id, process.env.ROBLOX_OAUTH_CLIENT_ID!.trim());
    } catch {
      throw new HttpError(503, "Roblox linking isn't available right now.", "roblox_not_configured");
    }
    return new Response(null, { status: 302, headers: { location: started.url, "set-cookie": started.cookie, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
