/**
 * GET /api/faq/consent -> { count }      PATCH { count: boolean }
 * "Count my questions": off until the person turns it on. Signed-in only. Turning it off removes the person from every count.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { faqCounting, setFaqCounting } from "@/lib/faq/repo";
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
    return json({ count: await faqCounting((await who(req)).id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await who(req);
    const b = await body<{ count?: unknown }>(req);
    if (typeof b.count !== "boolean") throw new HttpError(400, "count must be true or false.", "invalid");
    return json({ count: await setFaqCounting(ws.id, b.count) });
  } catch (e) {
    return errorResponse(e);
  }
}
