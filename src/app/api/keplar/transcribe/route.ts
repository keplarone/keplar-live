/**
 * POST /api/keplar/transcribe (body: one ≤ 60 s chunk of 16 kHz mono 16-bit WAV) → { text }.
 * The audio track of an attached video, or an audio file, decoded in the browser. Free and signed-out: free OpenRouter audio
 * models only. Paid: OpenAI speech-to-text first. Same-origin, rate limited, nothing stored or logged.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { clientIpOf, limitRequest } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { dailyLimit } from "@/lib/tools/access";
import { limitsForPlan } from "@/lib/attachments/kinds";
import { AudioError, transcribeChunk } from "@/lib/attachments/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 2_300_000;

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw new HttpError(413, "That audio chunk is too large.", "too_large");
    const ws = await currentWorkspace(req, { allowAnonymous: true });
    await limitRequest(req, "keplar-transcribe", { perIp: 30, perAccount: 40, accountId: ws.anonymous ? null : ws.id, windowSec: 60 });
    const plan = ws.anonymous ? "free" : ws.plan;
    // Chunks per day: a 3-minute video is 4 chunks.
    await dailyLimit(`transcribe:${ws.anonymous ? `ip:${clientIpOf(req)}` : ws.id}`, (ws.anonymous ? 12 : limitsForPlan(plan).transcribePerDay) * 4, "transcribing audio");
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length > MAX_BODY) throw new HttpError(413, "That audio chunk is too large.", "too_large");
    const r = await transcribeChunk(buf, plan, AbortSignal.any([req.signal, AbortSignal.timeout(55_000)]));
    return json({ text: r.text }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AudioError) return json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}
