import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { checkPassword, validEmail, PASSWORD_MIN } from "@/lib/accounts/password-policy";
import { authRedirectPath } from "@/lib/accounts/redirect";
import { createActionToken, fingerprint, verifyActionToken } from "@/lib/accounts/action-token";
import { neonQuery } from "@/lib/create/platform/neon";

const SECRET = "test-secret-for-password-auth-0123456789abcdef";
process.env.BETTER_AUTH_SECRET = SECRET;
process.env.BETTER_AUTH_URL = "https://keplar.one";
process.env.KEPLAR_DEV_TOOLS = "1"; // outbox bodies are readable
const ORIGIN = "https://keplar.one";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

let n = 0;
const freshIp = () => `10.20.${(++n >> 8) & 255}.${n & 255}`;
const GOOD = "violet harbor lantern 42";

async function post(path: string, body: unknown, opts: { ip?: string; origin?: string | null; cookie?: string } = {}) {
  const { auth } = await import("@/lib/accounts/auth");
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": opts.ip ?? freshIp() };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await auth.handler(new Request(`${ORIGIN}/api/auth/password/${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  const json = (await res.clone().json().catch(() => ({}))) as Record<string, unknown>;
  return { res, json, status: res.status, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ") };
}

async function lastMail(to: string, kind: string) {
  const { listOutbox } = await import("@/lib/accounts/outbox");
  return (await listOutbox()).filter((m) => m.to.toLowerCase() === to.toLowerCase() && m.kind === kind).sort((a, b) => b.at.localeCompare(a.at))[0];
}
const tokenIn = (text: string) => new URL(text.match(/https:\/\/\S+/)![0]).searchParams.get("token") as string;
const getSess = async (cookie: string) => (await import("@/lib/accounts/auth")).getSession(new Headers({ cookie }));

// ── validation ────────────────────────────────────────────────────────────────

test("password policy: length first, common and personal passwords refused, strength grows", () => {
  assert.equal(PASSWORD_MIN, 10);
  assert.equal(checkPassword("").ok, false);
  assert.equal(checkPassword("short1!").ok, false);
  assert.match(checkPassword("abc").problem ?? "", /more character/);
  for (const bad of ["password123", "Password2026!", "qwertyuiop", "1234567890", "aaaaaaaaaaaa", "abcdefghijkl", "P@ssw0rd", "keplar2026!"]) assert.equal(checkPassword(bad).ok, false, bad);
  assert.equal(checkPassword("ada.lovelace-2026", { email: "ada.lovelace@example.com" }).ok, false, "built from the email");
  assert.equal(checkPassword("x".repeat(129)).ok, false, "too long");
  const weak = checkPassword("tabletennis");
  const strong = checkPassword("violet harbor lantern 42 quartz");
  assert.ok(weak.ok && strong.ok);
  assert.ok(strong.score > weak.score, "longer passphrase scores higher");
  assert.equal(strong.label, "Strong");
  assert.equal(checkPassword(GOOD).ok, true, "a plain passphrase with no symbols is fine");
});

test("email shape", () => {
  for (const ok of ["a@b.co", " ada@example.com ", "first.last+tag@sub.example.org"]) assert.ok(validEmail(ok), ok);
  for (const bad of ["", "a", "a@b", "a b@c.co", "a@@b.co", "a@b..co", "@b.co", `${"x".repeat(250)}@b.co`, null, 5]) assert.equal(validEmail(bad), false, String(bad));
});

// ── redirect safety ───────────────────────────────────────────────────────────

test("redirects: same-origin paths only, never an auth page", () => {
  assert.equal(authRedirectPath("/app?x=1"), "/app?x=1");
  assert.equal(authRedirectPath("/pricing#plans"), "/pricing#plans");
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "evil.test", "/\nhttps://evil", "", undefined, null, "\\\\evil", `/${"a".repeat(600)}`]) assert.equal(authRedirectPath(bad as string), "/account", String(bad));
  for (const loop of ["/signin", "/signup?next=/app", "/signin/verify?x=1", "/forgot-password", "/reset-password?token=x", "/verify-email"]) assert.equal(authRedirectPath(loop, "/account"), "/account", loop);
  assert.equal(authRedirectPath("/signing-off"), "/signing-off", "only the exact auth pages are refused");
});

