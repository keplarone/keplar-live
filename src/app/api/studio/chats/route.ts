import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { isSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { deleteChat, getChat, listChats, putChat, STUDIO_CHAT_LIMITS } from "@/lib/studio/chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Roblox Studio mode's saved chats on the account (src/lib/studio/chats.ts), one per game, so a conversation follows the
 * person to another computer. Signed-in owner only; writes same-origin and rate limited.
 *   GET    ?key=<game key>   -> { chat: { savedAt, session } | null }
 *   GET    (no key)          -> { chats: [{ key, name, savedAt }] }
 *   PUT    { key, session }  -> { savedAt, stale }   (stale: the account already holds a newer save from another device)
 *   DELETE ?key=<game key>   -> { removed }
 */
async function owner(req: Request, write: boolean) {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req); // 401 when signed out
  assertSameAccount(req, ws.userId);
  if (write) await rateLimit(`studio-chats:${ws.id}`, 40, 60, { shared: true });
  return ws;
}

const NO_STORE = { headers: { "cache-control": "no-store" } };

export async function GET(req: Request) {
  try {
    const ws = await owner(req, false);
    const key = new URL(req.url).searchParams.get("key");
    if (key === null) return json({ chats: await listChats(ws.id) }, NO_STORE);
    return json({ chat: await getChat(ws.id, key) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > STUDIO_CHAT_LIMITS.maxChars + 4096) throw new HttpError(413, "This chat is too long to sync. Start a new session for this game.", "too_large");
    const ws = await owner(req, true);
    const b = await body<{ key?: unknown; session?: unknown }>(req);
    return json(await putChat(ws.id, b.key, b.session), NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ws = await owner(req, true);
    return json({ removed: await deleteChat(ws.id, new URL(req.url).searchParams.get("key")) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}
