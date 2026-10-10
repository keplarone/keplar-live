/**
 * Central cost meter. Wraps the process-wide `fetch` once (installed from src/instrumentation.ts) so EVERY request to a model or
 * media provider (METERED_HOSTS: OpenRouter, OpenAI, Anthropic, Google, xAI, NVIDIA, Higgsfield, plus env-configured bases) is:
 *
 *   1. checked against the guardrails (./guard.ts decide(): kill switches, Free = free models only, throttles, low balance,
 *      quotas) and refused with an honest provider-style error, or rewritten to a :free model, before anything is sent;
 *   2. measured: feature, user, plan, provider, model, tokens in/out, actual cost (provider-reported where available, else the
 *      price table, labelled by `costSource`), latency, status;
 *   3. queued and written in batches (one multi-row INSERT per flush, after the response via next/server `after`), so the hot
 *      path never waits on the database. Rollups per user/feature/day feed the quotas.
 *
 * Going around the meter would mean calling a provider without `fetch`; tests/cost-meter-coverage.test.ts fails the build if
 * src/ references a provider host the meter does not cover, or imports an HTTP client that bypasses fetch.
 */
import { collection } from "@/lib/create/platform/store";
import { ensureSchema, neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import { currentCostScope } from "@/lib/ops/request-cost";
import { asPlanKey, costConfig, type CostConfig } from "./config";
import { isFeature, type FeatureId } from "./features";
import { overageCovers } from "./overage";
import { boundCostTag, costRequestKey, explicitCostTag } from "./context";
import { decide, guardState, markBalanceExhausted, noteUserUsage, settleUserUsage, userDayRows, userUsage, utcDay, type Decision, type UserDay } from "./guard";
import { costOf, endpointOf, envHosts, isFreeModelId, micro, parseRequestBody, providerOf, SseUsageScanner, usageFromJson, type CostSource, type EndpointKind, type ProviderId, type UsageInfo } from "./usage";

export type CostEvent = {
  id: string;
  workspaceId: string;
  at: string;
  day: string;
  feature: FeatureId;
  userId: string | null;
  plan: string | null;
  provider: ProviderId;
  endpoint: EndpointKind;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  usd: number;
  costSource: CostSource;
  latencyMs: number;
  status: number;
  ok: boolean;
  /** Refused by a guardrail before sending (no cost). */
  blocked?: string;
  /** Sent on a :free model instead of the paid one (low balance or throttle). */
  degraded?: "low_balance" | "throttle";
  requestedModel?: string;
  /** First call of its request for this feature (counts one "use" for Free daily limits). */
  firstOfRequest?: boolean;
};

export const COST_EVENTS = "cost_events";
type Fetch = typeof fetch;

export type MeterDeps = {
  /** The real fetch underneath. */
  orig: Fetch;
  config?: () => Promise<CostConfig>;
  sink?: (rows: CostEvent[]) => Promise<void>;
  now?: () => number;
  /** Tests: skip the shared guard state and usage store. */
  state?: () => Promise<{ throttles: Record<string, unknown>; exhausted: boolean }>;
  usage?: (userId: string, feature: FeatureId) => Promise<UserDay>;
  onExhausted?: (reason: string) => Promise<unknown>;
  /** Flush delay (ms) for the batch writer. */
  flushMs?: number;
};

let seq = 0;
const rid = () => `ce_${Date.now().toString(36)}${(seq++ % 1296).toString(36).padStart(2, "0")}${Math.random().toString(36).slice(2, 6)}`;

/* ── attribution ─────────────────────────────────────────────────────── */

const seenByRequest = new WeakMap<object, Set<string>>();

export function attribution(): { feature: FeatureId; userId: string | null; plan: string | null; admin: boolean; newRequest: boolean } {
  const ex = explicitCostTag();
  const scope = currentCostScope()?.tag;
  const bound = boundCostTag();
  const pick = <K extends "feature" | "userId" | "plan" | "admin">(k: K) => (ex?.[k] ?? scope?.[k] ?? bound?.[k]) as never;
  const f = pick("feature") as string | undefined;
  const feature: FeatureId = isFeature(f) ? f : bound || scope ? "untagged" : "system";
  const key = costRequestKey();
  let newRequest = true;
  if (key) {
    const seen = seenByRequest.get(key) ?? new Set<string>();
    newRequest = !seen.has(feature);
    seen.add(feature);
    seenByRequest.set(key, seen);
  }
  return { feature, userId: (pick("userId") as string | null | undefined) ?? null, plan: (pick("plan") as string | undefined) ?? null, admin: Boolean(pick("admin")), newRequest };
}

/* ── batch writer ────────────────────────────────────────────────────── */

const MAX_BUFFER = 2000;
const buffer: CostEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;

export async function writeCostEvents(rows: CostEvent[]): Promise<void> {
  if (!rows.length) return;
  if (neonConfigured()) {
    await ensureSchema();
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const values = chunk.map((_, j) => `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4}::jsonb)`).join(", ");
      const params = chunk.flatMap((r) => [COST_EVENTS, r.workspaceId, r.id, JSON.stringify(r)]);
      await neonQuery(`INSERT INTO keplar_rows (collection, workspace_id, id, data) VALUES ${values} ON CONFLICT (collection, workspace_id, id) DO NOTHING`, params);
    }
  } else {
    const c = collection<CostEvent>(COST_EVENTS);
    for (const r of rows) await c.insert(r);
  }
  // Rollups: per user/feature/day (quotas, Free daily uses) and per feature/day (anomaly + margin checks).
  const byUser = new Map<string, { userId: string; day: string; feature: FeatureId; d: UserDay }>();
  const byFeature = new Map<string, { day: string; feature: FeatureId; calls: number; usd: number }>();
  for (const r of rows) {
    if (r.blocked) continue;
    const fk = `${r.day}:${r.feature}`;
    const f = byFeature.get(fk) ?? { day: r.day, feature: r.feature, calls: 0, usd: 0 };
    f.calls++;
    f.usd += r.usd;
    byFeature.set(fk, f);
    if (!r.userId) continue;
    const uk = `${r.userId}|${fk}`;
    const u = byUser.get(uk) ?? { userId: r.userId, day: r.day, feature: r.feature, d: { calls: 0, usd: 0, requests: 0 } };
    u.d.calls++;
    u.d.usd += r.usd;
    u.d.requests += r.firstOfRequest ? 1 : 0;
    byUser.set(uk, u);
  }
  const features = collection<{ id: string; workspaceId: string; day: string; feature: FeatureId; calls: number; usd: number }>("cost_feature_day");
  const jobs: (() => Promise<unknown>)[] = [];
  for (const u of byUser.values())
    jobs.push(async () => {
      await userDayRows().increment(u.userId, `${u.day}:${u.feature}`, { calls: u.d.calls, usd: micro(u.d.usd), requests: u.d.requests }, { id: `${u.day}:${u.feature}`, workspaceId: u.userId, day: u.day, feature: u.feature, calls: 0, usd: 0, requests: 0 });
      settleUserUsage(u.userId, u.feature, u.day, u.d);
    });
  for (const f of byFeature.values()) jobs.push(() => features.increment("system", `${f.day}:${f.feature}`, { calls: f.calls, usd: micro(f.usd) }, { id: `${f.day}:${f.feature}`, workspaceId: "system", day: f.day, feature: f.feature, calls: 0, usd: 0 }));
  for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map((j) => j().catch((e) => console.error("[cost] rollup failed:", e instanceof Error ? e.name : "error"))));
}

