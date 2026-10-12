import { body, errorResponse, json } from "@/lib/create/platform/http";
import { changes, cloudOwner, jobOf, markApplied } from "@/lib/roblox-cloud/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { headers: { "cache-control": "no-store" } };

/**
 *   GET                 -> { changes: [{ path, className, status, base, baseHash, next, applied }] }  to review and apply in Studio
 *   POST { applied: [] } -> { applied }  marks the scripts the person applied in Studio
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const ws = await cloudOwner(req, false);
    const job = await jobOf(ws, (await ctx.params).id);
    return json({ changes: await changes(ws, job) }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const ws = await cloudOwner(req, true);
    const job = await jobOf(ws, (await ctx.params).id);
    const b = await body<{ applied?: unknown }>(req);
    return json(await markApplied(ws, job, b.applied), NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}
