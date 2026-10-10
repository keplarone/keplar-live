/**
 * Design helpers for the app builder: "Surprise me" (a distinctive, coherent art direction for the idea) and "extract a palette"
 * (from a description, brand colors or an image). Free plan uses $0 models; paid plans are charged the real (small) cost.
 */
import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import { errorResponse, json, body, HttpError } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { meteredUsd } from "@/lib/orchestration/limits";
import { extractPalette, surpriseFor } from "@/lib/app-builder/design/surprise";
import { tokensFor } from "@/lib/app-builder/design/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req, { team: true });
    await rateLimit(`apps:design:${ws.id}`, ws.plan === "free" ? 8 : 20, 60, { shared: true });
    const input = await body<{ action?: string; idea?: string; notes?: string; text?: string; imageDataUrl?: string }>(req);
    if (ws.plan !== "free") await assertCanSpend(ws, 5);
    if (input.action === "surprise") {
      const r = await surpriseFor(ws.plan, String(input.idea ?? "").slice(0, 2000), String(input.notes ?? "").slice(0, 600));
      if (r.usd > 0) await charge(ws, "app.design", { usd: meteredUsd(r.usd) });
      return json({ design: r.design, tokens: tokensFor(r.design) });
    }
    if (input.action === "extract") {
      const img = typeof input.imageDataUrl === "string" ? input.imageDataUrl : "";
      if (img && (!/^data:image\/(png|jpeg|webp);base64,/.test(img) || img.length > 2_800_000)) throw new HttpError(400, "Use a PNG, JPEG or WebP image under 2 MB.");
      if (!img && String(input.text ?? "").trim().length < 3) throw new HttpError(400, "Describe the colors, brand or mood first.");
      const r = await extractPalette(ws.plan, { text: String(input.text ?? "").slice(0, 800), imageDataUrl: img || undefined });
      if (r.usd > 0) await charge(ws, "app.design", { usd: meteredUsd(r.usd) });
      return json({ palette: r.palette, mode: r.mode, why: r.why });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    return errorResponse(e);
  }
}
