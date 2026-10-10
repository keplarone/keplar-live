/**
 * POST /api/keplar/reference { image: { dataUrl, width, height, name } } → { brief } — Create: a short design reading of an image (layout, palette,
 * type, mood, components) so the app builder can use it as inspiration. Signed in; Free uses free vision models only.
 * The image is validated like a chat attachment and dropped after the call.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { dailyLimit } from "@/lib/tools/access";
import { parseMedia } from "@/lib/orchestration/media";
import { describeReference } from "@/lib/attachments/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    if (Number(req.headers.get("content-length") ?? 0) > 3_000_000) throw new HttpError(413, "That image is too large.", "too_large");
    const ws = await currentWorkspace(req);
    await limitRequest(req, "keplar-reference", { perIp: 12, perAccount: 12, accountId: ws.id, windowSec: 60 });
    await dailyLimit(`reference:${ws.id}`, ws.plan === "free" ? 20 : 120, "image references");
    const b = (await req.json().catch(() => null)) as { image?: unknown } | null;
    const media = parseMedia({ images: [b?.image] });
    if (!media || typeof media === "string") throw new HttpError(400, typeof media === "string" ? media : "Attach an image.", "invalid");
    const brief = await describeReference(media.images[0].dataUrl, ws.plan, AbortSignal.any([req.signal, AbortSignal.timeout(40_000)]));
    return json({ brief }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
