/**
 * POST /api/core/signal  { answerId, kind: "confused" | "edit" | "complete" }
 * Outcome signals Keplar Core learns from besides thumbs/copy/regenerate/correct (those arrive via /api/learning/signal):
 * the next message reads as confusion, the person edited their question, or they moved on satisfied. Content-free; respects
 * the person's opt-out (Settings). Never reveals whether the turn was known.
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { noteSignal } from "@/lib/core/selfdev/outcomes";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["confused", "edit", "complete"]);

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    await limitRequest(req, "core-signal", { perIp: 120, perAccount: 120, accountId: ws.anonymous ? null : ws.id, windowSec: 3600 });
    const b = await body<{ answerId?: unknown; kind?: unknown }>(req);
    if (typeof b.answerId !== "string" || !b.answerId || typeof b.kind !== "string" || !KINDS.has(b.kind)) throw new HttpError(400, "answerId and a known kind are required.", "invalid");
    await noteSignal({ workspaceId: ws.id, anonymous: ws.anonymous, answerId: b.answerId.slice(0, 80), kind: b.kind });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
