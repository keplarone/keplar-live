/**
 * Demo provider. Stands in for every catalog model: returns a scripted stance
 * and claims after a plausible latency, and honours the model's API
 * capability flags exactly as a real adapter must (it throws on parameters the
 * real API would reject, so the orchestrator's sanitising is exercised).
 *
 * To plug in a real provider, implement `Provider` (see ../types.ts) for that
 * vendor's SDK and register it in ../providers/index.ts ahead of this one.
 */
import { sleep } from "@/lib/orchestration/sleep";
import type { GenerationParams, ModelSpec, Provider, ProviderResult } from "@/lib/orchestration/types";
import { pickScript } from "./scenarios";

export class ParameterRejectedError extends Error {}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function assertParams(model: ModelSpec, params: GenerationParams) {
  const c = model.capabilities;
  if (c.rejectsTemperature && params.temperature !== undefined) throw new ParameterRejectedError(`${model.id} rejects custom temperature`);
  if (c.rejectsTopP && params.topP !== undefined) throw new ParameterRejectedError(`${model.id} rejects custom top_p`);
  if (c.rejectsLogprobs && params.logprobs) throw new ParameterRejectedError(`${model.id} rejects logprobs`);
}

export type MockDirectives = {
  /** Stance to return, decided by the scripted scenario for this panel slot. */
  stance?: string;
  fail?: ProviderResult & { ok: false };
};

export class MockProvider implements Provider {
  readonly name = "mock";
  readonly live = false;
  /** Demo output; images are accepted and ignored. */
  readonly vision = true;
  /** Per-call directives keyed by model id, set by the orchestrator for the demo. */
  directives = new Map<string, MockDirectives>();

  supports(): boolean {
    return true;
  }

  async generate({ model, prompt, classification, params, signal }: Parameters<Provider["generate"]>[0]): Promise<ProviderResult> {
    assertParams(model, params);
    const d = this.directives.get(model.id) ?? {};
    const speedy = model.strengths.includes("speed") || model.role === "fast-cheap";
    const base = classification.complexity === "simple" ? 500 : 1100;
    const latencyMs = base + (hash(model.id + prompt) % 900) + (speedy ? 0 : 500) + (model.capabilities.alwaysReasons ? 300 : 0);

    if (d.fail) {
      await sleep(Math.min(latencyMs + 600, 2600), signal);
      return { ...d.fail, latencyMs };
    }
    await sleep(latencyMs, signal);

    const script = pickScript(prompt);
    const stance = d.stance ?? Object.keys(script.positions)[0];
    const pos = script.positions[stance];
    return {
      ok: true,
      modelId: model.id,
      stance,
      claims: pos.claims.map((c, i) => ({ id: `${stance}-${i}`, text: c.text })),
      text: pos.summary,
      latencyMs,
      usage: { inputTokens: classification.estimatedInputTokens, outputTokens: classification.estimatedOutputTokens },
    };
  }
}