test("action tokens: purpose-bound, tamper-proof, expiring, single-use by fingerprint", () => {
  const fp = fingerprint(SECRET, "hash-1");
  const t = createActionToken(SECRET, "reset", { email: " Ada@Example.com ", fp, callbackURL: "https://evil.test" });
  const ok = verifyActionToken(SECRET, "reset", t);
  assert.ok(ok.ok && ok.payload.e === "ada@example.com" && ok.payload.cb === "/account" && ok.payload.exp - ok.payload.iat === 30 * 60);
  assert.deepEqual(verifyActionToken(SECRET, "verify", t), { ok: false, reason: "bad_signature" }, "a reset token is no verification token");
  assert.deepEqual(verifyActionToken("another-secret-another-secret-0123456789", "reset", t), { ok: false, reason: "bad_signature" });
  const [v, body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ ...(ok.ok ? ok.payload : {}), e: "eve@evil.test" })).toString("base64url");
  assert.equal(verifyActionToken(SECRET, "reset", `${v}.${forged}.${sig}`).ok, false);
  for (const bad of ["", "abc", "a1.x", `a1.${body}`, null, undefined, "x".repeat(3000)]) assert.equal(verifyActionToken(SECRET, "reset", bad).ok, false);
  const now = Date.now();
  const short = createActionToken(SECRET, "reset", { email: "a@b.co", fp }, { now });
  assert.ok(verifyActionToken(SECRET, "reset", short, { now: now + 29 * 60_000 }).ok);
  assert.deepEqual(verifyActionToken(SECRET, "reset", short, { now: now + 31 * 60_000 }), { ok: false, reason: "expired" });
  assert.notEqual(fingerprint(SECRET, "hash-1"), fingerprint(SECRET, "hash-2"));
  assert.equal(fingerprint(SECRET, null), "-");
});

// ── flows (real Better Auth handler, Postgres via PGlite, mail via the dev outbox) ─────────

test("sign up → verify email → signed in; cannot log in before verifying; link works once", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const email = "Ada.Signup@Example.com";
  const bad = await post("sign-up", { email, password: "short", acceptTerms: true });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.code, "WEAK_PASSWORD");
  assert.equal((await post("sign-up", { email, password: GOOD, confirm: `${GOOD}!`, acceptTerms: true })).json.code, "PASSWORD_MISMATCH");
  assert.equal((await post("sign-up", { email, password: GOOD, confirm: GOOD })).json.code, "TERMS_REQUIRED");
  assert.equal((await post("sign-up", { email: "nope", password: GOOD, acceptTerms: true })).json.code, "INVALID_EMAIL");
  assert.equal(await lastMail(email, "verify-email"), undefined, "rejected sign-ups send nothing");

  const ok = await post("sign-up", { email, password: GOOD, confirm: GOOD, name: "Ada", acceptTerms: true, callbackURL: "/app?welcome=1" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { status: true });
  const mail = await lastMail(email, "verify-email");
  assert.ok(mail, "verification email written");
  assert.ok(mail.text.includes("https://keplar.one/verify-email?token=a1."));
  const token = tokenIn(mail.text);

  const early = await post("sign-in", { email, password: GOOD });
  assert.equal(early.status, 403);
  assert.equal(early.json.code, "EMAIL_NOT_VERIFIED");
  assert.equal(early.cookie, "", "no session before verification");

  assert.equal((await post("verify-email", { token }, { origin: "https://evil.test" })).status, 403, "foreign origin refused");
  assert.equal((await post("verify-email", { token: `${token.slice(0, -3)}abc` })).status, 400, "tampered token refused");
  const verified = await post("verify-email", { token });
  assert.equal(verified.status, 200);
  assert.equal(verified.json.redirectTo, "/welcome?next=%2Fapp%3Fwelcome%3D1", "a brand-new account is sent through onboarding, keeping its destination");
  assert.match(verified.cookie, /__Secure-better-auth\.session_token=/);
  const s = await getSess(verified.cookie);
  assert.equal(s?.user.email, "ada.signup@example.com");
  assert.equal(s?.user.name, "Ada");
  assert.equal((await post("verify-email", { token })).status, 400, "the link works once");

  const login = await post("sign-in", { email: "ADA.SIGNUP@example.com", password: GOOD, callbackURL: "/pricing", remember: true });
  assert.equal(login.status, 200);
  assert.equal(login.json.redirectTo, "/welcome?next=%2Fpricing", "an account that has not finished onboarding resumes it, then goes on to its destination");
  assert.match(login.res.headers.getSetCookie().join("\n"), /session_token=[^;]+;.*Max-Age=5184000/i, "60-day persistent session");
  const stored = await neonQuery("SELECT password_hash FROM keplar_credentials WHERE email = $1", ["ada.signup@example.com"]);
  assert.ok(!String(stored[0].password_hash).includes(GOOD) && String(stored[0].password_hash).length > 40, "only a hash is stored");
});

