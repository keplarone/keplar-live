/**
 * Real operational telemetry for /admin (nothing is estimated or invented):
 *  - model_calls: one row per provider call (model, provider, ok/reason, latency, billed USD)
 *  - system_spend_minute: provider spend per UTC minute, for the spike detector
 * Writes are fire-and-forget (a metering hiccup never fails a request) and bounded.
 */
import { keepAlive } from "@/lib/create/platform/after";
import { isStoreUnavailable } from "@/lib/create/platform/neon";
import { collection } from "@/lib/create/platform/store";
import { id, now } from "@/lib/create/platform/ids";
import { alertOwner } from "@/lib/accounts/alerts";
import { autoPaused, opsControls, setControls } from "./controls";
import { writeAudit } from "./audit";
import { maybePrune } from "./retention";
import { noteModelCall } from "./request-cost";

export type ModelCallRow = { id: string; workspaceId: string; at: string; model: string; vendor: string; provider: string; ok: boolean; reason: string; latencyMs: number; usd: number };
const calls = () => collection<ModelCallRow>("model_calls");
const SYSTEM = "system";

export function recordModelCall(c: Omit<ModelCallRow, "id" | "workspaceId" | "at">): void {
  maybePrune();
  noteModelCall({ model: c.model, ok: c.ok, usd: c.usd, reason: c.reason, latencyMs: c.latencyMs, provider: c.provider }); // attributes the call to the /api/keplar request in progress, if any
  keepAlive(
    calls()
      .insert({ id: id("mc"), workspaceId: SYSTEM, at: now(), ...c, usd: Number.isFinite(c.usd) ? Math.max(0, c.usd) : 0, latencyMs: Math.max(0, Math.round(c.latencyMs || 0)) })
      .catch((e) => { if (!isStoreUnavailable(e)) console.error("[ops] model call not recorded:", e instanceof Error ? e.name : "error"); }),
    "model call",
  );
}

/* ── spend spike detector ─────────────────────────────────────────────── */

type MinuteRow = { id: string; workspaceId: string; m: string; usd: number };
const minutes = () => collection<MinuteRow>("system_spend_minute");
const minuteKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 16); // 2026-10-02T16:41

export const spikeConfig = () => {
  const n = (k: string, d: number) => (Number.isFinite(Number(process.env[k])) && Number(process.env[k]) > 0 ? Number(process.env[k]) : d);
  return { windowMin: n("KEPLAR_SPIKE_WINDOW_MIN", 5), usdInWindow: n("KEPLAR_SPIKE_USD", 8), pauseMin: n("KEPLAR_SPIKE_PAUSE_MIN", 15) };
};

/** Pure: total of the last `windowMin` minute buckets. */
export const sumWindow = (buckets: Record<string, number>, windowMin: number, at = Date.now()) => {
  let t = 0;
  for (let i = 0; i < windowMin; i++) t += buckets[minuteKey(at - i * 60_000)] ?? 0;
  return t;
};

/**
 * Called from the shared spend recorder. Adds to this minute's bucket, then checks the rolling window.
 * Over the limit: pause media and Free for `pauseMin` (auto, reversible), write the audit log, alert the owner once.
 * It never stops paid text: a real surge of paying users must keep working (the global cap and per-user limits still apply).
 */
let lastCheck = 0;
export async function recordMinuteSpend(usd: number, at = Date.now()): Promise<void> {
  if (!(usd > 0)) return;
  try {
    const key = minuteKey(at);
    await minutes().increment(SYSTEM, key, { usd }, { id: key, workspaceId: SYSTEM, m: key, usd: 0 });
    if (at - lastCheck < 10_000) return; // one window check per instance per 10 s is plenty
    lastCheck = at;
    const cfg = spikeConfig();
    const rows = await minutes().listSystemRange({ field: "m", gte: minuteKey(at - (cfg.windowMin - 1) * 60_000) }, 60);
    const total = rows.reduce((t, r) => t + (r?.usd ?? 0), 0);
    if (total < cfg.usdInWindow) return;
    const c = await opsControls();
    if (autoPaused(c, at)) return;
    const until = new Date(at + cfg.pauseMin * 60_000).toISOString();
    await setControls({ autoPauseUntil: until, reason: `Spend spike: $${total.toFixed(2)} in ${cfg.windowMin} min` }, "system:spike-detector");
    await writeAudit("system:spike-detector", "auto_pause", `$${total.toFixed(2)} in ${cfg.windowMin} min (limit $${cfg.usdInWindow}). Media + Free paused until ${until}.`);
    await alertOwner("Spend spike: media and Free auto-paused", `Provider spend was $${total.toFixed(2)} in the last ${cfg.windowMin} minutes (limit $${cfg.usdInWindow}).\nImage/video and Free usage are paused until ${until}. Review /admin; use the kill switches if this is abuse.`).catch(() => undefined);
  } catch (e) {
    console.error("[ops] spike check failed:", e instanceof Error ? e.name : "error");
  }
}

/** Run `job` after the response when inside a request (Next `after`), otherwise just start it. Errors are swallowed. */
export function background(job: () => Promise<unknown>): void {
  const run = () => job().catch(() => undefined);
  void import("next/server")
    .then(({ after }) => {
      try {
        after(run);
      } catch {
        void run();
      }
    })
    .catch(() => void run());
}
