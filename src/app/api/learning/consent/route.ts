/**
 * GET /api/learning/consent  -> { shareFailures, cases }       PATCH { shareFailures: boolean }   DELETE (erase my saved failed questions)
 * "Help improve Keplar": off until the person turns it on. Signed-in only. Turning it off erases everything saved under it.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { eraseCases, listCases, setShareFailures, shareFailures } from "@/lib/learning/repo";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function who(req: Request) {
  const ws = await currentWorkspace(req, { allowAnonymous: true });
  if (ws.anonymous) throw new HttpError(401, "Sign in to manage this.", "unauthenticated");
  return ws;
}

export async function GET(req: Request) {
  try {
    const ws = await who(req);
    const [on, cases] = await Promise.all([shareFailures(ws.id), listCases(ws.id)]);
    return json({ shareFailures: on, cases: cases.map((c) => ({ id: c.id, at: c.at, category: c.category, reason: c.reason, text: c.text })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await who(req);
    const b = await body<{ shareFailures?: unknown }>(req);
    if (typeof b.shareFailures !== "boolean") throw new HttpError(400, "shareFailures must be true or false.", "invalid");
    return json({ shareFailures: await setShareFailures(ws.id, b.shareFailures) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await who(req);
    return json({ erased: await eraseCases(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
