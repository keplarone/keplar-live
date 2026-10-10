/** Erase all memory (hard delete), optionally with all saved chat history. Body: { confirm: true, chats?: boolean }. */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { eraseAllMemory } from "@/lib/memory/repo";
import { deleteAllChats } from "@/lib/memory/delete-chat";
import { eraseAllDigests } from "@/lib/memory/digest";
import { eraseAllProjectNotes } from "@/lib/projects/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const b = await body<{ confirm?: unknown; chats?: unknown }>(req);
    if (b.confirm !== true) throw new HttpError(400, "Confirm to erase.", "confirm_required");
    const memory = await eraseAllMemory(ws.id);
    const summaries = await eraseAllDigests(ws.id); // the saved summaries of past chats are part of memory
    const projectNotes = await eraseAllProjectNotes(ws.id); // notes saved inside projects are memory too
    const chats = b.chats === true ? await deleteAllChats(ws.id) : 0;
    return json({ ok: true, memory, chats, summaries, projectNotes });
  } catch (e) {
    return errorResponse(e);
  }
}
