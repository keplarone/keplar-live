/**
 * Create: images.
 * GET  -> availability for the plan, limits, today's usage and the user's images (newest first)
 * POST -> start a job. Answers 202 with the job (status UNDERSTANDING); the client polls GET /api/images/:id.
 *         Refusals (plan, limits, cooldown, breaker, confirmation needed) are plain JSON errors with the right status.
 */
import { BREAKER_NOTICE, breakerLevel, paidMediaPaused } from "@/lib/create/platform/breaker";
import { meter } from "@/lib/create/platform/compute";
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { higgsfieldConfigured } from "@/lib/higgsfield/client";
import { REF_LIMITS, RIGHTS_NOTE } from "@/lib/higgsfield/reference";
import { DEFAULT_QUALITY, DEFAULT_SIZE, estimateImage, FREE_UPGRADE_MESSAGE, imageLimitsFor, imageModelChoices, imageProvider, imagesConfigured, QUALITIES, SIZES } from "@/lib/images/config";
import { prepareImageJob, startImageJob, type ImageInput } from "@/lib/images/job";
import { listJobs, publicJob, TERMINAL, usageOf } from "@/lib/images/store";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    const L = imageLimitsFor(ws.plan);
    if (!L) {
      return json({ config: { available: false, reason: "plan", message: FREE_UPGRADE_MESSAGE, plan: ws.plan, upgradeTo: "plus" }, images: [] });
    }
    const [rows, m, level] = await Promise.all([listJobs(ws.id), meter(ws), breakerLevel()]);
    const u = usageOf(rows);
    const paused = paidMediaPaused(level);
    return json({
      config: {
        available: true,
        configured: imagesConfigured(),
        provider: imageProvider(),
        models: imageModelChoices().map((m) => ({ ...m, estimates: Object.fromEntries(QUALITIES.map((q) => [q.id, Object.fromEntries(SIZES.map((sz) => [sz.id, estimateImage(q.id, sz.id, false, m.id).units]))])) })),
        references: { available: higgsfieldConfigured(), types: REF_LIMITS.image.types, maxBytes: REF_LIMITS.image.maxBytes, maxImages: 3, model: "Qwen Image 3 Edit", estimateUnits: estimateImage(DEFAULT_QUALITY, DEFAULT_SIZE, true).units, rightsNote: RIGHTS_NOTE },
        plan: ws.plan,
        sizes: SIZES.map((s) => ({ id: s.id, label: s.label, width: s.width, height: s.height })),
        qualities: QUALITIES,
        defaults: { size: DEFAULT_SIZE, quality: DEFAULT_QUALITY },
        estimates: Object.fromEntries(QUALITIES.map((q) => [q.id, Object.fromEntries(SIZES.map((s) => [s.id, estimateImage(q.id, s.id).units]))])),
        limits: { promptChars: L.promptChars, perDay: ws.admin ? null : L.perDay, highPerDay: ws.admin ? null : L.highPerDay, concurrent: L.concurrent, storedImages: L.storedImages },
        paused,
        notice: BREAKER_NOTICE[level],
      },
      usage: { today: u.today, highToday: u.highToday, stored: u.stored, running: u.running },
      meter: { used: m.used, total: m.total, cooldown: m.cooldown ? { until: m.cooldown.until, message: m.cooldown.message } : null },
      images: rows.slice(0, 150).map(publicJob),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await currentWorkspace(req);
    await rateLimit(`img:post:${ws.id}`, 20, 60, { shared: true });
    const input = await body<ImageInput>(req);
    const prep = await prepareImageJob(ws, {
      prompt: typeof input.prompt === "string" ? input.prompt : undefined,
      size: input.size,
      quality: input.quality,
      regenerateOf: typeof input.regenerateOf === "string" ? input.regenerateOf : undefined,
      idempotencyKey: typeof input.idempotencyKey === "string" ? input.idempotencyKey : undefined,
      confirmUnits: input.confirmUnits,
      references: input.references,
      rightsConfirmed: input.rightsConfirmed,
      model: input.model,
      seed: input.seed,
      negativePrompt: input.negativePrompt,
    });
    if (!prep.existing) startImageJob(ws, prep.job.id, prep.release);
    return json({ job: publicJob(prep.job), existing: prep.existing }, { status: prep.existing && TERMINAL(prep.job.status) ? 200 : 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
