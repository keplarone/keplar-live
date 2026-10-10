import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { SoftAuthenticator } from "./helpers/soft-authenticator";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
  process.env.BETTER_AUTH_URL = "https://keplar.one";
});
after(() => fake?.restore());

const ORIGIN = "https://keplar.one";
const RP = "keplar.one";

async function mods() {
  return { w: await import("../src/lib/accounts/passkeys/webauthn"), s: await import("../src/lib/accounts/passkeys/store") };
}
async function register(uid: string, a: SoftAuthenticator, name = "") {
  const { w } = await mods();
  const { options, token } = await w.registrationOptions({ id: uid, email: `${uid}@example.com` });
  return { options, token, res: await w.verifyRegistration({ id: uid }, token, a.create(options.challenge) as never, name) };
}

test("registration stores the passkey; options demand a user-verified, discoverable credential", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { w, s } = await mods();
  const a = new SoftAuthenticator(RP, ORIGIN);
  const { options, res } = await register("u_reg", a, "My laptop");
  assert.equal(options.rp.id, RP);
  assert.equal(options.authenticatorSelection?.userVerification, "required");
  assert.equal(options.authenticatorSelection?.residentKey, "required");
  assert.ok(res.ok);
  const list = await s.listPasskeys("u_reg");
  assert.equal(list.length, 1);
  assert.equal(list[0]!.name, "My laptop");
  assert.deepEqual(Object.keys(s.summarize(list[0]!)).sort(), ["createdAt", "id", "lastUsedAt", "name", "synced"], "the summary never carries the public key");
  // The next registration excludes the passkey that exists already.
  const again = await w.registrationOptions({ id: "u_reg", email: "u_reg@example.com" });
  assert.equal(again.options.excludeCredentials?.length, 1);
});

test("registration refuses: a reused challenge, another user's challenge, a wrong origin, and a credential that is not user-verified", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { w, s } = await mods();
  const a = new SoftAuthenticator(RP, ORIGIN);
  const o = await w.registrationOptions({ id: "u_bad", email: "b@example.com" });
  const good = a.create(o.options.challenge);
  assert.deepEqual(await w.verifyRegistration({ id: "someone_else" }, o.token, good as never, ""), { ok: false, reason: "expired" }, "a challenge issued to one user is useless to another (and is consumed)");
  assert.deepEqual(await w.verifyRegistration({ id: "u_bad" }, o.token, good as never, ""), { ok: false, reason: "expired" }, "single use");

  const o2 = await w.registrationOptions({ id: "u_bad", email: "b@example.com" });
  const evil = new SoftAuthenticator(RP, "https://evil.example");
  assert.deepEqual(await w.verifyRegistration({ id: "u_bad" }, o2.token, evil.create(o2.options.challenge) as never, ""), { ok: false, reason: "invalid" });

  const o3 = await w.registrationOptions({ id: "u_bad", email: "b@example.com" });
  assert.deepEqual(await w.verifyRegistration({ id: "u_bad" }, o3.token, a.create(o3.options.challenge, { flags: 0x01 }) as never, ""), { ok: false, reason: "invalid" }, "presence without verification is not enough");

  const o4 = await w.registrationOptions({ id: "u_bad", email: "b@example.com" });
  assert.deepEqual(await w.verifyRegistration({ id: "u_bad" }, o4.token, a.create("a-different-challenge") as never, ""), { ok: false, reason: "invalid" });
  assert.equal((await s.listPasskeys("u_bad")).length, 0);
});

test("expired challenges are refused", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { s } = await mods();
  const id = await s.saveChallenge("abc", "login", null, Date.now() - (s.CHALLENGE_TTL_SECONDS + 5) * 1000);
  assert.equal(await s.takeChallenge(id, "login", null), null);
  const id2 = await s.saveChallenge("abc", "login", null);
  assert.equal(await s.takeChallenge(id2, "register", null), null, "a sign-in challenge cannot be used to register");
});

