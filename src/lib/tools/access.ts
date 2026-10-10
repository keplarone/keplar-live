/** Server-side access checks shared by the Slides and Study routes. */
import { HttpError } from "@/lib/create/platform/http";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { canUseSlides } from "./limits";

export const SLIDES_PLAN_MESSAGE = "The slideshow creator is available on Keplar Plus and Pro.";

/**
 * Slides: a signed-in Plus, Pro or admin account. Signed out is 401; Free is 403 with `upgradeTo: "plus"`.
 * Every /api/slides route starts here, so the lock never depends on the page.
 */
export async function slidesWorkspace(req: Request): Promise<Workspace> {
  const ws = await currentWorkspace(req); // 401 when signed out
  if (!canUseSlides(ws.plan)) throw new HttpError(403, SLIDES_PLAN_MESSAGE, "plan_required", { upgradeTo: "plus", plan: ws.plan });
  return ws;
}

/** Study: any signed-in account (sets and progress are stored per user). Signed out is 401. */
export async function studyWorkspace(req: Request): Promise<Workspace> {
  return currentWorkspace(req);
}

/** A per-account counter that holds across instances (Postgres) and throws a 429 with `message`. */
export async function dailyLimit(key: string, max: number, what: string) {
  try {
    await rateLimit(key, max, 86_400, { shared: true });
  } catch {
    throw new HttpError(429, `You've reached today's limit for ${what}. It resets within 24 hours.`, "daily_limit");
  }
}

export async function minuteLimit(key: string, max: number) {
  try {
    await rateLimit(key, max, 60, { shared: true });
  } catch {
    throw new HttpError(429, "You're going quickly. Wait a few seconds and try again.", "rate_limited");
  }
}