test("no enumeration: login, sign-up and forgot answer the same for known and unknown addresses", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const email = "known.person@example.com";
  await post("sign-up", { email, password: GOOD, acceptTerms: true });
  await post("verify-email", { token: tokenIn((await lastMail(email, "verify-email"))!.text) });

  const wrongPw = await post("sign-in", { email, password: "definitely wrong 1" });
  const unknown = await post("sign-in", { email: "nobody.here@example.com", password: "definitely wrong 1" });
  assert.equal(wrongPw.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrongPw.json, unknown.json, "identical body: same code and message");
  assert.equal(wrongPw.json.code, "INVALID_CREDENTIALS");

  // an account that only uses a magic link/Google has no password: same answer again
  const { signIn } = await import("./helpers/session");
  await signIn("linkonly@example.com");
  const noPw = await post("sign-in", { email: "linkonly@example.com", password: GOOD });
  assert.deepEqual(noPw.json, unknown.json);

  // sign-up for an existing verified address: same 200 answer, and the owner is told by email instead
  const again = await post("sign-up", { email, password: "another passphrase 77", acceptTerms: true });
  const fresh = await post("sign-up", { email: "brand.new@example.com", password: GOOD, acceptTerms: true });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json, fresh.json);
  assert.ok(await lastMail(email, "signup-existing"));
  const still = await post("sign-in", { email, password: GOOD });
  assert.equal(still.status, 200, "the existing password was not replaced by the second sign-up");

  // forgot: same answer; mail only to real accounts
  const f1 = await post("forgot", { email });
  const f2 = await post("forgot", { email: "ghost.user@example.com" });
  assert.equal(f1.status, 200);
  assert.deepEqual(f1.json, f2.json);
  assert.ok(await lastMail(email, "password-reset"));
  assert.equal(await lastMail("ghost.user@example.com", "password-reset"), undefined, "no mail to strangers");
});

test("lockout and rate limits (same for real and unknown addresses)", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const email = "locked.out@example.com";
  await post("sign-up", { email, password: GOOD, acceptTerms: true });
  await post("verify-email", { token: tokenIn((await lastMail(email, "verify-email"))!.text) });
  const run = async (target: string) => {
    const seen: number[] = [];
    // a different IP each time so only the per-email counter can trip
    for (let i = 0; i < 14; i++) seen.push((await post("sign-in", { email: target, password: `wrong password ${i}` })).status);
    return seen;
  };
  const real = await run(email);
  const ghost = await run("ghost.locked@example.com");
  assert.deepEqual(real, ghost, "identical sequence for an address with no account");
  assert.deepEqual(real.slice(0, 12), Array(12).fill(401));
  assert.equal(real[12], 429);
  assert.equal((await post("sign-in", { email, password: GOOD })).status, 429, "even the right password waits out the lockout");

  // per IP + email: 6 tries in 5 minutes from one address
  const ip = freshIp();
  const codes: number[] = [];
  for (let i = 0; i < 8; i++) codes.push((await post("sign-in", { email: "burst@example.com", password: "nope nope nope" }, { ip })).status);
  assert.deepEqual(codes, [401, 401, 401, 401, 401, 401, 429, 429]);

  // sign-up emails: 3 per address per 10 minutes
  const sip = freshIp();
  const out: number[] = [];
  for (let i = 0; i < 5; i++) out.push((await post("sign-up", { email: "spam.target@example.com", password: GOOD, acceptTerms: true }, { ip: sip })).status);
  assert.deepEqual(out, [200, 200, 200, 429, 429]);
  const fo: number[] = [];
  for (let i = 0; i < 5; i++) fo.push((await post("forgot", { email: "spam.target2@example.com" })).status);
  assert.deepEqual(fo, [200, 200, 200, 429, 429]);
});

