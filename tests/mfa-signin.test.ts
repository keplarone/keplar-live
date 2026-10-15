import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn, jsonReq } from "./helpers/session";
import "./helpers/session";
import { totpAt } from "../src/lib/accounts/mfa/totp";
import { GET as sessionsGET } from "../src/app/api/account/sessions/route";
import { GET as mfaGET, POST as mfaPOST } from "../src/app/api/account/mfa/route";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const origin = "https://keplar.one";
let n = 0;
/** Magic-link sign-in that only returns the cookie (the shared helper insists on reading the session, which a pending one refuses). */
async function rawSignIn(email: string): Promise<{ cookie: string }> {
  const { auth } = await import("../src/lib/accounts/auth");
  const { listOutbox } = await import("../src/lib/accounts/outbox");
  const ip = () => `10.7.${(++n >> 8) & 255}.${n & 255}`;
  const send = await auth.handler(new Request(`${origin}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": ip() }, body: JSON.stringify({ email, callbackURL: "/account" }) }));
  assert.equal(send.status, 200);
  const mail = (await listOutbox()).filter((m) => m.to.toLowerCase() === email.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at))[0];
  const token = new URL(mail!.text.match(/https:\/\/\S+/)![0]).searchParams.get("token");
  const ok = await auth.handler(new Request(`${origin}/api/auth/magic-link/confirm`, { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": ip() }, body: JSON.stringify({ token }) }));
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { redirectTo?: string };
  lastRedirect = body.redirectTo ?? "";
  return { cookie: ok.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ") };
}
let lastRedirect = "";

const uidOf = async (cookie: string) => {
  const { auth } = await import("../src/lib/accounts/auth");
  return (await auth.api.getSession({ headers: new Headers({ cookie }) }))!.user.id;
};
const usable = async (cookie: string) => (await import("../src/lib/accounts/auth")).getSession(new Headers({ cookie }));
const challenge = (cookie: string, code: string) => mfaPOST(jsonReq(cookie, "/api/account/mfa", "POST", { action: "challenge", code }));

test("an account with 2FA gets a session that is unusable until the code is entered; the right code unlocks it once", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const store = await import("../src/lib/accounts/mfa/store");
  const first = await signIn("mfa-user@example.com");
  assert.ok(await usable(first.cookie), "without 2FA the session works at once");
  const uid = await uidOf(first.cookie);
  const { secret } = await store.beginSetup(uid, "mfa-user@example.com");
  const t0 = Date.now();
  const on = await store.confirmSetup(uid, totpAt(secret, t0), t0);
  assert.ok(on.ok);
  if (!on.ok) return;

  const second = await rawSignIn("mfa-user@example.com");
  assert.match(lastRedirect, /^\/two-factor\?next=/, "the sign-in answer sends the browser to the code prompt");
  assert.equal(await usable(second.cookie), null, "pending: signed out as far as the app can tell");
  assert.equal((await sessionsGET(jsonReq(second.cookie, "/api/account/sessions", "GET"))).status, 401, "no API works yet");
  // Wrong code: refused, still locked.
  const bad = await challenge(second.cookie, "000000");
  assert.equal(bad.status, 400);
  assert.equal(await usable(second.cookie), null);
  // Right code (a later step than the one used at setup): unlocked.
  const t1 = t0 + 60_000;
  const realNow = Date.now;
  Date.now = () => t1;
  try {
    const ok = await challenge(second.cookie, totpAt(secret, t1));
    assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
  } finally {
    Date.now = realNow;
  }
  assert.ok(await usable(second.cookie));
  // A recovery code also works for a fresh sign-in, once.
  const third = await rawSignIn("mfa-user@example.com");
  assert.equal(await usable(third.cookie), null);
  const rec = await challenge(third.cookie, on.recoveryCodes[0]);
  assert.equal(rec.status, 200, JSON.stringify(await rec.clone().json()));
  assert.ok(await usable(third.cookie));
  // (A used recovery code being dead is covered in tests/mfa-store.test.ts; the magic-link limiter allows 3 links per address per minute.)
});

test("five wrong codes end the pending session; a signed-out caller cannot probe the challenge", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const store = await import("../src/lib/accounts/mfa/store");
  const first = await signIn("mfa-lock@example.com");
  const uid = await uidOf(first.cookie);
  const { secret } = await store.beginSetup(uid, "mfa-lock@example.com");
  const t0 = Date.now();
  assert.ok((await store.confirmSetup(uid, totpAt(secret, t0), t0)).ok);
  assert.equal((await challenge("", "123456")).status, 401);
  const second = await rawSignIn("mfa-lock@example.com");
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push((await challenge(second.cookie, "111111")).status);
  assert.deepEqual(codes.slice(0, 4), [400, 400, 400, 400]);
  assert.ok(codes.slice(4).every((c) => c === 401 || c === 429), `later attempts refused: ${codes}`);
  assert.equal(codes[4], 401, "the fifth wrong code ends the session");
  // Even the right code no longer works: that session was revoked.
  assert.notEqual((await challenge(second.cookie, totpAt(secret, t0 + 120_000))).status, 200);
  assert.equal(await usable(second.cookie), null);
});

test("settings API: set up, prove with a code, see status, regenerate recovery codes, turn off with a recovery code", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const { cookie } = await signIn("mfa-manage@example.com");
  const post = async (body: unknown) => mfaPOST(jsonReq(cookie, "/api/account/mfa", "POST", body));
  assert.equal((await mfaGET(jsonReq(null, "/api/account/mfa", "GET"))).status, 401, "signed-out callers get nothing");
  assert.deepEqual(await (await mfaGET(jsonReq(cookie, "/api/account/mfa", "GET"))).json(), { enabled: false, recoveryLeft: 0 });
  const setup = (await (await post({ action: "setup" })).json()) as { secret: string; uri: string };
  assert.match(setup.uri, /^otpauth:\/\/totp\//);
  assert.equal((await post({ action: "enable", code: "000000" })).status, 400);
  assert.deepEqual(await (await mfaGET(jsonReq(cookie, "/api/account/mfa", "GET"))).json(), { enabled: false, recoveryLeft: 0 }, "a wrong code turns nothing on");
  const enabled = (await (await post({ action: "enable", code: totpAt(setup.secret) })).json()) as { recoveryCodes: string[] };
  assert.equal(enabled.recoveryCodes.length, 10);
  assert.deepEqual(await (await mfaGET(jsonReq(cookie, "/api/account/mfa", "GET"))).json(), { enabled: true, recoveryLeft: 10 });
  assert.equal((await post({ action: "setup" })).status, 409, "cannot restart while on");
  // Turning it off or making new codes needs a real code.
  assert.equal((await post({ action: "disable", code: "123456" })).status, 400);
  const regen = (await (await post({ action: "regenerate", code: enabled.recoveryCodes[0] })).json()) as { recoveryCodes: string[] };
  assert.equal(regen.recoveryCodes.length, 10);
  assert.equal((await post({ action: "disable", code: enabled.recoveryCodes[1] })).status, 400, "old recovery codes died with the regeneration");
  assert.equal((await post({ action: "disable", code: regen.recoveryCodes[0] })).status, 200);
  assert.deepEqual(await (await mfaGET(jsonReq(cookie, "/api/account/mfa", "GET"))).json(), { enabled: false, recoveryLeft: 0 });
});

// AUTH-9 (docs/rebirth/AUDIT.md): guessing was slowed (8 per 10 minutes) but never stopped, and the owner never knew. Now the 8th
// wrong code within an hour locks the account's codes for the rest of that hour, even a right one, and emails the owner once.
test("too many wrong codes across sessions lock the account's codes and email the owner once", async (ctx) => {
  if (!fake) return ctx.skip("PGlite not installed");
  const store = await import("../src/lib/accounts/mfa/store");
  const { listOutbox } = await import("../src/lib/accounts/outbox");
  const email = "mfa-brute@example.com";
  const first = await signIn(email);
  const uid = await uidOf(first.cookie);
  const { secret } = await store.beginSetup(uid, email);
  const t0 = Date.now();
  assert.ok((await store.confirmSetup(uid, totpAt(secret, t0), t0)).ok);
  const notices = async () => (await listOutbox()).filter((m) => m.to === email && /Too many wrong two-factor codes/.test(m.subject)).length;
  assert.equal(await notices(), 0);

  // An attacker with the password: one pending session takes 4 wrong codes (the 5th ends it), so they sign in again.
  const a = await rawSignIn(email);
  for (let i = 0; i < 4; i++) assert.equal((await challenge(a.cookie, "111111")).status, 400);
  const b = await rawSignIn(email);
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await challenge(b.cookie, "222222")).status);
  assert.deepEqual(statuses, [400, 400, 400, 400], "the 8th wrong code is still answered as wrong");
  assert.equal(await notices(), 1, "the owner is told when the lock starts");

  // Locked: even the right code is refused (the session isn't ended for it), and so is turning 2FA off from a signed-in session.
  const t1 = t0 + 60_000;
  const realNow = Date.now;
  Date.now = () => t1;
  let locked: Response;
  let off: Response;
  try {
    locked = await challenge(b.cookie, totpAt(secret, t1));
    off = await mfaPOST(jsonReq(first.cookie, "/api/account/mfa", "POST", { action: "disable", code: totpAt(secret, t1) }));
  } finally {
    Date.now = realNow;
  }
  assert.equal(locked.status, 429);
  assert.equal(((await locked.json()) as { code?: string }).code, "mfa_locked");
  assert.equal(await usable(b.cookie), null);
  assert.equal(off.status, 429);
  assert.equal(((await off.json()) as { code?: string }).code, "mfa_locked");
  assert.equal(await notices(), 1);
});
