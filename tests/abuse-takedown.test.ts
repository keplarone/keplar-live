import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, jsonReq, signIn } from "./helpers/session";
import { abuseReports, projects } from "@/lib/create/repo";
import { sites } from "@/lib/site-builder/store";

/*
 * A1: a single anonymous CSAM/NCII report must not take any published site down for good. Immediate takedown needs a verified
 * signed-in reporter or 3 distinct reporters in 24 h; otherwise the report is urgent and waits for an admin. Admins can restore.
 */
process.env.KEPLAR_ADMIN_EMAILS = "abuse-admin@example.com";

const sitesRoute = () => import("@/app/api/sites/route");
const liveRoute = () => import("@/app/s/[slug]/[[...path]]/route");
const inbox = () => import("@/app/api/admin/inbox/route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const lctx = (slug: string, path?: string[]) => ({ params: Promise.resolve({ slug, path }) });

async function published(email: string): Promise<{ id: string; slug: string; workspaceId: string }> {
  const { cookie, workspaceId } = await signIn(email, "plus");
  const res = await (await sitesRoute()).POST(jsonReq(cookie, "/api/sites", "POST", { name: `Site ${email}`, template: "blank" }));
  assert.equal(res.status, 201, await res.clone().text());
  const site = ((await res.json()) as { site: { id: string; slug: string } }).site;
  const pub = await import("@/app/api/sites/[id]/publish/route");
  const r = await pub.POST(jsonReq(cookie, `/api/sites/${site.id}/publish`, "POST"), ctx(site.id));
  assert.equal(r.status, 200, await r.clone().text());
  return { ...site, workspaceId };
}
const report = async (slug: string, ip: string, reason = "csam", cookie: string | null = null) =>
  (await liveRoute()).POST(
    new Request(`https://keplar.one/s/${slug}/_report`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) }, body: new URLSearchParams({ reason, details: "report" }).toString() }),
    lctx(slug, ["_report"]),
  );
const live = async (slug: string) => (await (await liveRoute()).GET(call(null, `/s/${slug}`), lctx(slug))).status;

test("one anonymous CSAM report keeps the site up but files an urgent report; repeats from one IP don't count twice", async () => {
  const s = await published("abuse-owner-1@example.com");
  assert.equal((await report(s.slug, "203.0.113.10")).status, 303);
  assert.equal(await live(s.slug), 200);
  assert.equal((await report(s.slug, "203.0.113.10", "ncii")).status, 303);
  assert.equal(await live(s.slug), 200);
  const rows = await abuseReports().list(s.workspaceId, (r) => r.target === `site:${s.slug}`);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.urgent && !r.autoTakedown && r.reporterKey?.startsWith("ip:") && !r.reporterKey.includes("203.0.113.10")));
  assert.equal((await sites().get(s.workspaceId, s.id))?.takenDown, false);
});

test("three distinct anonymous reporters within 24 h take the site down", async () => {
  const s = await published("abuse-owner-2@example.com");
  await report(s.slug, "198.51.100.1");
  await report(s.slug, "198.51.100.2");
  assert.equal(await live(s.slug), 200);
  await report(s.slug, "198.51.100.3", "ncii");
  assert.equal(await live(s.slug), 451);
});

test("a verified signed-in reporter takes the site down at once; an admin restores it from the inbox", async () => {
  const s = await published("abuse-owner-3@example.com");
  const reporter = await signIn("abuse-reporter@example.com");
  await report(s.slug, "192.0.2.50", "csam", reporter.cookie);
  assert.equal(await live(s.slug), 451);
  const row = (await abuseReports().list(s.workspaceId, (r) => r.target === `site:${s.slug}`))[0];
  assert.ok(row.autoTakedown && row.verifiedReporter);

  // Non-admins can't see or act on the inbox.
  const { POST, GET } = await inbox();
  assert.equal((await POST(jsonReq(reporter.cookie, "/api/admin/inbox", "POST", { kind: "abuse", id: row.id, status: "restore" }))).status, 404);
  assert.equal((await GET(call(reporter.cookie, "/api/admin/inbox"))).status, 404);

  const admin = await signIn("abuse-admin@example.com");
  const list = (await (await GET(call(admin.cookie, "/api/admin/inbox"))).json()) as { abuse: { id: string; urgent: boolean }[] };
  assert.ok(list.abuse.find((r) => r.id === row.id)?.urgent);
  const res = await POST(jsonReq(admin.cookie, "/api/admin/inbox", "POST", { kind: "abuse", id: row.id, status: "restore" }));
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(await live(s.slug), 200);
  assert.equal((await abuseReports().get(s.workspaceId, row.id))?.status, "actioned");
  assert.equal((await POST(jsonReq(admin.cookie, "/api/admin/inbox", "POST", { kind: "abuse", id: row.id, status: "takedown" }))).status, 200);
  assert.equal(await live(s.slug), 451);
  assert.equal((await POST(jsonReq(admin.cookie, "/api/admin/inbox", "POST", { kind: "abuse", id: row.id, status: "explode" }))).status, 400);
});

test("legacy /api/create/abuse: one anonymous CSAM report on a project no longer takes it down; admin restore works for projects", async () => {
  const t = new Date().toISOString();
  await projects().insert({ id: "prj_abuse_legacy", workspaceId: "ws_abuse_legacy", name: "Legacy", slug: "legacy-abuse", kind: "site", spec: null, draftVersion: 0, files: [], messages: [], liveDeployId: null, publishedAt: t, scan: null, takenDown: false, createdAt: t, updatedAt: t } as never);
  const legacy = await import("@/app/api/create/abuse/route");
  const post = (ip: string) => legacy.POST(new Request("https://keplar.one/api/create/abuse", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ target: "legacy-abuse", reason: "csam" }) }));
  assert.equal((await post("203.0.113.77")).status, 201);
  assert.equal((await projects().get("ws_abuse_legacy", "prj_abuse_legacy"))?.takenDown, false);
  await post("203.0.113.78");
  const res = await post("203.0.113.79");
  assert.equal(res.status, 201);
  assert.equal((await projects().get("ws_abuse_legacy", "prj_abuse_legacy"))?.takenDown, true);
  const id = ((await res.json()) as { report: { id: string } }).report.id;
  const admin = await signIn("abuse-admin@example.com");
  assert.equal((await (await inbox()).POST(jsonReq(admin.cookie, "/api/admin/inbox", "POST", { kind: "abuse", id, status: "restore" }))).status, 200);
  assert.equal((await projects().get("ws_abuse_legacy", "prj_abuse_legacy"))?.takenDown, false);
});