test("forgot → reset: new password works, old one doesn't, link is single use, other sessions end", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const email = "reset.me@example.com";
  await post("sign-up", { email, password: GOOD, acceptTerms: true });
  const first = await post("verify-email", { token: tokenIn((await lastMail(email, "verify-email"))!.text) });
  assert.ok(await getSess(first.cookie), "device A is signed in");

  await post("forgot", { email, callbackURL: "/app" });
  const token = tokenIn((await lastMail(email, "password-reset"))!.text);
  const NEW = "copper meadow signal 91";
  assert.equal((await post("reset", { token, password: "short" })).json.code, "WEAK_PASSWORD");
  assert.equal((await post("reset", { token, password: NEW, confirm: "different" })).json.code, "PASSWORD_MISMATCH");
  assert.equal((await post("reset", { token, password: NEW }, { origin: null })).status, 403, "no Origin header: refused");
  const done = await post("reset", { token, password: NEW, confirm: NEW });
  assert.equal(done.status, 200);
  assert.equal(done.json.redirectTo, "/app");
  assert.ok(await getSess(done.cookie), "this device is signed in after the reset");
  assert.equal(await getSess(first.cookie), null, "other devices were signed out");

  assert.equal((await post("reset", { token, password: "yet another phrase 55" })).json.code, "LINK_USED", "single use");
  assert.equal((await post("sign-in", { email, password: GOOD })).status, 401, "old password stops working");
  assert.equal((await post("sign-in", { email, password: NEW })).status, 200);
  assert.equal((await post("reset", { token: `${token.slice(0, -3)}xyz`, password: NEW })).status, 400);
});

test("a magic-link-only account can add a password through reset", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const { signIn } = await import("./helpers/session");
  const email = "adds.password@example.com";
  await signIn(email);
  await post("forgot", { email });
  const token = tokenIn((await lastMail(email, "password-reset"))!.text);
  assert.equal((await post("reset", { token, password: GOOD })).status, 200);
  assert.equal((await post("sign-in", { email, password: GOOD })).status, 200);
});

test("pre-registration can't squat on an address: a later sign-up replaces it, a verified sign-in deletes it", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const victim = "victim@example.com";
  await post("sign-up", { email: victim, password: "attacker chosen phrase 1", acceptTerms: true });
  const attackerLink = tokenIn((await lastMail(victim, "verify-email"))!.text);
  // the real owner signs up themselves: the attacker's password and link are gone
  await post("sign-up", { email: victim, password: GOOD, acceptTerms: true });
  assert.equal((await post("verify-email", { token: attackerLink })).json.code, "LINK_USED");
  assert.equal((await post("sign-in", { email: victim, password: "attacker chosen phrase 1" })).status, 401);

  // pending sign-up, then the owner proves the address with a magic link: the pending row is deleted
  const other = "victim2@example.com";
  await post("sign-up", { email: other, password: "attacker chosen phrase 2", acceptTerms: true });
  const { signIn } = await import("./helpers/session");
  await signIn(other);
  const rows = await neonQuery("SELECT 1 FROM keplar_credentials WHERE email = $1", [other]);
  assert.equal(rows.length, 0);
  assert.equal((await post("sign-in", { email: other, password: "attacker chosen phrase 2" })).status, 401);
});

test("verification email can be re-sent; redirect targets are sanitised", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const email = "resend.me@example.com";
  await post("sign-up", { email, password: GOOD, acceptTerms: true, callbackURL: "/app?welcome=1" });
  const t1 = tokenIn((await lastMail(email, "verify-email"))!.text);
  assert.equal((await post("resend-verification", { email })).status, 200);
  assert.equal((await post("resend-verification", { email: "never.signed.up@example.com" })).status, 200, "same answer for any address");
  const t2 = tokenIn((await lastMail(email, "verify-email"))!.text);
  assert.ok(t2);
  const v = await post("verify-email", { token: t1 });
  assert.equal(v.status, 200);
  assert.equal(v.json.redirectTo, "/welcome?next=%2Fapp%3Fwelcome%3D1");
  // Better Auth itself refuses off-site callback URLs outright; ours would also fall back to the default
  for (const evil of ["https://evil.test/steal", "//evil.test"]) {
    const r = await post("sign-in", { email, password: GOOD, callbackURL: evil });
    assert.ok(r.status === 403 || (r.status === 200 && r.json.redirectTo === "/welcome?next=%2Faccount"), `${evil} → ${r.status}`);
    assert.notEqual(r.json.redirectTo, evil);
  }
  const login2 = await post("sign-in", { email, password: GOOD, callbackURL: "/signin" });
  assert.equal(login2.json.redirectTo, "/welcome?next=%2Faccount", "never redirected back to an auth page (onboarding resumes, then /account)");
});

