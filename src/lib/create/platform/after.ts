/**
 * Work that must finish after the response is sent. On Vercel a function instance can be frozen as soon as the response ends, so
 * a bare `void promise` may never complete. Next's `after()` keeps the function alive until the work settles (up to the route's
 * maxDuration). Outside a request (tests, scripts, cron loops that await their own work) the task simply runs now.
 *
 * - keepAlive(promise): work that has already started; the function stays alive until it settles.
 * - keepAlive(() => promise): work that should start once the response has been sent.
 * - await afterResponse(promise): deferred inside a request, awaited outside one.
 * Errors are logged with `label` and never thrown: background work never fails the request that started it.
 */
import { after } from "next/server";

export function keepAlive(task: Promise<unknown> | (() => Promise<unknown>), label = "background"): void {
  const log = (e: unknown) => console.error(`[after] ${label} failed:`, e instanceof Error ? e.message : e);
  if (typeof task === "function") {
    const run = () => Promise.resolve().then(task).catch(log);
    try {
      after(run);
    } catch {
      void run(); // not in a request scope: nothing will freeze this process before the work is done
    }
    return;
  }
  const settled = task.then(() => undefined, log);
  try {
    after(settled);
  } catch {
    /* not in a request scope: the promise is already running */
  }
}

/**
 * Like keepAlive(promise), for callers that would otherwise await the work: inside a request it returns at once and the work
 * finishes after the response; outside one (tests, scripts) it waits for the work, so what follows sees its result.
 */
export async function afterResponse(task: Promise<unknown>, label = "background"): Promise<void> {
  const settled = task.then(() => undefined, (e) => console.error(`[after] ${label} failed:`, e instanceof Error ? e.message : e));
  try {
    after(settled);
    return;
  } catch {
    await settled;
  }
}
