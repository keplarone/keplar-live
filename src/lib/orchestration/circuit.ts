/**
 * Per-endpoint circuit breaker for provider calls (host + model), so an outage turns into an immediate fallback instead of every
 * request spending its full retry budget against a dead endpoint (a retry storm).
 *
 * closed: calls pass. `failures` consecutive failed calls within `windowMs` open the circuit.
 * open: calls are refused at once (HttpError 503, which the registry treats like any provider error and falls back) for `cooldownMs`.
 * half-open: after the cooldown one probe call is let through; success closes the circuit, failure re-opens it.
 *
 * State is per server instance (memory). That is deliberate: it needs no network hop on the hot path, and each instance learns
 * about an outage from its own first few calls. Shared limits (hourly caps, admin kill switches) live in the store.
 */
import { logEvent } from "@/lib/ops/log";

type State = { fails: number; firstFailAt: number; openUntil: number; probing: boolean; opens: number };

export type CircuitConfig = { failures: number; windowMs: number; cooldownMs: number };

export function circuitConfig(env: Record<string, string | undefined> = process.env): CircuitConfig {
  const n = (k: string, d: number) => (Number.isFinite(Number(env[k])) && Number(env[k]) > 0 ? Number(env[k]) : d);
  return { failures: n("KEPLAR_CIRCUIT_FAILURES", 5), windowMs: n("KEPLAR_CIRCUIT_WINDOW_MS", 60_000), cooldownMs: n("KEPLAR_CIRCUIT_COOLDOWN_MS", 30_000) };
}

const states = new Map<string, State>();
const MAX_KEYS = 500;

export function circuitKey(url: string, body: unknown): string {
  let host = "unknown";
  try {
    host = new URL(url).host;
  } catch {
    /* keep "unknown" */
  }
  const model = body && typeof body === "object" && typeof (body as { model?: unknown }).model === "string" ? (body as { model: string }).model : "";
  return `${host}|${model}`.slice(0, 200);
}

const get = (key: string): State => {
  let s = states.get(key);
  if (!s) {
    if (states.size >= MAX_KEYS) states.delete(states.keys().next().value!);
    s = { fails: 0, firstFailAt: 0, openUntil: 0, probing: false, opens: 0 };
    states.set(key, s);
  }
  return s;
};

/** True when a call may be sent now. In half-open state only one probe is admitted at a time. */
export function circuitAllows(key: string, now = Date.now()): boolean {
  const s = states.get(key);
  if (!s || s.openUntil === 0) return true;
  if (now < s.openUntil) return false;
  if (s.probing) return false;
  s.probing = true;
  return true;
}

export function circuitSuccess(key: string): void {
  const s = states.get(key);
  if (!s) return;
  if (s.openUntil) logEvent("info", "circuit_closed", { key });
  s.fails = 0;
  s.firstFailAt = 0;
  s.openUntil = 0;
  s.probing = false;
}

export function circuitFailure(key: string, now = Date.now(), cfg = circuitConfig()): void {
  const s = get(key);
  if (s.openUntil && s.probing) {
    s.probing = false;
    s.openUntil = now + cfg.cooldownMs;
    s.opens++;
    logEvent("warn", "circuit_reopened", { key, cooldownMs: cfg.cooldownMs });
    return;
  }
  if (!s.fails || now - s.firstFailAt > cfg.windowMs) {
    s.fails = 0;
    s.firstFailAt = now;
  }
  s.fails++;
  if (s.fails >= cfg.failures && !s.openUntil) {
    s.openUntil = now + cfg.cooldownMs;
    s.opens++;
    logEvent("warn", "circuit_open", { key, failures: s.fails, cooldownMs: cfg.cooldownMs });
  }
}

/** Probe released without an outcome (the caller cancelled): let the next call probe instead. */
export function circuitRelease(key: string): void {
  const s = states.get(key);
  if (s) s.probing = false;
}

export type CircuitView = { key: string; state: "closed" | "open" | "half-open"; consecutiveFailures: number; opens: number; openUntil: string | null };

export function circuitSnapshot(now = Date.now()): CircuitView[] {
  return [...states.entries()]
    .filter(([, s]) => s.fails > 0 || s.openUntil > 0 || s.opens > 0)
    .map(([key, s]) => ({ key, state: s.openUntil === 0 ? "closed" as const : now < s.openUntil ? "open" as const : "half-open" as const, consecutiveFailures: s.fails, opens: s.opens, openUntil: s.openUntil ? new Date(s.openUntil).toISOString() : null }));
}

export const resetCircuits = () => states.clear();