test("sign-in: verifies the signature, tells who it is, advances the counter, and cannot be replayed or cloned", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { w, s } = await mods();
  const a = new SoftAuthenticator(RP, ORIGIN, Buffer.from("u_login"));
  assert.ok((await register("u_login", a)).res.ok);

  const l1 = await w.loginOptions();
  assert.equal(l1.options.allowCredentials, undefined, "no email is asked for, so nothing about who has a passkey is revealed");
  assert.equal(l1.options.userVerification, "required");
  const assertion = a.get(l1.options.challenge);
  assert.deepEqual(await w.verifyLogin(l1.token, assertion as never), { ok: true, userId: "u_login" });
  assert.deepEqual(await w.verifyLogin(l1.token, assertion as never), { ok: false, reason: "expired" }, "the challenge is single use");
  const stored = (await s.listPasskeys("u_login"))[0]!;
  assert.equal(stored.counter, 1);
  assert.ok(stored.lastUsedAt);

  // A cloned authenticator replays an old counter.
  const l2 = await w.loginOptions();
  assert.deepEqual(await w.verifyLogin(l2.token, a.get(l2.options.challenge, { counter: 1 }) as never), { ok: false, reason: "invalid" });

  // Wrong challenge, wrong origin, no user verification, unknown credential.
  const l3 = await w.loginOptions();
  assert.deepEqual(await w.verifyLogin(l3.token, a.get("not-the-challenge") as never), { ok: false, reason: "invalid" });
  const l4 = await w.loginOptions();
  assert.deepEqual(await w.verifyLogin(l4.token, a.get(l4.options.challenge, { origin: "https://evil.example" }) as never), { ok: false, reason: "invalid" });
  const l5 = await w.loginOptions();
  assert.deepEqual(await w.verifyLogin(l5.token, a.get(l5.options.challenge, { flags: 0x01 }) as never), { ok: false, reason: "invalid" });
  const l6 = await w.loginOptions();
  const stranger = new SoftAuthenticator(RP, ORIGIN);
  assert.deepEqual(await w.verifyLogin(l6.token, stranger.get(l6.options.challenge) as never), { ok: false, reason: "invalid" });
  const l7 = await w.loginOptions();
  assert.deepEqual(await w.verifyLogin(l7.token, a.get(l7.options.challenge) as never), { ok: true, userId: "u_login" }, "failed attempts did not damage the passkey");
});

test("rename and delete only touch your own passkeys; there is a cap per account", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { s } = await mods();
  const a = new SoftAuthenticator(RP, ORIGIN);
  const r = await register("u_own", a, "Phone");
  assert.ok(r.res.ok);
  const id = (r.res as { id: string }).id;
  assert.equal(await s.renamePasskey("intruder", id, "x"), false);
  assert.equal(await s.deletePasskey("intruder", id), false);
  assert.equal(await s.renamePasskey("u_own", id, "  Work phone  "), true);
  assert.equal((await s.listPasskeys("u_own"))[0]!.name, "Work phone");
  assert.equal(await s.hasPasskey("u_own"), true);
  assert.equal(await s.deletePasskey("u_own", id), true);
  assert.equal(await s.hasPasskey("u_own"), false);
  for (let i = 0; i < s.MAX_PASSKEYS; i++) assert.ok((await register("u_cap", new SoftAuthenticator(RP, ORIGIN))).res.ok);
  const over = await register("u_cap", new SoftAuthenticator(RP, ORIGIN));
  assert.deepEqual(over.res, { ok: false, reason: "too_many" });
  await s.deleteAllPasskeys("u_cap");
  assert.equal((await s.listPasskeys("u_cap")).length, 0);
});

test("deleting the login also deletes the second-factor secret and every passkey", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { s } = await mods();
  const mfa = await import("../src/lib/accounts/mfa/store");
  const { totpAt } = await import("../src/lib/accounts/mfa/totp");
  const { deleteLogin } = await import("../src/lib/privacy/account-data");
  await (await import("../src/lib/accounts/persist")).ensureAuthSchema();
  const { neonQuery } = await import("../src/lib/create/platform/neon");
  assert.ok((await register("u_gone", new SoftAuthenticator(RP, ORIGIN))).res.ok);
  const { secret } = await mfa.beginSetup("u_gone", "u_gone@example.com");
  assert.ok((await mfa.confirmSetup("u_gone", totpAt(secret, Date.now()), Date.now())).ok);
  await deleteLogin("u_gone", "u_gone@example.com");
  assert.equal((await s.listPasskeys("u_gone")).length, 0);
  assert.equal((await neonQuery("SELECT 1 FROM keplar_mfa WHERE user_id = $1", ["u_gone"])).length, 0);
});
