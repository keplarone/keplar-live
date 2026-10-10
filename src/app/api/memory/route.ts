/**
 * Memory settings and items for the signed-in user.
 *   GET   -> { enabled, items }
 *   PATCH -> { enabled: boolean }
 *   POST  -> { text } add a note yourself
 * Signed out is 401 (no memory without an account).
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { minuteLimit } from "@/lib/tools/access";
import { cleanFact } from "@/lib/memory/facts";
import { addItems, listItems, memoryEnabled, setMemoryEnabled } from "@/lib/memory/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    return json({ enabled: await memoryEnabled(ws.id), items: (await listItems(ws.id)).map(({ id, text, kind, source, createdAt }) => ({ id, text, kind, source, createdAt })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await minuteLimit(`memory:${ws.id}:write`, 30);
    const b = await body<{ enabled?: unknown }>(req);
    if (typeof b.enabled !== "boolean") throw new HttpError(400, "Send enabled: true or false.");
    return json({ enabled: await setMemoryEnabled(ws.id, b.enabled) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await minuteLimit(`memory:${ws.id}:write`, 30);
    const b = await body<{ text?: unknown }>(req);
    const text = cleanFact(b.text);
    if (!text) throw new HttpError(400, "That can't be saved. Keep it to a short personal fact, without links, instructions or sensitive details.");
    const [item] = await addItems(ws.id, [{ text, kind: "fact" }], "user");
    return json({ item: item ? { id: item.id, text: item.text, kind: item.kind, source: item.source, createdAt: item.createdAt } : null });
  } catch (e) {
    return errorResponse(e);
  }
}
