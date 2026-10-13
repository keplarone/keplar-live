import { download, downloaded, jobOf, renderOwner } from "@/lib/blender-cloud/api";
import { jobView } from "@/lib/blender-cloud/model";
import { body, errorResponse, json } from "@/lib/create/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 *   POST {}             -> { url, token, files }: wakes the machine and lets the desktop app fetch the renders with the token
 *   POST { done: true } -> { job }: the files are on the computer; the machine stops again
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await renderOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    const b = await body<{ done?: unknown }>(req).catch(() => ({}) as { done?: unknown });
    if (b.done === true) return json({ job: jobView(await downloaded(ws, job)) }, NO_STORE);
    return json(await download(ws, job), NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}
