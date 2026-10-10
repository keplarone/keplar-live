import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { base32Encode } from "../src/lib/accounts/mfa/totp";
import { totpAt } from "../src/lib/accounts/mfa/totp";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const skip = () => !fake;
void base32Encode;

test("setup is not active until a valid code arrives; then recovery codes are shown once and stored only hashed", async (ctx) => {
  if (skip()) return ctx.skip("PGlite not installed");
  const s = await import("../src/lib/accounts/mfa/store");
  const { neonQuery } = await import("../src/lib/create/platform/neon");
  const uid = "u_setup";
  assert.equal(await s.mfaEnabled(uid), false);
  const { secret, uri } = await s.beginSetup(uid, "a@example.com");
  assert.match(uri, /^otpauth:\/\/totp\/Keplar:a%40example\.com\?secret=/);
  assert.equal(await s.mfaEnabled(uid), false, "pending setup does not enforce 2FA");
  assert.deepEqual(await s.confirmSetup(uid, "000000"), { ok: false });
  const t = Date.now();
  const done = await s.confirmSetup(uid, totpAt(secret, t), t);
  assert.ok(done.ok);
  if (!done.ok) return;
  assert.equal(done.recoveryCodes.length, 10);
  assert.equal(await s.mfaEnabled(uid), true);
  const row = (await neonQuery("SELECT secret_enc, recovery FROM keplar_mfa WHERE user_id = $1", [uid]))[0];
  assert.doesNotMatch(String(row.secret_enc), new RegExp(secret), "the TOTP secret is sealed, not stored in clear");
  for (const c of done.recoveryCodes) assert.ok(!String(row.recovery).includes(c.replace("-", "")), "recovery codes are stored as hashes only");
  assert.deepEqual(await s.mfaStatus(uid), { enabled: true, recoveryLeft: 10 });
  await assert.rejects(() => s.beginSetup(uid, "a@example.com"), /already_enabled/);
});

test("a sign-in code works once per 30 s step, a recovery code works once, wrong codes never work", async (ctx) => {
  if (skip()) return ctx.skip("PGlite not installed");
  const s = await import("../src/lib/accounts/mfa/store");
  const uid = "u_login";
  const { secret } = await s.beginSetup(uid, "b@example.com");
  const t0 = Date.now();
  const setup = await s.confirmSetup(uid, totpAt(secret, t0), t0);
  assert.ok(setup.ok);
  if (!setup.ok) return;
  // The setup code's step is spent.
  assert.deepEqual(await s.verifySecondFactor(uid, totpAt(secret, t0), t0), { ok: false });
  // A later step works once, and replaying it fails.
  const t1 = t0 + 60_000;
  const first = await s.verifySecondFactor(uid, totpAt(secret, t1), t1);
  assert.equal(first.ok && first.via, "totp");
  assert.deepEqual(await s.verifySecondFactor(uid, totpAt(secret, t1), t1), { ok: false });
  assert.deepEqual(await s.verifySecondFactor(uid, "123456", t1 + 60_000), { ok: false });
  // Recovery code: typed in any case, with or without the dash, usable once.
  const code = setup.recoveryCodes[0];
  const r = await s.verifySecondFactor(uid, code.toLowerCase().replace("-", " "));
  assert.deepEqual(r.ok && [r.via, r.recoveryLeft], ["recovery", 9]);
  assert.deepEqual(await s.verifySecondFactor(uid, code), { ok: false });
  assert.deepEqual(await s.verifySecondFactor(uid, "AAAAA-AAAAA"), { ok: false });
  assert.equal((await s.mfaStatus(uid)).recoveryLeft, 9);
});

test("regenerating recovery codes retires the old set; disabling removes the factor", async (ctx) => {
  if (skip()) return ctx.skip("PGlite not installed");
  const s = await import("../src/lib/accounts/mfa/store");
  const uid = "u_regen";
  const { secret } = await s.beginSetup(uid, "c@example.com");
  const t0 = Date.now();
  const setup = await s.confirmSetup(uid, totpAt(secret, t0), t0);
  assert.ok(setup.ok);
  if (!setup.ok) return;
  const fresh = await s.regenerateRecovery(uid);
  assert.equal(fresh.length, 10);
  assert.deepEqual(await s.verifySecondFactor(uid, setup.recoveryCodes[1]), { ok: false });
  assert.ok((await s.verifySecondFactor(uid, fresh[0])).ok);
  await s.disableMfa(uid);
  assert.equal(await s.mfaEnabled(uid), false);
  assert.deepEqual(await s.mfaStatus(uid), { enabled: false, recoveryLeft: 0 });
});