test("same-origin only: requests without or with a foreign Origin are refused", async () => {
  for (const path of ["sign-in", "sign-up", "forgot", "reset", "verify-email", "resend-verification"]) {
    assert.equal((await post(path, { email: "a@b.co", password: GOOD }, { origin: "https://evil.test" })).status, 403, `${path} foreign`);
    assert.equal((await post(path, { email: "a@b.co", password: GOOD }, { origin: null })).status, 403, `${path} none`);
  }
});

test("degrades honestly: no database, or no email delivery", async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const noDb = await post("sign-up", { email: "x@example.com", password: GOOD, acceptTerms: true });
  assert.equal(noDb.status, 503);
  assert.equal(noDb.json.code, "PASSWORDS_UNAVAILABLE");
  assert.equal((await post("sign-in", { email: "x@example.com", password: GOOD })).json.code, "PASSWORDS_UNAVAILABLE");
  if (saved) process.env.DATABASE_URL = saved;

  if (!fake) return;
  const dev = process.env.KEPLAR_DEV_TOOLS;
  delete process.env.KEPLAR_DEV_TOOLS;
  const noMail = await post("sign-up", { email: "y@example.com", password: GOOD, acceptTerms: true });
  assert.equal(noMail.status, 503);
  assert.equal(noMail.json.code, "EMAIL_NOT_CONFIGURED");
  assert.equal((await post("forgot", { email: "y@example.com" })).json.code, "EMAIL_NOT_CONFIGURED");
  process.env.KEPLAR_DEV_TOOLS = dev;
  const rows = await neonQuery("SELECT 1 FROM keplar_credentials WHERE email = 'y@example.com'");
  assert.equal(rows.length, 0, "nothing was stored when email can't be sent");
});

test("capabilities reported to the pages", async () => {
  const { passwordCapabilities } = await import("@/lib/accounts/password-auth");
  const { emailConfigured } = await import("@/lib/accounts/outbox");
  assert.equal(passwordCapabilities().email, true, "dev tools outbox counts");
  assert.equal(emailConfigured(), false, "no Resend key in tests");
  assert.equal(passwordCapabilities().passwords, Boolean(fake));
});

test("landing pages inspect links without consuming them", async (t) => {
  if (!fake) return t.skip("pglite not installed");
  const { inspectLink } = await import("@/lib/accounts/link-check");
  const email = "inspect.me@example.com";
  await post("sign-up", { email, password: GOOD, acceptTerms: true });
  const vt = tokenIn((await lastMail(email, "verify-email"))!.text);
  for (let i = 0; i < 3; i++) assert.equal((await inspectLink("verify", vt)).state, "ok", "viewing never burns it");
  assert.equal((await inspectLink("reset", vt)).state, "invalid", "wrong purpose");
  assert.equal((await inspectLink("verify", "garbage")).state, "invalid");
  await post("verify-email", { token: vt });
  assert.equal((await inspectLink("verify", vt)).state, "verified");
  await post("forgot", { email });
  const rt = tokenIn((await lastMail(email, "password-reset"))!.text);
  assert.equal((await inspectLink("reset", rt)).state, "ok");
  assert.equal((await post("reset", { token: rt, password: "copper meadow signal 91" })).status, 200);
  assert.equal((await inspectLink("reset", rt)).state, "used");
  const expired = createActionToken(SECRET, "reset", { email, fp: "-" }, { now: Date.now() - 2 * 3600_000 });
  assert.equal((await inspectLink("reset", expired)).state, "expired");
});
