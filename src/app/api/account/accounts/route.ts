/**
 * Accounts signed in on this device.
 *   GET                              -> { active, accounts: [{ slot, email, name, expired }] } (no tokens, ever)
 *   POST { action: "switch", slot }  -> make a saved account the active one, no re-login (409 "expired" when it was signed out)
 *   POST { action: "signout" }       -> sign out the active account only (another saved one becomes active)
 *   POST { action: "signout_all" }   -> sign out every account on this device
 *   POST { action: "remove", slot }  -> forget one saved account
 * Same-origin only (CSRF), rate limited, never cached.
 */
import { listAccounts, removeSaved, signOutAll, signOutCurrent, switchTo, type Result } from "@/lib/accounts/multi-api";
import { body, errorResponse, HttpError } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(r: Result) {
  const headers = new Headers({ "cache-control": "no-store", "content-type": "application/json" });
  for (const c of r.cookies) headers.append("set-cookie", c);
  return new Response(JSON.stringify(r.body), { status: r.status, headers });
}

export async function GET(req: Request) {
  try {
    await limitRequest(req, "accounts_list", { perIp: 120 });
    return respond(await listAccounts(req));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await limitRequest(req, "accounts_change", { perIp: 40 });
    const { action, slot } = await body<{ action?: unknown; slot?: unknown }>(req);
    if (action === "switch") return respond(await switchTo(req, slot));
    if (action === "signout") return respond(await signOutCurrent(req));
    if (action === "signout_all") return respond(await signOutAll(req));
    if (action === "remove") return respond(await removeSaved(req, slot));
    throw new HttpError(400, "Unknown action.", "bad_request");
  } catch (e) {
    return errorResponse(e);
  }
}
