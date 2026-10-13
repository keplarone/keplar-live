import type { ModelSpec, Provider, ProviderResult } from "../types";
import { FREE_PLAN_REFUSAL, freeCallAllowed, isFreeModel } from "../free-guard";
import { DirectProvider } from "./direct";
import { OpenRouterProvider } from "./openrouter";
import { NvidiaProvider, OpenAIProvider } from "./openai-compat";
import { liveEnv, type KeyTier } from "../config";
import type { DailySpendGuard } from "../live-budget";
import { estimateTokens } from "../live-budget";
import { acceptsImages, imageTokens } from "../media";
import { GLOBAL_STOP_MESSAGE, isDisabled, opsControls } from "@/lib/ops/controls";
import { recordModelCall } from "@/lib/ops/telemetry";
import { noteCallSent } from "@/lib/ops/request-cost";
import { POOL_BUSY_MESSAGE, type PoolGovernor } from "../pool-governor";
import { CALL_CAP_MESSAGE, claimUserCall, releaseUserCall } from "@/lib/usage/call-budget";
import { hourlyBlockFor, recordHourly } from "@/lib/ops/hourly";
import { assessOutput, gateLabel, QUALITY_FAIL_MESSAGE } from "../quality-gate";

export const MODEL_OFF_MESSAGE = "This model is switched off by the operator. Not sent.";

type GenerateInput = Parameters<Provider["generate"]>[0];
type RegistryInput = GenerateInput & {
  /**
   * Model ids already used in this request (e.g. the rest of the panel). Model
   * fallbacks skip them and add the substitute they pick, so two seats never
   * end up on the same model.
   */
  avoid?: Set<string>;
};
export type RegistryResult = ProviderResult & { provider: string; live: boolean; model: ModelSpec; fellBackFrom?: string };

/** Message shown when every free model is busy (Free plan). */
export const FREE_BUSY_MESSAGE = "The free models are busy right now. Try again in a minute, or upgrade to Lite for the paid model panel.";

export type RegistryOptions = {
  guard?: DailySpendGuard | null;
  /**
   * Free plan: every call must be a $0 `:free` model on OpenRouter. Anything
   * else is refused before it is sent (free-guard.ts), including fallbacks.
   */
  freeOnly?: boolean;
  /**
   * Free plan: counts every request against the shared OpenRouter free key BEFORE it is sent (pool-governor.ts). Over the minute or
   * day limit the request is not sent; as the pool fills, fallbacks shrink and then stop. Omitted = ungoverned (tests, paid).
   */
  pool?: PoolGovernor | null;
  /** Other models to try, in order, when a model is rate-limited, missing or erroring. */
  fallbacks?: (model: ModelSpec) => readonly ModelSpec[];
  /** Max substitute models per call (default 3). */
  maxFallbacks?: number;
  /**
   * Substitutes used ONLY when a model's answer failed the quality gate (degenerate output) and no general `fallbacks`
   * are configured (paid plans). Lets a bad answer escalate to another model before anything is shown.
   */
  qualityFallbacks?: (model: ModelSpec) => readonly ModelSpec[];
};

/** A media call to a model without image input is refused before anything is sent. */
export const NO_IMAGE_INPUT = "This model can't read images or video frames. Not sent.";

/** Failures worth trying on the next provider. Refusals are final: a refusal is a missing vote. */
const FALLBACK_ON = new Set<string>(["rate_limited", "timeout", "error"]);

/**
 * Provider registry. Order is priority: for live-roster models the model's
 * direct route (OpenAI or NVIDIA) first when it has one, then OpenRouter; for
 * the research catalog OpenRouter first and the direct SDK path as fallback.
 * With no live provider configured the list is empty: nothing is faked.
 *
 * With a spend guard, every live attempt reserves its worst case first and is
 * never sent if the daily cap would be exceeded.
 */