/** Writes everything buffered now. Failed rows go back to the buffer (bounded). */
export function flushCostEvents(sink: (rows: CostEvent[]) => Promise<void> = writeCostEvents): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing) return flushing.then(() => (buffer.length ? flushCostEvents(sink) : undefined));
  if (!buffer.length) return Promise.resolve();
  const rows = buffer.splice(0, buffer.length);
  flushing = sink(rows.map((r) => r))
    .catch((e) => {
      console.error("[cost] events not written; retrying later:", e instanceof Error ? e.name : "error");
      buffer.unshift(...rows.slice(-Math.max(0, MAX_BUFFER - buffer.length)));
    })
    .finally(() => {
      flushing = null;
    });
  return flushing.then(() => maybeWatch());
}

function scheduleFlush(sink: (rows: CostEvent[]) => Promise<void>, ms: number) {
  if (buffer.length >= 100) {
    void flushCostEvents(sink);
    return;
  }
  // Inside a request: write after the response is sent (Vercel keeps the function alive for `after`).
  void import("next/server")
    .then(({ after }) => {
      try {
        after(() => flushCostEvents(sink));
        return;
      } catch {
        /* not in a request scope */
      }
      if (!timer) {
        timer = setTimeout(() => void flushCostEvents(sink), ms);
        (timer as { unref?: () => void }).unref?.();
      }
    })
    .catch(() => {
      if (!timer) timer = setTimeout(() => void flushCostEvents(sink), ms);
    });
}

