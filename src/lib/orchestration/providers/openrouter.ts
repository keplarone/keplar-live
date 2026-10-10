/**
 * OpenRouter: the primary live gateway (one OpenAI-compatible API for every
 * family; BYOK for OpenAI/Anthropic/Google is configured in the OpenRouter
 * dashboard, not in code). Inactive unless OPENROUTER_API_KEY is set.
 */
import { FREE_RETRY, freeOpenRouterProviderOptions, liveEnv, openRouterProviderOptions, openRouterSlug } from "../config";
import { FREE_PLAN_REFUSAL, isFreeModel } from "../free-guard";
import { HttpError, postChatStream, postJson } from "../http";
import type { Provider, ProviderResult } from "../types";
import { chatBody, fromChat, type ChatResponse } from "./shared";

/** Sampling temperature for $0 models (Keplar answers factual questions; creativity is not the goal on the free tier). */
export const FREE_TEMPERATURE = 0.3;

export class OpenRouterProvider implements Provider {
  readonly name = "openrouter";
  readonly live = true;
  /** Takes OpenAI-style image_url parts (base64 data URLs) for models with image input. */
  readonly vision = true;

  constructor(private readonly env = liveEnv()) {}

  /** Live mode only: KEPLAR_LIVE_MODELS=1 plus an OpenRouter key. */
  static enabled(env = liveEnv()) {
    return Boolean(env.openRouterKey) && !env.forceMock && env.liveModels;
  }

  /** Free-plan instance: serves $0 `:free` models only. */
  private get freeOnly() {
    return this.env.keyTier === "free";
  }

  supports(model: Parameters<Provider["supports"]>[0]): boolean {
    if (this.freeOnly && !isFreeModel(model)) return false;
    return OpenRouterProvider.enabled(this.env) && openRouterSlug(model) !== null;
  }

  async generate({ model, prompt, classification, params, tier, slot, system, images, imagePreamble, signal, onToken }: Parameters<Provider["generate"]>[0]): Promise<ProviderResult> {
    const started = Date.now();
    // Hard guard (also enforced in the registry): a Free-tier instance never sends a priced model.
    if (this.freeOnly && !isFreeModel(model)) return { ok: false, modelId: model.id, reason: "error", message: FREE_PLAN_REFUSAL, latencyMs: 0 };
    const slug = openRouterSlug(model)!;
    const body: Record<string, unknown> = {
      ...chatBody(slug, prompt, params, system, images, imagePreamble),
      provider: this.freeOnly ? freeOpenRouterProviderOptions(this.env.freeDataCollection, tier) : openRouterProviderOptions(model, tier, slot),
      // Ask OpenRouter to return the billed cost in `usage.cost`.
      usage: { include: true },
      // Free models are mostly reasoning models on shared, slow hosts: with reasoning on they often
      // spend the whole output budget thinking (empty answer) or miss the latency budget. Turn it off.
      ...(this.freeOnly ? { reasoning: { effort: "none", exclude: true } } : {}),
    };
    // Free hosts default to their own sampling (often temperature 1.0 on aggressively batched, quantised servers); pin a low,
    // safe value so degenerate sampling is far less likely. No top_k/min_p/penalty knobs are sent (hosts mishandle them).
    if (this.freeOnly && body.temperature === undefined) body.temperature = FREE_TEMPERATURE;
    try {
      const headers = { Authorization: `Bearer ${this.env.openRouterKey}`, "HTTP-Referer": this.env.appUrl, "X-Title": "Keplar" };
      const url = `${this.env.openRouterBase}/chat/completions`;
      // Streamed when the caller wants the words as they arrive; the result is the same whole reply either way.
      const res = onToken
        ? ((await postChatStream(url, body, headers, onToken, signal, this.freeOnly ? FREE_RETRY : undefined)) as ChatResponse)
        : await postJson<ChatResponse>(url, body, headers, signal, this.freeOnly ? FREE_RETRY : undefined);
      return fromChat(model, res, started, this.name, classification);
    } catch (e) {
      if (signal?.aborted) throw e;
      const status = e instanceof HttpError ? e.status : 0;
      return {
        ok: false,
        modelId: model.id,
        reason: status === 429 ? "rate_limited" : status === 408 ? "timeout" : "error",
        message: status === 429 ? "Rate limited after retries." : status === 404 ? "Model or endpoint unavailable." : status === 403 ? "Model not available to this app." : "Gateway error.",
        latencyMs: Date.now() - started,
      };
    }
  }
}
