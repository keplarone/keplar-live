import "./setup";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "./helpers/session";
import { POST as opsPOST } from "@/app/api/admin/growth-ops/route";
import { GET as cronGET } from "@/app/api/cron/growth/route";
import { recentAudit } from "@/lib/ops/audit";
import { growthControls, setGrowthControls } from "@/lib/growth/ops/runner";

const prev = { admins: process.env.KEPLAR_ADMIN_EMAILS, cron: process.env.CRON_SECRET, mfa: process.env.KEPLAR_ADMIN_REQUIRE_MFA };
after(() => {
  for (const [k, v] of [["KEPLAR_ADMIN_EMAILS", prev.admins], ["CRON_SECRET", prev.cron], ["KEPLAR_ADMIN_REQUIRE_MFA", prev.mfa]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const post = (cookie: string | null, body: unknown) => new Request("https://keplar.one/api/admin/growth-ops", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

test("growth ops API: 404 for signed-out and non-admin callers; an admin's actions work and are audited", async () => {
  process.env.KEPLAR_ADMIN_EMAILS = "growth-admin@example.com";
  delete process.env.KEPLAR_ADMIN_REQUIRE_MFA;
  assert.equal((await opsPOST(post(null, { action: "pause" }))).status, 404);
  const user = await signIn("growth-user@example.com", "pro");
  assert.equal((await opsPOST(post(user.cookie, { action: "pause" }))).status, 404, "a paying customer is not an admin");
  assert.equal((await growthControls()).paused, false, "nothing changed");
  const admin = await signIn("growth-admin@example.com", "pro");
  const r = await opsPOST(post(admin.cookie, { action: "run", job: "revenue-snapshot" }));
  assert.equal(r.status, 200);
  const j = (await r.json()) as { result: { status: string; summary: string } };
  assert.ok(["ok", "already-ran"].includes(j.result.status), j.result.summary);
  assert.equal((await opsPOST(post(admin.cookie, { action: "run", job: "nope" }))).status, 400);
  assert.equal((await opsPOST(post(admin.cookie, { action: "pause", job: "seo-audit" }))).status, 200);
  assert.ok((await growthControls()).pausedJobs.includes("seo-audit"));
  assert.equal((await opsPOST(post(admin.cookie, { action: "resume", job: "seo-audit" }))).status, 200);
  const audit = await recentAudit(50);
  assert.ok(audit.some((a) => a.action === "growth.run" && a.detail === "revenue-snapshot"));
  assert.ok(audit.some((a) => a.action === "growth.pause" && a.detail === "seo-audit"));
});

test("growth cron: 401 without the cron secret or with a wrong one; paused jobs are skipped, not run", async () => {
  process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
  assert.equal((await cronGET(new Request("https://keplar.one/api/cron/growth"))).status, 401);
  assert.equal((await cronGET(new Request("https://keplar.one/api/cron/growth", { headers: { authorization: "Bearer wrong" } }))).status, 401);
  await setGrowthControls({ paused: true }, "test");
  const r = await cronGET(new Request("https://keplar.one/api/cron/growth", { headers: { authorization: "Bearer cron-secret-for-tests-0123456789" } }));
  assert.equal(r.status, 200);
  const j = (await r.json()) as { results: { job: string; status: string; summary: string }[] };
  assert.ok(j.results.length > 0);
  assert.ok(j.results.every((x) => x.status === "skipped"), JSON.stringify(j.results));
  await setGrowthControls({ paused: false }, "test");
});
