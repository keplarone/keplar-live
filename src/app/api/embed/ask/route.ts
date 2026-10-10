/**
 * POST /api/embed/ask — public Ask for a framed widget.
 * Body: { widgetId, question, history?, parent? }. Metered to the publisher.
 * CORS open (iframe same-origin for typical embeds; script callers may POST cross-origin).
 */
import { parseEmbedAsk, runEmbedAsk } from "@/lib/embed/ask";
import { EmbedError, recordEmbedUse, resolveWidgetForAsk } from "@/lib/embed/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "600",
  "cache-control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function fail(e: unknown): Response {
  if (e instanceof EmbedError) {
    return Response.json(
      { error: { code: e.code, message: e.message, ...(e.retryAfterSec ? { retry_after: e.retryAfterSec } : {}) } },
      { status: e.status, headers: { ...CORS, ...(e.retryAfterSec ? { "retry-after": String(e.retryAfterSec) } : {}) } },
    );
  }
  return Response.json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500, headers: CORS });
}

export async function POST(req: Request) {
  try {
    let raw: unknown;
    try {
      const text = await req.text();
      if (text.length > 40_000) throw new EmbedError(413, "too_large", "The request body is too large.");
      raw = JSON.parse(text);
    } catch (e) {
      if (e instanceof EmbedError) throw e;
      throw new EmbedError(400, "invalid_request", "The body must be valid JSON.");
    }
    const b = raw as Record<string, unknown>;
    const widgetId = typeof b.widgetId === "string" ? b.widgetId : "";
    const grant = typeof b.grant === "string" ? b.grant : null;
    const { widget, ws } = await resolveWidgetForAsk(req, widgetId, grant);
    const input = parseEmbedAsk(raw);
    const result = await runEmbedAsk(ws, widget.models, input, req.headers, req.signal);
    await recordEmbedUse(widget, result.credits);
    return Response.json(
      {
        object: "answer",
        answer: result.answer,
        agreement: result.agreement,
        models: result.models,
        usage: { credits: result.credits },
        powered_by: "Keplar",
      },
      { headers: CORS },
    );
  } catch (e) {
    return fail(e);
  }
}
