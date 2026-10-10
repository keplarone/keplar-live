/**
 * Optional in-process scheduler for mock mode (KEPLAR_LOCAL_SCHEDULER=1, no Inngest).
 * Ticks once a minute; stops with the server. Started from src/instrumentation.ts.
 */
import { tick } from "./scheduler";

let timer: ReturnType<typeof setInterval> | null = null;

export function startLocalScheduler(intervalMs = 60_000) {
  if (timer) return;
  const run = () =>
    tick()
      .then((r) => r.due && console.log(`[scheduler] ${r.due} due run(s):`, r.results.map((x) => `${x.agentId}@${x.slot}=${x.outcome}`).join(", ")))
      .catch((e) => console.error("[scheduler] tick failed", e instanceof Error ? e.message : e));
  timer = setInterval(run, intervalMs);
  timer.unref?.();
  console.log("[scheduler] local mock scheduler started (KEPLAR_LOCAL_SCHEDULER=1)");
}
