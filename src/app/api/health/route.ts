/**
 * GET /api/health: which store the app is using, and (for Postgres) whether a real
 * write/read/delete round trip works. Never returns connection details or env values.
 * The round trip is cached per instance for 60 s, so polling it can't hammer the database.
 * Add `?crons=1` for the last successful run of each scheduled job (ok / late / failed / never).
 * Add `?luau=1` to check that Roblox Cloud's Luau analyzer loads and works here (one fixed snippet, never user input).
 */
import { json } from "@/lib/create/platform/http";
import { cronStatus, healthSummary } from "@/lib/ops/health";
import { checkLuau, LUAU_VERSION } from "@/lib/roblox-cloud/luau-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A snippet with exactly one known syntax error: the analyzer must report it on line 3. */
const PROBE = "local function f()\n  if true then\n";

async function luauProbe() {
  const t = Date.now();
  const r = await checkLuau(PROBE);
  const ok = r.checked && r.problems.length === 1 && r.problems[0]!.kind === "syntax" && r.problems[0]!.line === 3;
  return { ok, version: LUAU_VERSION, ms: Date.now() - t, ...(r.checked ? {} : { reason: r.reason }) };
}

export async function GET(req?: Request) {
  const h = await healthSummary();
  const q = new URL(req?.url ?? "http://x/").searchParams;
  const crons = q.get("crons") === "1" ? await cronStatus() : undefined;
  const luau = q.get("luau") === "1" ? await luauProbe() : undefined;
  return json({ ...h.body, ...(crons ? { crons } : {}), ...(luau ? { luau } : {}) }, { status: h.status });
}
