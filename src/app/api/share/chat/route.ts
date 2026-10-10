/**
 * Shared chat links (whole conversations, redacted). Signed-in owner only; same-origin for writes; rate limited.
 *   GET    -> { links: [{ token, url, title, turns, hidden, createdAt, expiresAt, views }] }
 *   POST   { consent: true, title, turns: [{ role, text }], redact: { auto, terms } } -> { token, url, expiresAt, hidden }
 *   DELETE { token } -> revoke (the page 404s at once)
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { site } from "@/lib/site";
import { buildChatSnapshot, ChatShareLimitError, createChatShare, liveChatSharesOf, revokeChatShare, validChatToken } from "@/lib/growth/chat-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner(req: Request, write: boolean) {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req);
  if (!ws.userId || ws.anonymous) throw new HttpError(401, "Sign in to share a chat.", "unauthenticated");
  await limitRequest(req, "share-chat", { perIp: 60, perAccount: 60, accountId: ws.id, windowSec: 600 });
  return ws;
}

export async function GET(req: Request) {
  try {
    const ws = await owner(req, false);
    const list = await liveChatSharesOf(ws.id);
    return json({ links: list.map((r) => ({ token: r.token, url: `${site.url}/c/${r.token}`, title: r.title, turns: r.turns.length, hidden: r.hidden, createdAt: r.createdAt, expiresAt: r.expiresAt, views: r.views })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await owner(req, true);
    const b = await body<Record<string, unknown>>(req);
    if (b.consent !== true) throw new HttpError(400, "Confirm that you want to create a link.", "consent_required");
    const snap = buildChatSnapshot(b);
    if (typeof snap === "string") throw new HttpError(400, snap, "invalid");
    try {
      const row = await createChatShare(ws.id, snap);
      return json({ token: row.token, url: `${site.url}/c/${row.token}`, expiresAt: row.expiresAt, hidden: row.hidden }, { status: 201 });
    } catch (e) {
      if (e instanceof ChatShareLimitError) throw new HttpError(429, e.message, "share_limit");
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const ws = await owner(req, true);
    const b = await body<{ token?: unknown }>(req);
    if (!validChatToken(b.token)) throw new HttpError(400, "Unknown link.", "invalid");
    if (!(await revokeChatShare(ws.id, b.token))) throw new HttpError(404, "That link doesn't exist or is already revoked.", "not_found");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
