/**
 * Shared checks for the store's projection / count / lookup methods and the routes that use them, run against both backends
 * (tests/store-hotpaths.test.ts: file store; tests/store-hotpaths-neon.test.ts: Postgres semantics through PGlite).
 */
import assert from "node:assert/strict";
// First: it sets the auth environment (secret, URL, dev tools) before any route module reads it.
import { signIn, call, jsonReq } from "./session";
import { collection } from "@/lib/create/platform/store";
import { chats } from "@/lib/memory/repo";
import { fileRows, noteRows } from "@/lib/projects/repo";
import { pageViews } from "@/lib/business/repo";
import { dashboard } from "@/lib/business/dashboard";
import { domains, projects } from "@/lib/create/repo";
import { resolveSite } from "@/lib/create/serve";
import { GET as chatsGET } from "@/app/api/chats/route";
import { PUT as chatPUT } from "@/app/api/chats/[id]/route";
import { GET as projectsGET, POST as projectsPOST } from "@/app/api/projects/route";
import { MAX_CHATS } from "@/lib/memory/repo";
import { testWorkspace } from "./workspace";

type Doc = { id: string; workspaceId: string; title?: string; projectId?: string | null; heavy?: string; at?: string; n?: number; tag?: unknown };

export async function storeMethods(name: string) {
  const c = collection<Doc>(name);
  const big = "x".repeat(10_000);
  await c.insert({ id: "a", workspaceId: "w1", title: "A", projectId: "p1", heavy: big, at: "2026-01-01T00:00:00.000Z" });
  await c.insert({ id: "b", workspaceId: "w1", title: "B", projectId: null, heavy: big, at: "2026-02-01T00:00:00.000Z" });
  await c.insert({ id: "c", workspaceId: "w1", title: "C", heavy: big, at: "2026-03-01T00:00:00.000Z" }); // no projectId at all
  await c.insert({ id: "d", workspaceId: "w1", title: "D", projectId: "p1", heavy: big, at: "2026-03-05T00:00:00.000Z", tag: 7 });
  await c.insert({ id: "e", workspaceId: "w2", title: "E", projectId: "p1", heavy: big, at: "2026-03-06T00:00:00.000Z" });

  // listFields: only the named keys plus id/workspaceId; a missing key stays missing and a null stays null; other tenants never appear.
  const rows = (await c.listFields("w1", ["title", "projectId"])).sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(rows, [
    { id: "a", workspaceId: "w1", title: "A", projectId: "p1" },
    { id: "b", workspaceId: "w1", title: "B", projectId: null },
    { id: "c", workspaceId: "w1", title: "C" },
    { id: "d", workspaceId: "w1", title: "D", projectId: "p1" },
  ]);
  assert.ok(rows.every((r) => !("heavy" in r)), "the heavy field never comes back");
  assert.deepEqual(await c.listFields("nobody", ["title"]), []);
  await assert.rejects(c.listFields("w1", ["title; DROP TABLE x" as never]), /Invalid field/);

  // count / countBy
  assert.equal(await c.count("w1"), 4);
  assert.equal(await c.count("w2"), 1);
  assert.equal(await c.count("w1", { field: "projectId", value: "p1" }), 2);
  assert.equal(await c.count("w1", { field: "tag", value: "7" }), 0, "only string values match");
  assert.deepEqual([...(await c.countBy("w1", "projectId"))].sort(), [["p1", 2]], "null and missing values are not counted");
  assert.deepEqual([...(await c.countBy("w1", "projectId", { field: "at", gte: "2026-03-01" }))], [["p1", 1]]);
  assert.deepEqual([...(await c.countBy("w1", "title", { field: "at", gte: "2026-01-15", lt: "2026-03-02" }))].sort(), [["B", 1], ["C", 1]]);
  await assert.rejects(c.countBy("w1", "a.b"), /top-level/);

  // listSystemBy / findSystemBy with a workspace scope
  assert.deepEqual((await c.listSystemBy("projectId", "p1")).map((r) => r.id).sort(), ["a", "d", "e"]);
  assert.equal((await c.listSystemBy("projectId", "p1", 1)).length, 1);
  assert.equal((await c.findSystemBy("title", "E", { workspaceId: "w1" })), null, "scoped to the workspace");
  assert.equal((await c.findSystemBy("title", "E", { workspaceId: "w2" }))?.id, "e");
  assert.equal((await c.findSystemBy("title", "E"))?.id, "e");
}

