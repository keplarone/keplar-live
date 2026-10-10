/**
 * POST /api/feedback  { kind, message, answers?, role?, contactOk?, email?, from?, website(honeypot) }
 * Open to signed-out visitors (feedback should be easy), so it is protected by: same-origin check (src/proxy.ts), per-IP and
 * per-account rate limits, a honeypot, strict length caps and plain-text storage. Never blocks anything else: cancelling a plan
 * or using the product does not depend on this route.
 */
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { storeFeedback, validateFeedback } from "@/lib/growth/feedback";
import { sendFeedbackEmail } from "@/lib/growth/feedback-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    await limitRequest(req, "feedback", { perIp: 8, perAccount: 10, accountId: ws.anonymous ? null : ws.id, windowSec: 3600 });
    const v = validateFeedback(await body<unknown>(req));
    if (!v.ok) throw new HttpError(400, v.error, "invalid");
    const row = await storeFeedback(v.value, { workspaceId: ws.anonymous ? null : ws.id, plan: ws.anonymous ? undefined : ws.plan });
    // Saved first (nothing is lost), then emailed to the team. A failed email never fails the request: the page shows a mailto fallback.
    const mail = await sendFeedbackEmail(row);
    if (!mail.ok) console.error(`[feedback] notification email failed for ${row.id}: ${mail.error}`);
    return json({ ok: true, emailed: mail.ok });
  } catch (e) {
    return errorResponse(e);
  }
}