export function createRegistry(providers: Provider[], opts: RegistryOptions = {}) {
  const guard = opts.guard ?? null;
  const freeOnly = Boolean(opts.freeOnly);
  const maxFallbacks = opts.maxFallbacks ?? 3;
  const pool = freeOnly ? opts.pool ?? null : null;
  const reg = {
    providers,
    guard,
    freeOnly,
    pool,
    /**
     * Providers that can serve this model, in priority order (Free: OpenRouter + $0 models only).
     * Media calls: only models with image input, and only providers whose API takes image parts.
     */
    chain(model: GenerateInput["model"], media = false): Provider[] {
      if (freeOnly && !isFreeModel(model)) return [];
      if (media && !acceptsImages(model)) return [];
      return providers.filter((p) => p.supports(model) && (!freeOnly || freeCallAllowed(p.name, model)) && (!media || p.vision !== false));
    },
    /**
     * Another model that can take over a seat (the first configured fallback not already in `avoid`), or null.
     * Used to start a stand-in while a slow model is still running. Free-plan only, where a second call costs $0.
     */
    substitute(model: ModelSpec, avoid: ReadonlySet<string>, media = false): ModelSpec | null {
      if (!freeOnly || !opts.fallbacks) return null;
      for (const alt of opts.fallbacks(model)) {
        if (alt.id === model.id || avoid.has(alt.id) || !reg.chain(alt, media).length) continue;
        return alt;
      }
      return null;
    },
    /** One model through its provider chain (no model fallback). */
    async once(input: GenerateInput): Promise<ProviderResult & { provider: string; live: boolean }> {
      // Hard guard: a Free-plan call to a priced model (or a non-OpenRouter path) is never sent.
      if (freeOnly && !isFreeModel(input.model)) {
        return { ok: false, modelId: input.model.id, reason: "error", message: FREE_PLAN_REFUSAL, latencyMs: 0, provider: "none", live: false };
      }
      // Operator kill switches: global stop, a disabled model, or a disabled provider (checked before anything is sent).
      const ops = await opsControls();
      if (ops.globalStop) return { ok: false, modelId: input.model.id, reason: "error", message: GLOBAL_STOP_MESSAGE, latencyMs: 0, provider: "none", live: false };
      if (isDisabled(ops, { modelId: input.model.id, vendor: input.model.provider })) {
        return { ok: false, modelId: input.model.id, reason: "error", message: MODEL_OFF_MESSAGE, latencyMs: 0, provider: "none", live: false };
      }
      const media = Boolean(input.images?.length);
      if (media && !acceptsImages(input.model)) {
        return { ok: false, modelId: input.model.id, reason: "error", message: NO_IMAGE_INPUT, latencyMs: 0, provider: "none", live: false };
      }
      const chain = reg.chain(input.model, media).filter((p) => !isDisabled(ops, { provider: p.name }));
      if (!chain.length) {
        return { ok: false, modelId: input.model.id, reason: "error", message: "No provider configured for this model.", latencyMs: 0, provider: "none", live: false };
      }
      let last: ProviderResult | null = null;
      let lastProvider = chain[0];
      for (const p of chain) {
        lastProvider = p;
        // Hourly per-provider / per-model limits: refused as rate-limited so the router falls back to another model.
        const over = p.live ? await hourlyBlockFor(p.name, input.model.id) : null;
        if (over) {
          last = { ok: false, modelId: input.model.id, reason: "rate_limited", message: over, latencyMs: 0 };
          continue;
        }
        // Free: the shared OpenRouter key's per-minute and per-day request limits (pool-governor.ts). Not admitted = not sent.
        if (pool && p.live) {
          // The person's own daily request budget first (it costs the shared pool nothing), then the shared pool.
          const mine = await claimUserCall();
          if (mine === "capped") {
            last = { ok: false, modelId: input.model.id, reason: "rate_limited", message: CALL_CAP_MESSAGE, latencyMs: 0 };
            break;
          }
          const adm = await pool.admit();
          if (!adm.ok) {
            if (mine === "claimed") await releaseUserCall();
            last = { ok: false, modelId: input.model.id, reason: "rate_limited", message: POOL_BUSY_MESSAGE, latencyMs: 0 };
            break;
          }
        }
        let settle: ((usd: number) => void) | null = null;
        let worst = 0;
        if (guard && p.live) {
          // Images are priced as input tokens (tile estimate, media.ts), so the cap covers them too.
          const estIn = estimateTokens((input.system ?? "") + (input.imagePreamble ?? "") + input.prompt) + 200 + (input.images ?? []).reduce((a, i) => a + imageTokens(i.width, i.height) + 20, 0);
          worst = guard.worstCase(input.model, estIn, input.params.maxOutputTokens ?? 2000);
          settle = await guard.reserve(worst);
          if (!settle) {
            last = { ok: false, modelId: input.model.id, reason: "error", message: "Daily live-model budget reached. Not sent.", latencyMs: 0 };
            break; // the cap applies to every provider; don't try the next one
          }
        }
        try {
          if (p.live) noteCallSent(input.slot ?? "panel", input.model.id); // counted when it leaves: a cancelled or timed-out request still spends the provider's quota
          // Words stream from the first provider only: a second provider's text would be appended to the first one's.
          let r = await p.generate(p === chain[0] ? input : { ...input, onToken: undefined });
          // Quality gate: a degenerate answer is a failure, never a result. It was paid for (the billed cost is still
          // recorded below), but it is not shown, compared or charged to the user; the caller falls back to another model.
          let rejected = "";
          let billed: number | undefined;
          if (r.ok) {
            billed = r.actualCostUsd;
            const verdict = assessOutput(r.text, { prompt: input.prompt });
            if (!verdict.ok) {
              rejected = gateLabel(verdict);
              console.error("[quality-gate] rejected answer:", input.model.id, verdict.reason);
              r = { ok: false, modelId: input.model.id, reason: "error", message: QUALITY_FAIL_MESSAGE, latencyMs: r.latencyMs };
            }
          }
          const spent = rejected ? (billed ?? worst) : r.ok ? (r.actualCostUsd ?? worst) : 0;
          if (p.live) recordHourly(p.name, input.model.id, spent);
          if (p.live) recordModelCall({ model: input.model.id, vendor: input.model.provider, provider: p.name, ok: r.ok, reason: rejected || (r.ok ? "ok" : r.reason), latencyMs: r.latencyMs, usd: spent });
          settle?.(rejected ? spent : r.ok ? (r.actualCostUsd ?? worst) : r.reason === "timeout" ? worst : 0);
          last = r;
        } catch (e) {
          // Aborted (user cancel or the shared latency budget): it may still be billed, so count the worst case.
          settle?.(worst);
          throw e;
        }
        if (last.ok || !FALLBACK_ON.has(last.reason)) break;
      }
      return { ...last!, provider: lastProvider.name, live: lastProvider.live };
    },
    /**
     * The model, then (when it is rate-limited, missing or erroring, and
     * fallbacks are configured) up to `maxFallbacks` substitute models.
     */
    async generate(input: RegistryInput): Promise<RegistryResult> {
      const { avoid, ...base } = input;
      const first = await reg.once(base);
      const fallbacks = opts.fallbacks ?? (!first.ok && first.message === QUALITY_FAIL_MESSAGE ? opts.qualityFallbacks : undefined);
      if (first.ok || !fallbacks || first.message === FREE_PLAN_REFUSAL || first.message === GLOBAL_STOP_MESSAGE || first.message === NO_IMAGE_INPUT || first.message === POOL_BUSY_MESSAGE || first.message === CALL_CAP_MESSAGE || first.message.startsWith("Daily live-model budget") || !(first.reason === "rate_limited" || first.reason === "error")) {
        return { ...first, model: input.model };
      }
      let last: RegistryResult = { ...first, model: input.model };
      let tried = 0;
      let allBusy = first.reason === "rate_limited";
      const allowed = pool ? Math.min(maxFallbacks, pool.maxFallbacks()) : maxFallbacks;
      for (const alt of fallbacks(input.model)) {
        if (tried >= allowed) break;
        // Media calls only fall back to models that can read images.
        if (alt.id === input.model.id || avoid?.has(alt.id) || !reg.chain(alt, Boolean(base.images?.length)).length) continue;
        avoid?.add(alt.id);
        tried++;
        const r = await reg.once({ ...base, onToken: undefined, model: alt });
        last = { ...r, model: alt, fellBackFrom: input.model.id };
        if (r.ok) return last;
        if (r.reason !== "rate_limited") allBusy = false;
        if (!(r.reason === "rate_limited" || r.reason === "error") || r.message.startsWith("Daily live-model budget") || r.message === POOL_BUSY_MESSAGE || r.message === CALL_CAP_MESSAGE) break;
      }
      // Nothing answered: report it on the original model so the seat shows as failed.
      const message = freeOnly && allBusy ? FREE_BUSY_MESSAGE : last.ok ? "" : last.message;
      return { ok: false, modelId: input.model.id, reason: allBusy ? "rate_limited" : last.ok ? "error" : last.reason, message, latencyMs: last.ok ? 0 : last.latencyMs, provider: last.provider, live: last.live, model: input.model };
    },
  };
  return reg;
}

/**
 * Providers for this environment.
 * - Live mode needs KEPLAR_LIVE_MODELS=1 AND at least one key (OpenRouter,
 *   OpenAI or NVIDIA). Order: NVIDIA and OpenAI direct routes for the models
 *   that have them, then OpenRouter (primary multi-family route and fallback).
 * - Otherwise no providers (the product shows a "not set up yet" state).
 */
export function defaultProviders(keyTier: KeyTier = "paid"): Provider[] {
  const env = liveEnv(keyTier);
  if (!liveMode(env)) return [];
  const live: Provider[] = [];
  if (env.nvidiaKey) live.push(new NvidiaProvider(env));
  if (env.direct.openai) live.push(new OpenAIProvider(env));
  if (OpenRouterProvider.enabled(env)) live.push(new OpenRouterProvider(env));
  return live;
}

/** True when live models are switched on and at least one live key exists. */
export function liveMode(env = liveEnv()): boolean {
  if (env.forceMock || !env.liveModels) return false;
  return Boolean(env.openRouterKey || env.direct.openai || env.nvidiaKey);
}

export { OpenRouterProvider, DirectProvider, OpenAIProvider, NvidiaProvider };
