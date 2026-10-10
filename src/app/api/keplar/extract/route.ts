/**
 * Read an attached file for a chat message or a Create reference: PDF, Word, PowerPoint, Excel, CSV/TSV, JSON, RTF, text,
 * code, notebooks and .zip code projects (src/lib/attachments/extract.ts). Signed-in accounts only; the type is decided by
 * the bytes; size, entries, characters and time are capped; data files come back with exact statistics. Nothing is stored.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { dailyLimit } from "@/lib/tools/access";
import { DocError } from "@/lib/documents/ingest";
import { DOC_LIMITS } from "@/lib/documents/chat-docs";
import { limitsForPlan } from "@/lib/attachments/kinds";
import { extractFile } from "@/lib/attachments/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req); // 401 when signed out
    const L = limitsForPlan(ws.plan);
    if (Number(req.headers.get("content-length") ?? 0) > L.docBytes + 200_000) throw new HttpError(413, `That file is too large. Your plan reads files up to ${Math.round((L.docBytes / 1048576) * 10) / 10} MB.`, "too_large");
    await dailyLimit(`chat:${ws.id}:extract`, (ws.plan === "free" ? DOC_LIMITS.free : DOC_LIMITS.paid).perDay * 2, "document uploads");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new DocError("no_file", "Attach a file to read.", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const x = await extractFile({ bytes, name: file.name, type: file.type }, L);
    return json({ name: file.name.slice(0, 120), kind: x.kind, title: x.title, text: x.text, summary: x.summary, pages: x.pages, truncated: x.truncated, notes: x.notes ?? [] });
  } catch (e) {
    if (e instanceof DocError) return json({ error: e.message, code: e.code }, { status: e.status });
    return errorResponse(e);
  }
}
