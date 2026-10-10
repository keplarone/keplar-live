import { currentWorkspace } from "@/lib/create/platform/workspace";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { completeOAuth } from "@/lib/mcp/gateway";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const base = () => (process.env.BETTER_AUTH_URL || siteUrl).replace(/\/$/, "");
/** Always a fixed same-origin page with a fixed vocabulary: nothing from the query string is reflected. */
const back = (reason: string, serverId?: string) =>
  new Response(null, { status: 302, headers: { location: `${base()}/app?mcp_oauth=${reason}${serverId && /^[\w-]{1,64}$/.test(serverId) ? `&server=${serverId}` : ""}`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });

/**
 * OAuth redirect target. Needs the signed-in session of the user who started the sign-in (the `state` is bound to their workspace,
 * single use, 10 minutes). The authorization code is exchanged here with the PKCE verifier; tokens never reach the browser.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  let ws;
  try {
    ws = await currentWorkspace(req);
    await rateLimit(`mcp:oauthcb:${ws.id}`, 20, 60, { shared: true });
  } catch {
    return new Response(null, { status: 302, headers: { location: `${base()}/signin?next=${encodeURIComponent("/app")}`, "cache-control": "no-store" } });
  }
  try {
    const r = await completeOAuth(ws, { state: u.searchParams.get("state"), code: u.searchParams.get("code"), error: u.searchParams.get("error"), iss: u.searchParams.get("iss") });
    return back(r.ok ? "ok" : r.reason, r.serverId);
  } catch {
    return back("failed");
  }
}
