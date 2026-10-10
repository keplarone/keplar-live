import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { hfPresign, hfUploadBytes, higgsfieldConfigured, HiggsfieldError } from "@/lib/higgsfield/client";
import { mintReference, REF_LIMITS, sniffRef, validateDeclared } from "@/lib/higgsfield/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reference upload, original bytes (never re-encoded).
 *   { mode: "inline",  kind, contentType, name, data: <base64>, durationSec? }   files up to 3 MB through this function
 *   { mode: "presign", kind, contentType, name, bytes, durationSec? }            larger files: returns a presigned URL; the browser PUTs
 *                                                                                straight to storage (the 4.5 MB request cap never applies)
 * Both return a signed `reference` the generate calls accept; nothing is charged here.
 */
export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`vid:ref:${ws.id}`, 30, 60, { shared: true });
    if (!higgsfieldConfigured()) throw new HttpError(503, "Reference uploads need Higgsfield, which isn't connected yet. Not configured.", "not_configured");
    const b = await body<Record<string, unknown>>(req);
    try {
      if (b.mode === "presign") {
        const spec = validateDeclared(b);
        const p = await hfPresign(spec.contentType);
        const reference = mintReference(ws.id, { ...spec, url: p.publicUrl });
        return json({ reference, upload: { url: p.uploadUrl, headers: p.headers, method: "PUT" } });
      }
      const spec = validateDeclared({ ...b, bytes: 1 });
      const data = typeof b.data === "string" ? Buffer.from(b.data, "base64") : Buffer.alloc(0);
      if (data.length === 0) throw new HttpError(400, "That file looks empty.", "bad_reference");
      if (data.length > REF_LIMITS.inlineMaxBytes) throw new HttpError(413, "That file is too large to send directly. It will be uploaded in the browser instead.", "use_presign");
      if (data.length > REF_LIMITS[spec.kind].maxBytes) throw new HttpError(413, "That file is too large.", "bad_reference");
      const real = sniffRef(data);
      if (!real || real !== spec.contentType) throw new HttpError(415, spec.kind === "image" ? "That file isn't a JPEG, PNG or WebP image." : "That file isn't an MP4 video.", "bad_reference");
      const url = await hfUploadBytes(data, real);
      return json({ reference: mintReference(ws.id, { ...spec, bytes: data.length, url }) });
    } catch (e) {
      if (e instanceof HiggsfieldError) throw new HttpError(502, "The upload service is busy. Try again in a moment.", "upload_failed");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
