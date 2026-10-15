/**
 * POST /api/v1/ask (BETA). Bearer key with the "ask" scope. Returns the final answer plus a disagreement summary.
 * `"stream": true` (or `Accept: text/event-stream`) returns Server-Sent Events: progress, delta (preview only), answer, done / error.
 * The same credits, rolling windows and spend caps as the app apply; an answer is metered once. Nothing is stored (no memory, no chat).
 */
import { readText } from "@/lib/create/platform/http";
import { authenticateKey, recordKeyUse, ApiError } from "@/lib/api/keys";
import { parseAsk, runAsk, type PublicEvent } from "@/lib/api/ask";
import { CORS, preflight, v1Failure, v1Json } from "@/lib/api/http";
import { v1Error } from "@/lib/api/format";
import { API_ASK_LIMITS } from "@/lib/api/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const OPTIONS = preflight;

export async function POST(req: Request) {
  try {
    const { key, ws } = await authenticateKey(req, "ask");
    let raw: unknown;
    try {
      const text = await readText(req, API_ASK_LIMITS.bodyChars * 4);
      if (text === null || text.length > API_ASK_LIMITS.bodyChars) throw new ApiError(413, "too_large", "The request body is too large.");
      raw = JSON.parse(text);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(400, "invalid_request", "The body must be valid JSON.");
    }
    const input = parseAsk(raw);
    const wantsStream = (raw as { stream?: unknown }).stream === true || (req.headers.get("accept") ?? "").includes("text/event-stream");

    if (!wantsStream) {
      let answer: PublicEvent | null = null;
      for await (const ev of runAsk(ws, input, req.headers, req.signal)) if (ev.event === "answer") answer = ev;
      if (!answer || answer.event !== "answer") throw new ApiError(502, "no_response", "No answer was produced. Nothing was charged.");
      await recordKeyUse(key, answer.data.usage.credits);
      return v1Json(answer.data);
    }

    // Pull the first event before answering, so refusals (limits, plan, bad input) come back as a real HTTP status, not an SSE error.
    const gen = runAsk(ws, input, req.headers, req.signal);
    const first = await gen.next();
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        let credits = 0;
        try {
          for (let r = first; !r.done; r = await gen.next()) {
            const ev = r.value;
            if (ev.event === "answer") credits = ev.data.usage.credits;
            send(ev.event, ev.data);
          }
          send("done", {});
        } catch (e) {
          const err = e instanceof ApiError ? e : new ApiError(500, "internal", "Something went wrong.");
          send("error", v1Error(err.code, err.message, err.retryAfterSec).error);
        } finally {
          await recordKeyUse(key, credits);
          try { controller.close(); } catch { /* client went away */ }
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no", ...CORS } });
  } catch (e) {
    return v1Failure(e);
  }
}