function enqueue(row: CostEvent, sink: (rows: CostEvent[]) => Promise<void>, ms: number) {
  if (row.userId && !row.blocked) noteUserUsage(row.userId, row.feature, { calls: 1, usd: row.usd, requests: row.firstOfRequest ? 1 : 0 });
  buffer.push(row);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  scheduleFlush(sink, ms);
}

/** Buffered, not yet written (tests and the admin page's "pending" note). */
export const pendingCostEvents = (): readonly CostEvent[] => buffer;

let lastWatch = 0;
/** At most every 10 minutes per instance: balance check + margin/anomaly watch (./watch.ts takes a store lease). */
function maybeWatch() {
  const now = Date.now();
  if (now - lastWatch < 10 * 60_000 || process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT || process.env.KEPLAR_COST_WATCH === "0") return;
  lastWatch = now;
  void import("./watch").then((w) => w.runCostWatch({ trigger: "traffic" })).catch(() => undefined);
}

/* ── the wrapper ─────────────────────────────────────────────────────── */

function urlOf(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return input;
    return new URL((input as Request).url);
  } catch {
    return null;
  }
}

function refusal(d: Extract<Decision, { action: "block" }>): Response {
  return Response.json({ error: { code: d.status, message: d.message, metadata: { keplar: d.code } } }, { status: d.status, headers: { "x-keplar-guard": d.code, "cache-control": "no-store" } });
}

/** Builds a metered fetch over `deps.orig`. Pure enough to test with a fake `orig`. */
export function createMeteredFetch(deps: MeterDeps): Fetch {
  const now = deps.now ?? Date.now;
  const sink = deps.sink ?? writeCostEvents;
  const flushMs = deps.flushMs ?? 1500;
  const getConfig = deps.config ?? costConfig;
  const getState = deps.state ?? guardState;
  const getUsage = deps.usage ?? userUsage;
  const onExhausted = deps.onExhausted ?? ((r: string) => markBalanceExhausted(r));
  const extra = envHosts();

  const metered = async function meteredFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlOf(input);
    const provider = url ? providerOf(url, extra) : null;
    if (!url || !provider) return deps.orig(input, init);
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")) || "GET";
    const endpoint = endpointOf(provider, url, method);
    if (endpoint === "meta") return deps.orig(input, init);

    const t0 = now();
    const who = attribution();
    const req = parseRequestBody(init?.body);
    const requestedModel = req.model;
    const free = endpoint === "moderation" || (req.models.length > 0 && req.models.every(isFreeModelId));
    // Only a call we can SEE is paid is treated as paid by the guard (an unreadable body is metered, never refused for it).
    const paid = !free && (req.models.length > 0 || endpoint === "image" || endpoint === "video" || endpoint === "audio" || endpoint === "media_job");
    const plan = asPlanKey(who.plan);
    const base = { workspaceId: "system", feature: who.feature, userId: who.userId, plan: who.plan, provider, endpoint } as const;

    let decision: Decision = { action: "allow" };
    try {
      const [cfg, st, usage] = await Promise.all([getConfig(), getState(), who.userId && plan ? getUsage(who.userId, who.feature).catch(() => null) : Promise.resolve(null)]);
      const overageRoom = cfg.flags.overage && who.userId && (plan === "plus" || plan === "pro") ? await overageCovers({ id: who.userId, plan, admin: who.admin }, 1, who.feature).catch(() => false) : false;
      decision = decide({ cfg, feature: who.feature, plan, admin: who.admin, provider, endpoint, paid, usage, newRequest: who.newRequest, throttle: (st.throttles as Record<string, never>)[who.feature] ?? null, balanceExhausted: st.exhausted, overageRoom });
      if (decision.action === "block") {
        enqueue({ ...base, id: rid(), at: new Date(t0).toISOString(), day: utcDay(t0), model: requestedModel, tokensIn: 0, tokensOut: 0, usd: 0, costSource: "none", latencyMs: 0, status: decision.status, ok: false, blocked: decision.code }, sink, flushMs);
        return refusal(decision);
      }
    } catch (e) {
      // A guard failure never blocks a request: fail open, keep metering.
      console.error("[cost] guard check failed:", e instanceof Error ? e.name : "error");
    }

    let sendInit = init;
    let model = requestedModel;
    let degraded: CostEvent["degraded"];
    if (decision.action === "rewrite" && req.json) {
      model = decision.model;
      degraded = decision.reason;
      sendInit = { ...init, body: JSON.stringify({ ...req.json, model: decision.model, models: undefined }) };
    }

    let res: Response;
    try {
      res = await deps.orig(input, sendInit);
    } catch (e) {
      enqueue({ ...base, id: rid(), at: new Date(t0).toISOString(), day: utcDay(t0), model, tokensIn: 0, tokensOut: 0, usd: 0, costSource: "none", latencyMs: now() - t0, status: 0, ok: false, degraded, requestedModel: degraded ? requestedModel ?? undefined : undefined, firstOfRequest: who.newRequest } as CostEvent, sink, flushMs);
      throw e;
    }

    // Out of OpenRouter credit on a paid model: remember it (every instance degrades within ~20 s) and retry once on a :free model.
    if (res.status === 402 && provider === "openrouter" && paid) {
      void onExhausted(`OpenRouter answered 402 on ${model ?? "a paid model"}`).catch(() => undefined);
      enqueue({ ...base, id: rid(), at: new Date(t0).toISOString(), day: utcDay(t0), model, tokensIn: 0, tokensOut: 0, usd: 0, costSource: "none", latencyMs: now() - t0, status: 402, ok: false }, sink, flushMs);
      const cfg = await getConfig().catch(() => null);
      const fb = cfg?.degrade.freeFallbackModels[0];
      if (cfg?.flags.degradeOnLowBalance && endpoint === "chat" && fb && req.json) {
        model = fb;
        degraded = "low_balance";
        res = await deps.orig(input, { ...init, body: JSON.stringify({ ...req.json, model: fb, models: undefined }) });
      }
    }

    const finish = (usage: UsageInfo | null, extraLatency?: number) => {
      const ok = res.ok;
      const c = costOf({ provider, endpoint, model, usage, req, ok, path: url.pathname });
      enqueue(
        {
          ...base, id: rid(), at: new Date(t0).toISOString(), day: utcDay(t0), model: usage?.model ?? model, tokensIn: usage?.tokensIn ?? 0, tokensOut: usage?.tokensOut ?? 0,
          usd: micro(c.usd), costSource: c.source, latencyMs: extraLatency ?? now() - t0, status: res.status, ok,
          ...(degraded ? { degraded, requestedModel: requestedModel ?? undefined } : {}), firstOfRequest: who.newRequest,
        } as CostEvent,
        sink, flushMs,
      );
    };

    const type = res.headers.get("content-type") ?? "";
    if (res.body && (type.includes("text/event-stream") || (req.stream && !type.includes("json")))) {
      const scanner = new SseUsageScanner();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        finish(scanner.result());
      };
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const r = await reader.read();
            if (r.done) {
              end();
              controller.close();
              return;
            }
            scanner.push(dec.decode(r.value, { stream: true }));
            controller.enqueue(r.value);
          } catch (e) {
            end();
            controller.error(e);
          }
        },
        cancel(reason) {
          end();
          return reader.cancel(reason);
        },
      });
      const out = new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
      if (degraded) out.headers.set("x-keplar-degraded", degraded);
      return out;
    }

    if (type.includes("json")) {
      const clone = res.clone();
      void clone
        .json()
        .then((j) => finish(usageFromJson(j)))
        .catch(() => finish(null));
    } else finish(null);
    if (degraded) {
      try {
        res.headers.set("x-keplar-degraded", degraded);
      } catch {
        /* immutable headers */
      }
    }
    return res;
  };
  return Object.assign(metered, { __keplarCostMeter: true });
}

