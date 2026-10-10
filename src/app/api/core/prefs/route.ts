/**
 * GET   /api/core/prefs              { optOut, brevity }
 * PATCH /api/core/prefs { optOut }   opt out of (or back into) outcome tracking for Keplar Core's learning.
 * Signed in only. Opting out also stops the per-person preference memory from being updated.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getPrefs, savePrefs } from "@/lib/core/selfdev/repo";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const p = await getPrefs(ws.id);
    return json({ optOut: p.optOut, brevity: p.brevity });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req);
    await limitRequest(req, "core-prefs", { perIp: 60, perAccount: 60, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ optOut?: unknown; resetBrevity?: unknown }>(req);
    if (typeof b.optOut !== "boolean" && b.resetBrevity !== true) throw new HttpError(400, "optOut must be true or false.", "invalid");
    const p = await savePrefs(ws.id, { ...(typeof b.optOut === "boolean" ? { optOut: b.optOut } : {}), ...(b.resetBrevity === true ? { brevity: 0 } : {}) });
    return json({ optOut: p.optOut, brevity: p.brevity });
  } catch (e) {
    return errorResponse(e);
  }
}
