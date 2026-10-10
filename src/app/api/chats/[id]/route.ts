/**
 * One saved chat.
 *   GET    -> the chat with its messages
 *   PUT    -> create or replace { title, projectId, createdAt, updatedAt, messages, specialistId? }
 *   PATCH  -> rename { title }, or move into / out of one of your projects { projectId | null }
 *   DELETE -> hard delete of this person's chat: messages, saved summary and the learning records of its answers (404 if it is not theirs)
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { minuteLimit } from "@/lib/tools/access";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { chats, MAX_CHATS } from "@/lib/memory/repo";
import { clean } from "@/lib/tools/json";
import { digests, renameDigest } from "@/lib/memory/digest";
import { deleteChat } from "@/lib/memory/delete-chat";
import { getProject } from "@/lib/projects/repo";
import { validSpecialistId } from "@/lib/personalize/specialists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 400_000;
type Ctx = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[A-Za-z0-9_-]{4,64}$/.test(id);

/** Drop anything heavy or private-by-design: media bytes and thumbnails never go to the server. */
function strip(messages: unknown[]): unknown[] {
  return messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    const { media: _media, ...rest } = m as Record<string, unknown>;
    void _media;
    return rest;
  });
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    const { id } = await ctx.params;
    const row = await chats().get(ws.id, id);
    if (!row) throw new HttpError(404, "Chat not found.", "not_found");
    return json({ chat: row });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    const { id } = await ctx.params;
    if (!validId(id)) throw new HttpError(400, "Bad chat id.");
    await minuteLimit(`chats:${ws.id}:write`, 90);
    const b = await body<{ title?: unknown; projectId?: unknown; createdAt?: unknown; updatedAt?: unknown; messages?: unknown; specialistId?: unknown }>(req);
    if (!Array.isArray(b.messages) || b.messages.length > 400) throw new HttpError(400, "Send the chat's messages.");
    const messages = strip(b.messages);
    if (JSON.stringify(messages).length > MAX_BYTES) throw new HttpError(413, "That chat is too long to save. Start a new one.", "too_large");
    const existing = await chats().get(ws.id, id);
    if (!existing && (await chats().list(ws.id)).length >= MAX_CHATS) throw new HttpError(409, `You have ${MAX_CHATS} saved chats. Delete some to save more.`, "limit");
    const t = Date.now();
    const row = {
      id, workspaceId: ws.id,
      title: clean(b.title, 120) || "New thread",
      projectId: typeof b.projectId === "string" ? b.projectId.slice(0, 64) : null,
      createdAt: Number.isFinite(Number(b.createdAt)) ? Number(b.createdAt) : t,
      updatedAt: Number.isFinite(Number(b.updatedAt)) ? Number(b.updatedAt) : t,
      messages,
      // Only the id travels (the specialist itself stays in Settings); the answer route re-checks it belongs to this workspace.
      specialistId: validSpecialistId(b.specialistId) ? b.specialistId : null,
    };
    if (existing) await chats().update(ws.id, id, row);
    else await chats().insert(row);
    // Keep the chat's saved summary titled like the chat (it may have been renamed here).
    const dg = await digests().get(ws.id, id).catch(() => null);
    if (dg && dg.title !== row.title) await renameDigest(ws.id, id, row.title);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    const { id } = await ctx.params;
    const b = await body<{ title?: unknown; projectId?: unknown }>(req);
    // Moving a chat into a project (or out of it, projectId null). The project must be one of this person's.
    if (b.title === undefined && b.projectId !== undefined) {
      if (b.projectId !== null && !(await getProject(ws.id, String(b.projectId)))) throw new HttpError(404, "Project not found.", "not_found");
      if (!(await chats().update(ws.id, id, { projectId: b.projectId === null ? null : String(b.projectId) }))) throw new HttpError(404, "Chat not found.", "not_found");
      return json({ ok: true, projectId: b.projectId });
    }
    const title = clean(b.title, 120);
    if (!title) throw new HttpError(400, "Give the chat a name.");
    if (!(await chats().update(ws.id, id, { title }))) throw new HttpError(404, "Chat not found.", "not_found");
    await renameDigest(ws.id, id, title);
    return json({ ok: true, title });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    const { id } = await ctx.params;
    if (!validId(id)) throw new HttpError(400, "Bad chat id.");
    if (!(await deleteChat(ws.id, id))) throw new HttpError(404, "Chat not found.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
