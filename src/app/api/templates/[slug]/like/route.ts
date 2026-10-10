/**
 * POST /api/templates/<slug>/like — toggle a like on a community template (signed in, same-origin, rate limited).
 * GET returns { liked } for the current workspace.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { likedByMe, toggleTemplateLike } from "@/lib/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req);
    if (!ws.userId || ws.anonymous) throw new HttpError(401, "Sign in to like a template.", "unauthenticated");
    await limitRequest(req, "template-like", { perIp: 60, perAccount: 60, accountId: ws.id, windowSec: 600 });
    const { slug } = await params;
    return json(await toggleTemplateLike(ws, slug));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    if (!ws.userId || ws.anonymous) return json({ liked: false });
    const { slug } = await params;
    return json({ liked: await likedByMe(ws, slug) });
  } catch (e) {
    return errorResponse(e);
  }
}
