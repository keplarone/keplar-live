/**
 * Page-view counters (src/lib/business/traffic.ts), run against both backends: tests/pageview-counters.test.ts (file store) and
 * tests/pageview-counters-neon.test.ts (Postgres semantics through PGlite).
 */
import assert from "node:assert/strict";
import { pageViewCounts, pageViews } from "@/lib/business/repo";
import { countView, KEEP_DAYS, pruneOldViews, viewsByDay } from "@/lib/business/traffic";
import { summarize } from "@/lib/site-builder/features/analytics";
import { dashboard } from "@/lib/business/dashboard";
import { testWorkspace } from "./workspace";

const dayAgo = (n: number, at = Date.now()) => new Date(at - n * 864e5).toISOString().slice(0, 10);

/** Many views of one site on one day: a handful of counter rows, exact totals even when every view lands at once. */
export async function countersAreAtomicAndSmall(ws: string) {
  const site = `sit_${ws}`;
  const today = dayAgo(0);
  const views = 200;
  await Promise.all(
    Array.from({ length: views }, (_, i) => countView({ workspaceId: ws, projectId: site, path: i % 4 === 0 ? "/menu" : "/", day: today, ref: i % 10 === 0 ? "google.com" : undefined, newVisitor: i % 5 === 0 })),
  );
  const rows = await pageViewCounts().list(ws);
  const day = rows.find((r) => r.kind === "day")!;
  assert.equal(day.views, views, "no increment lost");
  assert.equal(day.visitors, views / 5);
  assert.deepEqual(rows.filter((r) => r.kind === "path").map((r) => [r.key, r.views]).sort(), [["/", 150], ["/menu", 50]]);
  assert.deepEqual(rows.filter((r) => r.kind === "ref").map((r) => [r.key, r.views]), [["google.com", 20]]);
  assert.equal(rows.length, 4, `rows stored for ${views} views: ${rows.length} (one per view before)`);
  return { views, rows: rows.length };
}

/** Readers include both the new counters and legacy per-view rows (until they age out). */
export async function readersMergeLegacyAndCounters(label: string) {
  const w = await testWorkspace(label, "business");
  const site = { id: `sit_${label}`, workspaceId: w.id };
  const today = dayAgo(0);
  const twoDays = dayAgo(2);
  // Legacy rows: one per view, with a visitor mark and referrer (as recordSiteView wrote them before).
  const legacy = (i: number, day: string, v: string, ref?: string, path = "/") => pageViews().insert({ id: `pv_${label}_${i}`, workspaceId: w.id, projectId: site.id, path, day, at: `${day}T08:00:00.000Z`, v, ...(ref ? { ref } : {}) });
  await legacy(1, twoDays, "m1", "news.example");
  await legacy(2, twoDays, "m1");
  await legacy(3, twoDays, "m2", undefined, "/menu");
  await legacy(4, dayAgo(40), "m3"); // outside a 30-day summary, still inside retention
  // New counters, same site.
  await countView({ workspaceId: w.id, projectId: site.id, path: "/", day: today, ref: "news.example", newVisitor: true });
  await countView({ workspaceId: w.id, projectId: site.id, path: "/menu", day: today, newVisitor: false });
  await countView({ workspaceId: w.id, projectId: site.id, path: "/", day: twoDays, newVisitor: true });
  // Another site of the same workspace and another workspace never mix into this site's numbers.
  await countView({ workspaceId: w.id, projectId: "sit_other", path: "/", day: today, newVisitor: true });
  await countView({ workspaceId: "ws_elsewhere", projectId: site.id, path: "/", day: today, newVisitor: true });

  const s = await summarize(site, 30);
  assert.equal(s.views, 6, "3 legacy + 3 counted");
  assert.equal(s.series.find((d) => d.day === twoDays)?.views, 4);
  assert.equal(s.series.find((d) => d.day === twoDays)?.visitors, 3, "2 legacy marks + 1 counted visitor");
  assert.equal(s.series.at(-1)?.views, 2);
  assert.equal(s.series.at(-1)?.visitors, 1);
  assert.deepEqual(s.pages, [{ path: "/", views: 4 }, { path: "/menu", views: 2 }]);
  assert.deepEqual(s.referrers, [{ host: "news.example", views: 2 }]);

  // Business dashboard: the 14-day per-day counts read the counters too (all sites of the workspace).
  const d = await dashboard(w);
  assert.equal(d.traffic.days.length, 14);
  assert.equal(d.traffic.days.at(-1)?.views, 3, "today: 2 on this site + 1 on the other");
  assert.equal(d.traffic.days.find((x) => x.day === twoDays)?.views, 4);
  assert.equal(d.traffic.last14, 7);
  assert.equal(d.conversion.views, 7);
  const m = await viewsByDay(w.id, dayAgo(13), new Date(Date.now() - 14 * 864e5).toISOString());
  assert.equal(m.get(dayAgo(40)), undefined, "older than the window: not read");
}

/** Retention: one bulk delete per collection, for every site at once; recent rows stay. */
export async function pruneIsBulk(label: string, statements?: () => number) {
  const at = Date.now();
  const old = dayAgo(KEEP_DAYS + 5, at);
  const recent = dayAgo(KEEP_DAYS - 5, at);
  const n = 300;
  for (let i = 0; i < n; i++) await pageViews().insert({ id: `pv_old_${label}_${i}`, workspaceId: `ws_${label}_${i % 3}`, projectId: `sit_${i % 7}`, path: "/", day: old, at: `${old}T10:00:00.000Z` });
  await pageViews().insert({ id: `pv_recent_${label}`, workspaceId: `ws_${label}_0`, projectId: "sit_1", path: "/", day: recent, at: `${recent}T10:00:00.000Z` });
  for (let i = 0; i < 20; i++) await countView({ workspaceId: `ws_${label}_${i % 3}`, projectId: `sit_${i}`, path: "/", day: old });
  await countView({ workspaceId: `ws_${label}_0`, projectId: "sit_1", path: "/", day: recent });
  const before = statements?.() ?? 0;
  const out = await pruneOldViews(at);
  const used = (statements?.() ?? 0) - before;
  assert.ok(out.legacy >= n, JSON.stringify(out));
  assert.ok(out.counts >= 40, JSON.stringify(out));
  assert.ok(await pageViews().get(`ws_${label}_0`, `pv_recent_${label}`), "recent legacy views stay");
  assert.equal((await pageViewCounts().list(`ws_${label}_0`)).filter((r) => r.day === recent).length, 2, "recent counters stay");
  assert.equal((await pageViews().list(`ws_${label}_1`)).length, 0);
  return { legacyDeleted: out.legacy, countersDeleted: out.counts, statements: used };
}
