import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn, call } from "./helpers/session";
import { totpAt } from "../src/lib/accounts/mfa/totp";
import { adminMfaRequired } from "../src/lib/ops/admin-auth";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
const prev = { admins: process.env.KEPLAR_ADMIN_EMAILS, mfa: process.env.KEPLAR_ADMIN_REQUIRE_MFA };
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
  process.env.KEPLAR_ADMIN_EMAILS = "admin-mfa@example.com";
});
after(() => {
  fake?.restore();
  for (const [k, v] of [["KEPLAR_ADMIN_EMAILS", prev.admins], ["KEPLAR_ADMIN_REQUIRE_MFA", prev.mfa]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("KEPLAR_ADMIN_REQUIRE_MFA: off by default, on only for clear yes values", () => {
  assert.equal(adminMfaRequired({}), false);
  for (const v of ["1", "true", "ON", " yes "]) assert.equal(adminMfaRequired({ KEPLAR_ADMIN_REQUIRE_MFA: v }), true, v);
  for (const v of ["0", "false", "", "maybe"]) assert.equal(adminMfaRequired({ KEPLAR_ADMIN_REQUIRE_MFA: v }), false, v);
});

test("with KEPLAR_ADMIN_REQUIRE_MFA on, an admin without an authenticator app gets 404 on admin APIs; with one, admin works", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const overview = await import("../src/app/api/admin/overview/route");
  const status = (cookie: string) => overview.GET(call(cookie, "/api/admin/overview")).then((r) => r.status);
  const admin = await signIn("admin-mfa@example.com");

  delete process.env.KEPLAR_ADMIN_REQUIRE_MFA;
  assert.equal(await status(admin.cookie), 200, "flag off: today's behavior (email-only admin)");

  process.env.KEPLAR_ADMIN_REQUIRE_MFA = "1";
  assert.equal(await status(admin.cookie), 404, "flag on, no authenticator app: not an admin");

  const { auth } = await import("../src/lib/accounts/auth");
  const uid = (await auth.api.getSession({ headers: new Headers({ cookie: admin.cookie }) }))!.user.id;
  const store = await import("../src/lib/accounts/mfa/store");
  const { secret } = await store.beginSetup(uid, "admin-mfa@example.com");
  const t0 = Date.now();
  assert.ok((await store.confirmSetup(uid, totpAt(secret, t0), t0)).ok);
  assert.equal(await status(admin.cookie), 200, "authenticator on: admin again (new sign-ins now need the code)");

  const plain = await signIn("not-admin-mfa@example.com");
  assert.equal(await status(plain.cookie), 404, "a non-admin is still refused");
});
