/**
 * Saved chat history for signed-in users (server-side, per user).
 *   GET -> the list (id, title, projectId, times, no messages)
 *   DELETE { confirm: "DELETE" } -> delete every one of this person's chats (typed confirmation required)
 * Signed out is 401: signed-out chats stay in the browser only.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { deleteAllChats } from "@/lib/memory/delete-chat";
import { isSameOrigin } from "@/lib/security/origin";
import { chats } from "@/lib/memory/repo";
import { assertSameAccount } from "@/lib/accounts/account-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    // Only the sidebar's fields: the messages stay in the database (a full list was every message of up to 200 chats).
    const rows = (await chats().listFields(ws.id, ["title", "projectId", "createdAt", "updatedAt", "specialistId"])).sort((a, b) => b.updatedAt - a.updatedAt);
    return json({ chats: rows.map((c) => ({ id: c.id, title: c.title, projectId: c.projectId, createdAt: c.createdAt, updatedAt: c.updatedAt, ...(c.specialistId ? { specialistId: c.specialistId } : {}) })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    const b = await body<{ confirm?: unknown }>(req);
    if (b.confirm !== "DELETE") throw new HttpError(400, "Type DELETE to confirm.", "confirm_required");
    return json({ ok: true, deleted: await deleteAllChats(ws.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
