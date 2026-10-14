/**
 * Which foundation model serves each Space Studio configuration, and its price. Server-only (this repository is private):
 * the shared registry in ./core and everything sent to clients describe the product, not the provider.
 *
 * Slugs and prices are the ones keplar.one already uses in production (src/lib/app-builder/models.ts, src/lib/cost/usage.ts).
 * An environment can point a model elsewhere with SPACE_MODEL_ORBIT / _NEBULA / _SOLAR / _NOVA (anthropic/ slugs only).
 */
import type { ModelId, ModelProfile } from "./core";

type Provider = { slug: string; usdPerMInput: number; usdPerMOutput: number };

const HAIKU: Provider = { slug: "anthropic/claude-haiku-4.5", usdPerMInput: 1, usdPerMOutput: 5 };
const SONNET: Provider = { slug: "anthropic/claude-sonnet-5.5", usdPerMInput: 2, usdPerMOutput: 10 };
const OPUS: Provider = { slug: "anthropic/claude-opus-5.5", usdPerMInput: 4, usdPerMOutput: 20 };

export const PROVIDERS: Record<ModelId, Provider> = { orbit: HAIKU, nebula: SONNET, solar: OPUS, nova: OPUS };

export function resolvedSlug(m: ModelProfile, env: Record<string, string | undefined> = {}): string {
  const o = env[`SPACE_MODEL_${m.id.toUpperCase()}`]?.trim();
  return o && /^anthropic\/[a-z0-9.\-]+$/.test(o) ? o : PROVIDERS[m.id].slug;
}

export const costUsd = (m: ModelProfile, promptTokens: number, completionTokens: number) =>
  (promptTokens * PROVIDERS[m.id].usdPerMInput + completionTokens * PROVIDERS[m.id].usdPerMOutput) / 1e6;
