/**
 * Pay-as-you-go overage settings (OWNER-PENDING, flag `overage`, default OFF).
 *   GET  (signed-in) → { enabled: false } while off; otherwise opt-in state, monthly cap, usage this month, thresholds.
 *   PUT  { optedIn?: boolean, capUsd?: number } (signed-in, verified Plus/Pro accounts).
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { requireAccount } from "@/lib/create/platform/workspace";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { overageStatus, setOverage } from "@/lib/cost/overage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await requireAccount(req);
    return json(await overageStatus(ws));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const ws = await requireAccount(req);
    await rateLimit(`ws:${ws.id}:overage`, 20, 60);
    const b = await body<{ optedIn?: unknown; capUsd?: unknown }>(req);
    try {
      await setOverage(ws, b);
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st) throw new HttpError(st, (e as Error).message);
      throw e;
    }
    return json(await overageStatus(ws));
  } catch (e) {
    return errorResponse(e);
  }
}
