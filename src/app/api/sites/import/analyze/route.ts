/** Optional: read an uploaded product photo with a vision model to suggest name, description, features and alt text. */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { analyzeAsset } from "@/lib/site-builder/product/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`sb:import:vision:${ws.id}`, 6, 60, { shared: true });
    const input = await body<{ assetId?: string }>(req);
    const id = String(input.assetId ?? "");
    if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(400, "Choose a photo to read.", "bad_request");
    return json(await analyzeAsset(ws, id));
  } catch (e) {
    return errorResponse(e);
  }
}