/** GET /api/chats returns the same list shape without loading messages; PUT counts chats instead of listing them. */
export async function chatRoutes(email: string) {
  const u = await signIn(email, "plus");
  const put = (id: string, body: Record<string, unknown>) => chatPUT(jsonReq(u.cookie, `/api/chats/${id}`, "PUT", body), { params: Promise.resolve({ id }) });
  assert.equal((await put("chat_one1", { title: "First", projectId: null, createdAt: 1000, updatedAt: 2000, messages: [{ role: "user", text: "hello" }] })).status, 200);
  assert.equal((await put("chat_two2", { title: "Second", projectId: "prj_abcd", createdAt: 1500, updatedAt: 3000, messages: [{ role: "user", text: "hi" }], specialistId: null })).status, 200);
  const res = await chatsGET(call(u.cookie, "/api/chats"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { chats: Record<string, unknown>[] };
  assert.deepEqual(body.chats, [
    { id: "chat_two2", title: "Second", projectId: "prj_abcd", createdAt: 1500, updatedAt: 3000 },
    { id: "chat_one1", title: "First", projectId: null, createdAt: 1000, updatedAt: 2000 },
  ]);

  // The saved-chat cap still applies to new chats (and never to updates of an existing one).
  for (let i = 0; i < MAX_CHATS - 2; i++) await chats().insert({ id: `chat_fill${i}`, workspaceId: u.workspaceId, title: "f", projectId: null, createdAt: 1, updatedAt: 1, messages: [] });
  const over = await put("chat_over1", { title: "Over", messages: [] });
  assert.equal(over.status, 409);
  assert.equal((await put("chat_one1", { title: "First again", messages: [] })).status, 200);
}

/** GET /api/projects counts notes, files and chats per project in the store. */
export async function projectCounts(email: string) {
  const u = await signIn(email, "plus");
  const mk = async (name: string) => ((await (await projectsPOST(jsonReq(u.cookie, "/api/projects", "POST", { name }))).json()) as { project: { id: string } }).project.id;
  const p1 = await mk("One");
  const p2 = await mk("Two");
  const t = new Date().toISOString();
  await noteRows().insert({ id: "pn_1", workspaceId: u.workspaceId, projectId: p1, text: "a", createdAt: t, updatedAt: t } as never);
  await noteRows().insert({ id: "pn_2", workspaceId: u.workspaceId, projectId: p1, text: "b", createdAt: t, updatedAt: t } as never);
  await fileRows().insert({ id: "pf_1", workspaceId: u.workspaceId, projectId: p2, name: "x.md", text: "x", createdAt: t } as never);
  await chats().insert({ id: "chat_p1a", workspaceId: u.workspaceId, title: "c", projectId: p1, createdAt: 1, updatedAt: 1, messages: [] });
  await chats().insert({ id: "chat_none", workspaceId: u.workspaceId, title: "c", projectId: null, createdAt: 1, updatedAt: 1, messages: [] });
  const body = (await (await projectsGET(call(u.cookie, "/api/projects"))).json()) as { projects: { id: string; counts: Record<string, number> }[] };
  const counts = Object.fromEntries(body.projects.map((p) => [p.id, p.counts]));
  assert.deepEqual(counts[p1], { notes: 2, files: 0, chats: 1 });
  assert.deepEqual(counts[p2], { notes: 0, files: 1, chats: 0 });
}

/** The dashboard's traffic numbers come from the last 14 days only. */
export async function dashboardTraffic(label: string) {
  const ws = await testWorkspace(label, "business");
  const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 864e5);
  const view = (i: number, daysAgo: number) => {
    const at = day(daysAgo).toISOString();
    return pageViews().insert({ id: `pv_${label}_${i}`, workspaceId: ws.id, projectId: "prj_x", path: "/", day: at.slice(0, 10), at });
  };
  await view(1, 0);
  await view(2, 0);
  await view(3, 3);
  await view(4, 20); // outside the window
  await view(5, 400); // long ago
  await pageViews().insert({ id: `pv_${label}_other`, workspaceId: "ws_someone_else", projectId: "p", path: "/", day: day(0).toISOString().slice(0, 10), at: day(0).toISOString() });
  const d = await dashboard(ws);
  assert.equal(d.traffic.last14, 3);
  assert.equal(d.conversion.views, 3);
  assert.equal(d.traffic.days.length, 14);
  assert.equal(d.traffic.days.at(-1)?.views, 2, "today");
  assert.equal(d.traffic.days.find((x) => x.day === day(3).toISOString().slice(0, 10))?.views, 1);
  assert.equal(d.traffic.days.reduce((s, x) => s + x.views, 0), 3);
}

/** Custom-domain routing finds the active domain (exact or www.<apex>) and its project by indexed lookups. */
export async function customDomains(suffix: string) {
  const t = new Date().toISOString();
  const project = { id: `prj_dom${suffix}`, workspaceId: `ws_dom${suffix}`, name: "Site", slug: `dom-site-${suffix}`, kind: "site", spec: null, draftVersion: 0, files: [], messages: [], liveDeployId: "dep_1", publishedAt: t, scan: null, takenDown: false, createdAt: t, updatedAt: t };
  await projects().insert(project as never);
  const dom = (id: string, name: string, status: string, apex: boolean, projectId = project.id) => domains().insert({ id, workspaceId: project.workspaceId, projectId, name, apex, status, records: [], ssl: "issued", provider: "local", createdAt: t, lastCheckedAt: null } as never);
  await dom(`dom_a${suffix}`, `shop${suffix}.example.com`, "pending", false, "prj_wrong"); // same name, not active: never used
  await dom(`dom_b${suffix}`, `shop${suffix}.example.com`, "active", false);
  await dom(`dom_c${suffix}`, `apex${suffix}.example`, "active", true);
  await dom(`dom_d${suffix}`, `noapex${suffix}.example`, "active", false);
  assert.equal((await resolveSite(`shop${suffix}.example.com`))?.id, project.id);
  assert.equal((await resolveSite(`SHOP${suffix}.example.com`))?.id, project.id, "host names are case-insensitive");
  assert.equal((await resolveSite(`www.apex${suffix}.example`))?.id, project.id, "www.<apex> for an apex domain");
  assert.equal(await resolveSite(`www.noapex${suffix}.example`), null, "www. only for apex domains");
  assert.equal(await resolveSite(`unknown${suffix}.example`), null);
  assert.equal((await resolveSite(`dom-site-${suffix}`))?.id, project.id, "slugs still resolve");
}
