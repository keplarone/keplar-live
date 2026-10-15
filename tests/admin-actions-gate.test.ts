import "./setup";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { jsonReq, signIn, call } from "./helpers/session";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { createShare, sanitizeSnapshot } from "@/lib/growth/share";
import { openPublic, publishShare } from "@/lib/growth/share-public";
import { PATCH as templatesPatch } from "@/app/api/templates/route";
import { PATCH as sharePatch } from "@/app/api/share/route";

/* A7: template moderation and public-page takedown go through the full admin gate (requireAdmin/adminFromHeaders), so the admin
   MFA requirement applies, not just the workspace's admin flag. */
const prev = { admins: process.env.KEPLAR_ADMIN_EMAILS, mfa: process.env.KEPLAR_ADMIN_REQUIRE_MFA };
after(() => {
  for (const [k, v] of [["KEPLAR_ADMIN_EMAILS", prev.admins], ["KEPLAR_ADMIN_REQUIRE_MFA", prev.mfa]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("with admin MFA required, an admin without an authenticator can't moderate templates or take down shared pages", async () => {
  process.env.KEPLAR_ADMIN_EMAILS = "gate-admin@example.com";
  const admin = await signIn("gate-admin@example.com", "pro");
  assert.equal((await currentWorkspace(call(admin.cookie, "/api/share"))).admin, true, "the workspace flag alone says admin");

  const owner = await signIn("gate-owner@example.com", "free");
  const markdown = "Use a JSONB column for preferences that change shape, and a normal column for anything you filter on. ".repeat(6);
  const snap = sanitizeSnapshot({ markdown, question: "Should I store user preferences as JSONB or in columns?", consensus: { level: "consensus", agree: 3, disagree: 0, responded: 3, consulted: 3 }, models: [{ name: "Model A", provider: "P", slot: "panel", status: "responded", stance: "JSONB" }] }, true) as Exclude<ReturnType<typeof sanitizeSnapshot>, string>;
  assert.equal(typeof snap, "object", String(snap));
  const share = await createShare(owner.workspaceId, snap);
  const pub = (await publishShare(owner.workspaceId, share.token)) as { ok: true; slug: string };
  assert.equal(pub.ok, true, JSON.stringify(pub));

  process.env.KEPLAR_ADMIN_REQUIRE_MFA = "1";
  assert.equal((await templatesPatch(jsonReq(admin.cookie, "/api/templates", "PATCH", { slug: "no-such-template", status: "hidden" }))).status, 403);
  assert.equal((await sharePatch(jsonReq(admin.cookie, "/api/share", "PATCH", { slug: pub.slug, takedown: true }))).status, 403);
  assert.ok(await openPublic(pub.slug), "still public");

  delete process.env.KEPLAR_ADMIN_REQUIRE_MFA;
  assert.equal((await templatesPatch(jsonReq(admin.cookie, "/api/templates", "PATCH", { slug: "no-such-template", status: "hidden" }))).status, 404, "past the gate: no such template");
  assert.equal((await sharePatch(jsonReq(admin.cookie, "/api/share", "PATCH", { slug: pub.slug, takedown: true }))).status, 200);
  assert.equal(await openPublic(pub.slug), null);
});
