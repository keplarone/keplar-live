/**
 * Direct OpenAI-compatible adapters for the live roster:
 *   - OpenAIProvider  → https://api.openai.com/v1        (route "openai")
 *   - NvidiaProvider  → https://integrate.api.nvidia.com/v1 (route "nvidia")
 * Each serves only live models that carry its route (live-catalog.ts), and only
 * when live mode is on and its key is set. OpenRouter stays the fallback.
 * Keys are sent as headers only; they are never logged or echoed in errors.
 */
import { liveEnv } from "../config";
import { HttpError, postChatStream, postJson } from "../http";
import { callCostUsd } from "../pricing";
import type { LiveRoute, ModelSpec, Provider, ProviderResult } from "../types";
import { systemPrompt, fromChat, userContent, type ChatResponse } from "./shared";

type Env = ReturnType<typeof liveEnv>;

abstract class OpenAICompatProvider implements Provider {
  abstract readonly name: string;
  readonly live = true;
  protected abstract readonly route: LiveRoute;
  protected abstract key(): string | null;
  protected abstract base(): string;
  /** Build the vendor-specific body. */
  protected abstract body(modelId: string, input: Parameters<Provider["generate"]>[0]): Record<string, unknown>;

  constructor(protected readonly env: Env = liveEnv()) {}

  supports(model: ModelSpec): boolean {
    return this.env.liveModels && !this.env.forceMock && Boolean(this.key()) && Boolean(model.routes?.[this.route]);
  }

  async generate(input: Parameters<Provider["generate"]>[0]): Promise<ProviderResult> {
    const { model, classification, signal } = input;
    const id = model.routes![this.route]!;
    const started = Date.now();
    try {
      const url = `${this.base()}/chat/completions`;
      const headers = { Authorization: `Bearer ${this.key()}` };
      const res = input.onToken ? ((await postChatStream(url, this.body(id, input), headers, input.onToken, signal)) as ChatResponse) : await postJson<ChatResponse>(url, this.body(id, input), headers, signal);
      const r = fromChat(model, res, started, this.name, classification, id);
      // No billed figure from these APIs: meter at the roster's list price (conservative for NVIDIA credits).
      if (r.ok && r.actualCostUsd === undefined) r.actualCostUsd = callCostUsd(model, r.usage.inputTokens, r.usage.outputTokens, new Date().toISOString()) ?? undefined;
      return r;
    } catch (e) {
      if (signal?.aborted) throw e;
      const status = e instanceof HttpError ? e.status : 0;
      return {
        ok: false,
        modelId: model.id,
        reason: status === 429 ? "rate_limited" : status === 408 ? "timeout" : "error",
        message: status === 429 ? "Rate limited after retries." : status === 401 || status === 403 ? `${this.name} rejected the API key.` : `${this.name} error${status ? ` (HTTP ${status})` : ""}.`,
        latencyMs: Date.now() - started,
      };
    }
  }
}

export class OpenAIProvider extends OpenAICompatProvider {
  readonly name = "openai";
  /** Chat Completions takes image_url parts with base64 data URLs. */
  readonly vision = true;
  protected readonly route = "openai" as const;
  protected key() { return this.env.direct.openai; }
  protected base() { return this.env.openAiBase; }
  protected body(modelId: string, { prompt, params, system, images, imagePreamble }: Parameters<Provider["generate"]>[0]) {
    // GPT-5+/6 models take max_completion_tokens and reasoning_effort; custom temperature is rejected by reasoning models.
    const b: Record<string, unknown> = {
      model: modelId,
      messages: [
        { role: "system", content: system ?? systemPrompt() },
        { role: "user", content: userContent(prompt, images, imagePreamble) },
      ],
      max_completion_tokens: params.maxOutputTokens ?? 2000,
    };
    if (params.reasoningEffort) b.reasoning_effort = params.reasoningEffort === "high" ? "medium" : params.reasoningEffort;
    return b;
  }
}

export class NvidiaProvider extends OpenAICompatProvider {
  readonly name = "nvidia";
  /** Image input isn't used on the NVIDIA route: media calls go through OpenRouter instead. */
  readonly vision = false;
  protected readonly route = "nvidia" as const;
  protected key() { return this.env.nvidiaKey; }
  protected base() { return this.env.nvidiaBase; }
  protected body(modelId: string, { prompt, params, system }: Parameters<Provider["generate"]>[0]) {
    const b: Record<string, unknown> = {
      model: modelId,
      messages: [
        { role: "system", content: system ?? systemPrompt() },
        { role: "user", content: prompt },
      ],
      max_tokens: params.maxOutputTokens ?? 2000,
    };
    if (params.temperature !== undefined) b.temperature = params.temperature;
    return b;
  }
}
