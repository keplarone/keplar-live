/**
 * A project's files (text read by /api/keplar/extract; the original file is not stored).
 *   GET -> { files }   POST { name, text, truncated? } -> add   DELETE { confirm: "DELETE" } -> remove all files
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { confirmed, projectOwner } from "@/lib/projects/api";
import { addFile, clearFiles, listFiles, requireProject } from "@/lib/projects/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const pub = (f: { id: string; name: string; chars: number; truncated: boolean; createdAt: string }) => ({ id: f.id, name: f.name, chars: f.chars, truncated: f.truncated, createdAt: f.createdAt });

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req);
    const { id } = await ctx.params;
    await requireProject(ws.id, id);
    return json({ files: (await listFiles(ws.id, id)).map(pub) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id } = await ctx.params;
    const b = await body<{ name?: unknown; text?: unknown; truncated?: unknown }>(req);
    return json({ file: pub(await addFile(ws.id, id, b)) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await projectOwner(req, true);
    const { id } = await ctx.params;
    await requireProject(ws.id, id);
    const b = await body<{ confirm?: unknown }>(req);
    if (!confirmed(b.confirm)) throw new HttpError(400, "Type DELETE to confirm.", "confirm_required");
    return json({ ok: true, deleted: await clearFiles(ws.id, id) });
  } catch (e) {
    return errorResponse(e);
  }
}
