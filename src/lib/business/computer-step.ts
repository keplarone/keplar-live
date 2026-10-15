/**
 * One metered computer-use step (AI-6): the vision call behind /api/business/computer/step is checked against the account's
 * credits before it is made and charged at its real provider cost x METER_MARGIN after, the same way the Ask tool planner
 * (mcp/chat.ts#chargePlanner) and Business summaries (business/ai.ts) are charged. Failed attempts that report usage are
 * charged too; an attempt that never reached a model is not.
 */
import { assertCanSpend, chargeUnits, toUnits } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { METER_MARGIN } from "@/lib/orchestration/limits";
import { spentUsd } from "@/lib/orchestration/pricing";
import type { createRegistry } from "@/lib/orchestration/providers";
import type { Classification, ModelSpec } from "@/lib/orchestration/types";
import { COMPUTER_SYSTEM, parseStep, stepPrompt, type ProposedStep, type StepHistory } from "./computer";

export const COMPUTER_ACTION = "agent.computer";
/** Credits that must be left before a step is attempted (a pre-check only: what is charged is the call's real cost). */
export const COMPUTER_RESERVE_UNITS = toUnits(0.03 * METER_MARGIN);

const CLS: Classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 3000, estimatedOutputTokens: 160, needsWeb: false, rationale: "Computer use step." };

type Registry = Pick<ReturnType<typeof createRegistry>, "once">;

export async function decideComputerStep(
  ws: Workspace,
  input: { goal: string; history: StepHistory[]; screen: { width: number; height: number }; shot: string },
  deps: { registry: Registry; models: ModelSpec[] },
): Promise<{ step: ProposedStep; model: string; units: number }> {
  await assertCanSpend(ws, COMPUTER_RESERVE_UNITS, { kind: "agent" });
  const prompt = stepPrompt(input.goal, input.history, input.screen);
  let units = 0;
  for (const model of deps.models.slice(0, 3)) {
    let r: Awaited<ReturnType<Registry["once"]>>;
    try {
      r = await deps.registry.once({
        model, prompt, system: COMPUTER_SYSTEM, classification: CLS, slot: "panel",
        params: { maxOutputTokens: 300 },
        images: [{ name: "screen", dataUrl: input.shot, width: input.screen.width, height: input.screen.height }],
        imagePreamble: "The person's screen right now:",
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      continue; // next model
    }
    if (!r.ok) continue;
    const usd = spentUsd(model, r);
    if (usd > 0) {
      const metered = usd * METER_MARGIN;
      units += await chargeUnits(ws, COMPUTER_ACTION, toUnits(metered), metered);
    }
    if (r.text) return { step: parseStep(r.text, input.screen), model: model.id, units };
  }
  throw new HttpError(502, "Keplar couldn't decide the next step. Try again.", "no_model");
}