/* ── install ─────────────────────────────────────────────────────────── */

type Patched = Fetch & { __keplarCostMeter?: boolean };
const G = globalThis as typeof globalThis & { __keplarOriginalFetch?: Fetch };

export const costMeterInstalled = () => Boolean((globalThis.fetch as Patched).__keplarCostMeter);

/** Wraps globalThis.fetch once per process. Keeps Next's fetch-patch markers so Next does not double-wrap. */
export function installCostMeter(): boolean {
  if (costMeterInstalled() || process.env.KEPLAR_COST_METER === "0") return false;
  const orig = globalThis.fetch;
  G.__keplarOriginalFetch = orig;
  const wrapped = createMeteredFetch({ orig: orig.bind(globalThis) }) as Patched;
  for (const k of Object.getOwnPropertyNames(orig)) {
    if (k === "length" || k === "name" || k === "prototype") continue;
    try {
      Object.defineProperty(wrapped, k, Object.getOwnPropertyDescriptor(orig, k)!);
    } catch {
      /* non-configurable */
    }
  }
  globalThis.fetch = wrapped;
  return true;
}

/** The feature the current context is attributed to (no side effects), or null outside any tagged context. */
export function currentCostFeature(): FeatureId | null {
  const f = explicitCostTag()?.feature ?? currentCostScope()?.tag?.feature ?? boundCostTag()?.feature;
  return isFeature(f) ? f : null;
}
