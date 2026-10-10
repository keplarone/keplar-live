/**
 * Direct-SDK escape hatch, used when OpenRouter is down or rate-limits a
 * model after retries. Calls the vendor's own API with the same keys used for
 * BYOK. Alternatively point LITELLM_BASE_URL at a LiteLLM proxy and every
 * family goes through it (OpenAI-compatible).
 * Inactive unless the matching key is set.
 */
import { liveEnv } from "../config";
import { HttpError, postJson } from "../http";
import type { ModelSpec, Provider, ProviderResult } from "../types";
import { systemPrompt, chatBody, fromChat, type ChatResponse } from "./shared";

type Target = { url: string; headers: Record<string, string>; format: "openai" | "anthropic"; via: string };

export class DirectProvider implements Provider {
  readonly name = "direct";
  readonly live = true;
  /** Legacy research-catalog path: text only. */
  readonly vision = false;

  constructor(private readonly env = liveEnv()) {}

  private target(model: ModelSpec): Target | null {
    const e = this.env;
    if (e.forceMock) return null;
    if (e.liteLlmBase) {
      return { url: `${e.liteLlmBase}/chat/completions`, headers: e.liteLlmKey ? { Authorization: `Bearer ${e.liteLlmKey}` } : {}, format: "openai", via: "litellm" };
    }
    switch (model.family) {
      case "OpenAI":
        return e.direct.openai ? { url: "https://api.openai.com/v1/chat/completions", headers: { Authorization: `Bearer ${e.direct.openai}` }, format: "openai", via: "direct:openai" } : null;
      case "Anthropic":
        return e.direct.anthropic
          ? { url: "https://api.anthropic.com/v1/messages", headers: { "x-api-key": e.direct.anthropic, "anthropic-version": "2023-06-01" }, format: "anthropic", via: "direct:anthropic" }
          : null;
      case "Google":
        return e.direct.google
          ? { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", headers: { Authorization: `Bearer ${e.direct.google}` }, format: "openai", via: "direct:google" }
          : null;
      case "xAI":
        return e.direct.xai ? { url: "https://api.x.ai/v1/chat/completions", headers: { Authorization: `Bearer ${e.direct.xai}` }, format: "openai", via: "direct:xai" } : null;
      default:
        return null;
    }
  }

  supports(model: ModelSpec): boolean {
    return this.target(model) !== null;
  }

  async generate({ model, prompt, classification, params, system, signal }: Parameters<Provider["generate"]>[0]): Promise<ProviderResult> {
    const t = this.target(model)!;
    const started = Date.now();
    try {
      if (t.format === "anthropic") {
        const body: Record<string, unknown> = {
          model: model.id,
          system: system ?? systemPrompt(),
          max_tokens: params.maxOutputTokens ?? 2000,
          messages: [{ role: "user", content: prompt }],
        };
        if (params.temperature !== undefined) body.temperature = params.temperature;
        const res = await postJson<{ model?: string; stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }>(t.url, body, t.headers, signal);
        const text = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
        return fromChat(model, {
          model: res.model,
          choices: [{ message: { content: text }, finish_reason: res.stop_reason === "refusal" ? "refusal" : "stop" }],
          usage: { prompt_tokens: res.usage?.input_tokens, completion_tokens: res.usage?.output_tokens },
        }, started, t.via, classification);
      }
      const body = chatBody(model.id, prompt, params, system);
      // `reasoning` is an OpenRouter field; vendors use reasoning_effort.
      if (body.reasoning) { body.reasoning_effort = params.reasoningEffort; delete body.reasoning; }
      const res = await postJson<ChatResponse>(t.url, body, t.headers, signal);
      return fromChat(model, res, started, t.via, classification);
    } catch (e) {
      if (signal?.aborted) throw e;
      const status = e instanceof HttpError ? e.status : 0;
      return { ok: false, modelId: model.id, reason: status === 429 ? "rate_limited" : "error", message: status === 429 ? "Rate limited after retries." : "Provider error.", latencyMs: Date.now() - started };
    }
  }
}
