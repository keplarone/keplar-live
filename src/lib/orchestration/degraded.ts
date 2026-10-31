/**
 * Degraded chat while the database is unavailable (neon.ts StoreUnavailableError: the plan's compute allowance is used up, an
 * outage, or a timeout). Keplar still answers, safely:
 *   - everyone is answered as a signed-out Free visitor, on the $0 free roster, one model, quick depth: no credits are read or
 *     spent and no premium model runs, because the ledger, the plan and the session can't be verified;
 *   - nothing is saved server-side (no turn recovery, memory, chat digest, learning or FAQ counts); the browser keeps the chat as usual;
 *   - attachments, Live Research, tools and modes that need storage or paid models are refused with a plain message;
 *   - limits are in memory, per instance, and stricter than Free's: per IP, per signed device cookie, one answer at a time per IP,
 *     and a ceiling per instance per hour that protects the shared free key. Anything that could spend money stays closed.
 */
import type { KeplarRequest } from "./types";

export const DEGRADED_NOTICE = "Saving and paid models are paused briefly; this answer isn't saved.";
/** Shown as the first line of the answer (italic), like other code-added notes. */
export const DEGRADED_PREFIX = `_${DEGRADED_NOTICE}_\n\n`;
export const DEGRADED_ATTACHMENTS = "Attachments, Live Research and connected apps are paused briefly. Send a text-only question, or try again in a few minutes.";
export const DEGRADED_FIXED_MEMORY = "Saved chats and memory are paused briefly, so I can't read or change them right now. Please try again in a few minutes.";

/** Stricter than Free (6 a minute, 50 a day per person, 150 per network), because nothing here is shared across instances. */
export const DEGRADED_LIMITS = {
  ipPerMinute: 4,
  devicePerMinute: 4,
  ipPerHour: 20,
  ipPerDay: 40,
  devicePerDay: 25,
  /** Every degraded answer on this instance, per hour: the shared free key's daily request pool must not be drained by one outage. */
  instancePerHour: 600,
  concurrentPerIp: 1,
} as const;

type Win = { start: number; count: number };
const windows = new Map<string, Win>();
const running = new Map<string, number>();

function peek(key: string, windowMs: number, now: number): number {
  const w = windows.get(key);
  return w && now - w.start < windowMs ? w.count : 0;
}
function bump(key: string, windowMs: number, now: number) {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) windows.set(key, { start: now, count: 1 });
  else w.count++;
  if (windows.size > 50_000) windows.clear();
}

export type DegradedRefusal = { message: string; retryAfterSec: number };

/**
 * Checks every limit first and only then counts the request against all of them (a refused request uses nothing).
 * Returns a refusal, or a `release` to call when the answer ends (frees the concurrency slot).
 */
export function admitDegraded(who: { ip: string; device: string | null }, now = Date.now()): DegradedRefusal | { release: () => void } {
  const L = DEGRADED_LIMITS;
  const M = 60_000, H = 3_600_000, D = 86_400_000;
  const checks: [string, number, number, string][] = [
    [`ip:${who.ip}:m`, M, L.ipPerMinute, "You're asking quickly. Wait a minute and try again."],
    [`ip:${who.ip}:h`, H, L.ipPerHour, "Keplar is running in a limited mode right now, and this network has reached its questions for the hour. Please try again later."],
    [`ip:${who.ip}:d`, D, L.ipPerDay, "Keplar is running in a limited mode right now, and this network has reached its questions for today. Please try again later."],
    ...(who.device
      ? ([
          [`dev:${who.device}:m`, M, L.devicePerMinute, "You're asking quickly. Wait a minute and try again."],
          [`dev:${who.device}:d`, D, L.devicePerDay, "Keplar is running in a limited mode right now, and you've reached its questions for today. Please try again later."],
        ] as [string, number, number, string][])
      : []),
    ["instance:h", H, L.instancePerHour, "Keplar is busy and running in a limited mode right now. Please try again in a few minutes."],
  ];
  for (const [key, ms, max, message] of checks) {
    if (peek(key, ms, now) >= max) {
      const w = windows.get(key)!;
      return { message, retryAfterSec: Math.max(1, Math.ceil((w.start + ms - now) / 1000)) };
    }
  }
  if ((running.get(who.ip) ?? 0) >= L.concurrentPerIp) return { message: "Keplar is still answering your last question. Wait for it to finish, then ask again.", retryAfterSec: 5 };
  for (const [key, ms] of checks) bump(key, ms, now);
  running.set(who.ip, (running.get(who.ip) ?? 0) + 1);
  let done = false;
  return {
    release: () => {
      if (done) return;
      done = true;
      const n = (running.get(who.ip) ?? 1) - 1;
      if (n <= 0) running.delete(who.ip);
      else running.set(who.ip, n);
    },
  };
}

/** Tests: forget every counter. */
export function resetDegradedLimits() {
  windows.clear();
  running.clear();
}

/** True when the request carries something degraded mode does not handle (it needs storage, privacy checks or paid models). */
export function needsFullService(req: KeplarRequest): boolean {
  return Boolean(req.media || req.docs?.length || req.attachments?.length || req.liveResearch || req.tools || req.projectId || req.specialistId || req.modes?.create || req.modes?.agent || req.modes?.deepResearch);
}

/**
 * The request as the engine sees it in degraded mode: the question and the conversation so far (clamped to Free's size), quick
 * depth, one model, Free plan, private (nothing kept or learned). Web, debate and reason are dropped (they cost more requests).
 */
export function degradedRequest(req: KeplarRequest, maxHistoryChars: number, clamp: (h: NonNullable<KeplarRequest["history"]>, n: number) => NonNullable<KeplarRequest["history"]>): KeplarRequest {
  return {
    prompt: req.prompt,
    history: req.history?.length ? clamp(req.history, maxHistoryChars) : [],
    ...(req.tz ? { tz: req.tz } : {}),
    attachments: [],
    modes: { web: false, deepResearch: false, create: false, agent: false },
    routing: { strategy: "fast", maxModels: 1, depth: "quick", excludeProviders: req.routing?.excludeProviders ?? [], preferOpenWeights: req.routing?.preferOpenWeights, excludeProviderRetention: req.routing?.excludeProviderRetention },
    plan: "free",
    computeRemaining: Infinity,
    private: true,
  };
}
