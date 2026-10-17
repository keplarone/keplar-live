/**
 * GET /api/health: which store the app is using, and (for Postgres) whether a real
 * write/read/delete round trip works. Never returns connection details or env values.
 * The round trip is cached per instance for 60 s, so polling it can't hammer the database.
 * Add `?crons=1` for the last successful run of each scheduled job (ok / late / failed / never).
 */
import { json } from "@/lib/create/platform/http";
import { cronStatus, healthSummary } from "@/lib/ops/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req?: Request) {
  const h = await healthSummary();
  const q = new URL(req?.url ?? "http://x/").searchParams;
  const crons = q.get("crons") === "1" ? await cronStatus() : undefined;
  return json({ ...h.body, ...(crons ? { crons } : {}) }, { status: h.status });
}
