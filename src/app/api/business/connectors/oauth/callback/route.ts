import { currentWorkspace } from "@/lib/create/platform/workspace";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { baseUrl, completeAuthorization, verifyState } from "@/lib/business/oauth-connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Fixed same-origin target with a fixed vocabulary (conn_ok_<id> / conn_no_<id> / conn_no): nothing from the query string is reflected. */
const back = (result: string) => new Response(null, { status: 302, headers: { location: `${baseUrl()}/app?mcp_oauth=${result}`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });

export async function GET(req: Request) {
  const u = new URL(req.url);
  let ws;
  try {
    ws = await currentWorkspace(req);
    await rateLimit(`biz:oauthcb:${ws.id}`, 20, 60, { shared: true });
  } catch {
    // A browser navigation gets sent to sign-in; anything else (scripts, scanners) gets a plain 401.
    if (!(req.headers.get("accept") ?? "").includes("text/html")) return new Response(JSON.stringify({ error: "Sign in first." }), { status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    return new Response(null, { status: 302, headers: { location: `${baseUrl()}/signin?next=${encodeURIComponent("/app")}`, "cache-control": "no-store" } });
  }
  const st = verifyState(u.searchParams.get("state") ?? "");
  if (!st || st.workspaceId !== ws.id) return back("conn_no");
  if (u.searchParams.get("error") || !u.searchParams.get("code")) return back(`conn_no_${st.connector}`);
  try {
    await completeAuthorization(ws.id, st.connector, u.searchParams.get("code")!);
    return back(`conn_ok_${st.connector}`);
  } catch {
    return back(`conn_no_${st.connector}`);
  }
}
