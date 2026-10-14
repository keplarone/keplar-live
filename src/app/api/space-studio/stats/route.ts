import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { spaceOwner } from "@/lib/space-studio/account";
import { parseRange, statsFor } from "@/lib/space-studio/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?universe=<id|all>&range=1h|24h|7d|30d|90d ->
 *   { range, universe, now: { playing, visits, favorites, at } | null,
 *     ccu: { points: [{ t, v }], peak, sampledSince }, revenue: { connected, points, total, sales, bySource: { product, gamepass } },
 *     robux: { earned, pending, pendingWindowHours: 72, lastSaleAt } }
 * Every number comes from Roblox's public APIs (sampled by Space Studio) or from the experience's own beacon; see src/lib/space-studio/stats.ts.
 */
export async function GET(req: Request) {
  try {
    const ws = await spaceOwner(req, false);
    await rateLimit(`space-stats:${ws.id}`, 60, 60, { shared: true });
    const url = new URL(req.url);
    const universe = url.searchParams.get("universe") ?? "all";
    if (universe !== "all" && !/^\d{1,20}$/.test(universe)) throw new HttpError(400, "universe must be a universe id or all.", "bad_universe");
    return json(await statsFor(ws.id, universe, parseRange(url.searchParams.get("range"))));
  } catch (e) {
    return errorResponse(e);
  }
}
