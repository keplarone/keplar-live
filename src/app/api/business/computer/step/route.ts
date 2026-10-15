/**
 * POST /api/business/computer/step: the next computer-use step for the Keplar Business desktop app (src/lib/business/computer.ts).
 *   { goal, history: StepHistory[], screen: { width, height }, shot: "data:image/jpeg;base64,..." }
 *   -> { step: { action, say, sensitive }, model }
 * A Business plan (or an editor on a Business team), same origin, rate limited. It only proposes: the desktop app shows the
 * step, asks the person (always for sensitive steps) and performs it on their computer. Screenshots are used for this one
 * call and never stored. Each step's vision call is metered like other model calls (business/computer-step.ts).
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { requireBusiness } from "@/lib/business/require";
import { COMPUTER_LIMITS, type StepHistory } from "@/lib/business/computer";
import { decideComputerStep } from "@/lib/business/computer-step";
import { engineDeps } from "@/lib/orchestration/orchestrator";
import { loadLiveCatalog } from "@/lib/orchestration/catalog-sync";
import type { ModelSpec } from "@/lib/orchestration/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PREFERRED = [/claude/i, /gpt-?5|gpt-?4\.1|gpt-?4o/i, /gemini/i];

/** Vision models from the live roster, the strongest families first. */
function visionModels(): ModelSpec[] {
  const roster = loadLiveCatalog().filter((m) => m.inputModalities?.includes("image"));
  const rank = (m: ModelSpec) => { const i = PREFERRED.findIndex((r) => r.test(m.id)); return i < 0 ? PREFERRED.length : i; };
  return roster.sort((a, b) => rank(a) - rank(b));
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ws = await requireBusiness(req);
    await rateLimit(`biz-computer:${ws.id}`, 90);
    const b = await body<{ goal?: unknown; history?: unknown; screen?: { width?: unknown; height?: unknown }; shot?: unknown }>(req);
    const goal = typeof b.goal === "string" ? b.goal.replace(/\s+/g, " ").trim().slice(0, COMPUTER_LIMITS.maxGoalChars) : "";
    if (goal.length < 4) throw new HttpError(400, "Say what Keplar should do on your computer.", "invalid");
    const width = Number(b.screen?.width), height = Number(b.screen?.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 200 || height < 150 || width > 4096 || height > 4096) throw new HttpError(400, "The screen size is missing.", "invalid");
    const shot = typeof b.shot === "string" ? b.shot : "";
    const m = /^data:(image\/(?:jpeg|png|webp));base64,[A-Za-z0-9+/=]+$/.exec(shot);
    if (!m || shot.length > COMPUTER_LIMITS.maxShotBytes * 1.37) throw new HttpError(400, "The screenshot is missing or too large.", "invalid");
    const history: StepHistory[] = Array.isArray(b.history)
      ? b.history.slice(-COMPUTER_LIMITS.maxSteps).map((h) => { const o = (h ?? {}) as Record<string, unknown>; return { say: String(o.say ?? "").slice(0, 200), type: String(o.type ?? "wait") as StepHistory["type"], ok: o.ok !== false, ...(o.note ? { note: String(o.note).slice(0, 200) } : {}) }; })
      : [];
    if (history.length >= COMPUTER_LIMITS.maxSteps) return json({ step: { action: { type: "stop", reason: `Keplar stopped after ${COMPUTER_LIMITS.maxSteps} steps.` }, say: `Stopped after ${COMPUTER_LIMITS.maxSteps} steps.`, sensitive: false }, model: null });

    const deps = engineDeps({ keyTier: "paid" });
    const registry = deps?.registry;
    const models = visionModels();
    if (!registry || !models.length) throw new HttpError(503, "Computer use isn't available right now: no vision model is set up.", "unavailable");
    const { step, model } = await decideComputerStep(ws, { goal, history, screen: { width, height }, shot }, { registry, models });
    return json({ step, model });
  } catch (e) {
    return errorResponse(e);
  }
}
