/**
 * The owner's view of an app's backend: per-collection record counts, end-user count, storage and AI usage, and the latest
 * records of one collection (draft or live). Read-only here; the owner edits data through the app itself (as admin).
 */
import { errorResponse, json, HttpError } from "@/lib/create/platform/http";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { getSite } from "@/lib/site-builder/store";
import { appSql, ensureAppSchema } from "@/lib/app-runtime/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req); // personal only: end-user data is never shown in a team context
    const site = await getSite(ws, (await params).id);
    if (!site.app) throw new HttpError(400, "Build the app first.");
    const url = new URL(req.url);
    const env = url.searchParams.get("env") === "live" ? "live" : "draft";
    const col = url.searchParams.get("col");
    await ensureAppSchema();
    const [counts, users, files, ai] = await Promise.all([
      appSql("SELECT col, count(*)::int AS n FROM app_records WHERE app_id = $1 AND env = $2 GROUP BY col", [site.id, env]),
      appSql("SELECT count(*)::int AS n FROM app_users WHERE app_id = $1 AND env = $2", [site.id, env]),
      appSql("SELECT count(*)::int AS n, coalesce(sum(size), 0)::bigint AS b FROM app_files WHERE app_id = $1 AND env = $2", [site.id, env]),
      appSql("SELECT coalesce(sum(n), 0)::int AS n FROM app_usage WHERE app_id = $1 AND env = $2 AND kind = 'ai' AND day > current_date - 30", [site.id, env]).catch(() => [{ n: 0 }]),
    ]);
    const spec = site.app.spec;
    let records: unknown[] = [];
    if (col && spec.collections.some((c) => c.name === col)) {
      const rows = await appSql("SELECT id, owner_id, data, created_at FROM app_records WHERE app_id = $1 AND env = $2 AND col = $3 ORDER BY created_at DESC LIMIT 50", [site.id, env, col]);
      records = rows.map((r) => ({ id: r.id, owner: r.owner_id, createdAt: r.created_at, data: typeof r.data === "string" ? JSON.parse(r.data) : r.data }));
    }
    return json({
      env,
      collections: spec.collections.map((c) => ({ name: c.name, label: c.label, count: Number(counts.find((r) => r.col === c.name)?.n ?? 0) })),
      users: Number(users[0]?.n ?? 0),
      files: { count: Number(files[0]?.n ?? 0), bytes: Number(files[0]?.b ?? 0) },
      ai: { calls30d: Number(ai[0]?.n ?? 0) },
      records,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
