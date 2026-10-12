import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { flightByRequest, flightsLastDay, recentFlights, summarizeFlights } from "@/lib/ops/flight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin only. Execution timelines (src/lib/ops/flight.ts), text-free by construction.
 *   GET ?req=<x-request-id>          one request's timeline
 *   GET ?view=failed|all&limit=50    recent requests (without events) and a 24 h summary
 */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:flight:${admin.email}`, 60);
    const q = new URL(req.url).searchParams;
    const reqId = q.get("req");
    if (reqId) {
      const row = await flightByRequest(reqId);
      if (!row) throw new HttpError(404, "No timeline for that request id (older than the retention window, or it never reached the engine).", "not_found");
      return json({ flight: row });
    }
    const view = q.get("view") === "all" ? undefined : "failed";
    const limit = Number(q.get("limit") ?? 50);
    const [recent, day] = await Promise.all([recentFlights({ outcome: view, limit: Number.isFinite(limit) ? limit : 50 }), flightsLastDay()]);
    return json({ recent, summary24h: summarizeFlights(day) });
  } catch (e) {
    return errorResponse(e);
  }
}
