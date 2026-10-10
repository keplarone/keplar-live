/**
 * POST /api/learning/signal  { answerId, kind: "up"|"down"|"regenerate"|"copy"|"correct", text? }
 * What the person did with an answer. Counted once per turn and kind; used only for the router's scoreboard. `text` (the question
 * that went wrong) is kept only for signed-in people who turned on "Help improve Keplar" in Settings, redacted and shortened;
 * otherwise it is discarded unread. Never blocks anything and never reveals whether the turn was known.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { recordSignal } from "@/lib/learning/record";
import { noteSignal as noteCoreSignal } from "@/lib/core/selfdev/outcomes";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    await limitRequest(req, "learning-signal", { perIp: 120, perAccount: 120, accountId: ws.anonymous ? null : ws.id, windowSec: 3600 });
    const b = await body<{ answerId?: unknown; kind?: unknown; text?: unknown }>(req);
    if (typeof b.answerId !== "string" || !b.answerId || typeof b.kind !== "string") throw new HttpError(400, "answerId and kind are required.", "invalid");
    const r = await recordSignal({ workspaceId: ws.id, anonymous: ws.anonymous, answerId: b.answerId, kind: b.kind, text: typeof b.text === "string" ? b.text.slice(0, 600) : undefined });
    if (r.reason === "bad_kind") throw new HttpError(400, "Unknown signal.", "invalid");
    // Keplar Core's outcome tracking (variants' credit, per-person preference); respects its own opt-out. Best effort.
    await noteCoreSignal({ workspaceId: ws.id, anonymous: ws.anonymous, answerId: b.answerId.slice(0, 80), kind: b.kind }).catch(() => false);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
