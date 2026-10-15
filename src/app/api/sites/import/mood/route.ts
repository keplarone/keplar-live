/** Read the dominant colors of one reference image for the mood board. The image is not stored. Body = raw image bytes. */
import { errorResponse, HttpError, json, readBytes } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { MoodError, paletteOf } from "@/lib/site-builder/mood";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`sb:mood:${ws.id}`, 20, 60, { shared: true });
    if (Number(req.headers.get("content-length") ?? 0) > 4_700_000) throw new HttpError(413, "That image is too large (up to 4 MB).", "too_large");
    const read = await readBytes(req, 4_700_000);
    const bytes = read === null ? Buffer.alloc(4_700_001) : Buffer.from(read); // over the cap: the 413 below (nothing more was read)
    if (!bytes.length || bytes.length > 4_700_000) throw new HttpError(bytes.length ? 413 : 400, bytes.length ? "That image is too large (up to 4 MB)." : "No image was received.");
    try {
      return json({ colors: await paletteOf(bytes) });
    } catch (e) {
      if (e instanceof MoodError) throw new HttpError(400, e.message, "bad_image");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
