/** Server start hook: installs the cost meter on every Node instance; mock mode only: optional in-process agent scheduler. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Every provider call (OpenRouter, OpenAI, Anthropic, Google, xAI, NVIDIA, Higgsfield) is metered and guarded (src/lib/cost/meter.ts).
  await import("./lib/cost/meter").then((m) => m.installCostMeter()).catch((e) => console.error("[cost] meter not installed:", e instanceof Error ? e.message : "error"));
  if (process.env.KEPLAR_LOCAL_SCHEDULER !== "1") return;
  const { inngestEnabled } = await import("./lib/inngest/client");
  if (inngestEnabled()) return; // Inngest cron owns schedules.
  const { startLocalScheduler } = await import("./lib/business/local-scheduler");
  startLocalScheduler();
}

/** Next.js hook: every unhandled error in a route handler, server component or action lands in the error tracker (ops/errors.ts). */
export async function onRequestError(err: unknown, request: { path?: string }, context: { routePath?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./lib/ops/errors");
  const e = err as { name?: string; message?: string; digest?: string };
  await recordError({ source: "server", name: e?.name, message: e?.message, route: context?.routePath || request?.path, sample: e?.digest });
}
