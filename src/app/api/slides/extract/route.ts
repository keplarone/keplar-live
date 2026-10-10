/** Read an attached text/PDF file for a deck (Plus/Pro). Returns plain text; nothing is stored. */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { slidesWorkspace, dailyLimit } from "@/lib/tools/access";
import { slidesLimitsFor } from "@/lib/tools/limits";
import { DocError, readUpload } from "@/lib/documents/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ws = await slidesWorkspace(req);
    const L = slidesLimitsFor(ws.plan)!;
    if (Number(req.headers.get("content-length") ?? 0) > L.maxUploadBytes + 100_000) throw new HttpError(413, "That file is too large.", "too_large");
    await dailyLimit(`slides:${ws.id}:extract`, 60, "file uploads");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new DocError("no_file", "Attach a PDF or text file.", 400);
    const doc = await readUpload({ bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, type: file.type }, { maxBytes: L.maxUploadBytes, maxPages: L.maxUploadPages, maxChars: L.maxMaterialChars });
    return json({ name: file.name.slice(0, 120), text: doc.pages.join("\n\n"), pages: doc.numPages, truncated: doc.truncated });
  } catch (e) {
    if (e instanceof DocError) return json({ error: e.message, code: e.code }, { status: e.status });
    return errorResponse(e);
  }
}
