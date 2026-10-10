/**
 * Durable jobs + schedules. Production: Inngest (durable steps, retries,
 * cron, concurrency keys per workspace) so agents and long media jobs run
 * server-side 24/7. Jobs with an Inngest function (INNGEST_JOBS, currently
 * agent.run) are sent to Inngest when it is enabled; everything else, and
 * everything in mock mode, runs on in-process timers, which stop when the
 * server stops (media.run: PLACEHOLDER until its Inngest function exists).
 */
import { INNGEST_JOBS, inngest, inngestEnabled } from "@/lib/inngest/client";

type Handler = (payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<string, Handler>();

export function defineJob(name: string, handler: Handler) {
  handlers.set(name, handler);
}

export async function enqueue(name: string, payload: Record<string, unknown>, opts: { delayMs?: number } = {}) {
  const event = INNGEST_JOBS[name];
  if (event && inngestEnabled()) {
    await inngest.send({ name: event, data: payload, ...(opts.delayMs ? { ts: Date.now() + opts.delayMs } : {}) });
    return;
  }
  const h = handlers.get(name);
  if (!h) throw new Error(`No job handler registered for "${name}"`);
  setTimeout(() => {
    h(payload).catch((err) => console.error(`[queue] job ${name} failed`, err));
  }, opts.delayMs ?? 0);
}
