/**
 * Authentication hardening (security review, Oct 2026):
 * F1 a session id without a row is refused; deleted accounts can't be recreated by an old cookie; session-only cookies
 *    expire with their server record. F2 no id-token sign-in. F3 unused Better Auth endpoints are off. F4 no password can
 *    be attached to an existing account through a sign-up link. F5 sensitive changes need a recent sign-in.
 * F7 magic-link limits are shared. F8 no localhost origins in production. F10 owners are told about security changes.
 */
import "./setup";
import "./helpers/oauth-env";
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn, call, jsonReq } from "./helpers/session";
import { neonQuery } from "@/lib/create/platform/neon";
import { totpAt } from "@/lib/accounts/mfa/totp";
import { LEGACY_ADOPTION_UNTIL, LEGACY_SESSION_CUTOFF, legacyAdoptable } from "@/lib/accounts/persist";
import { POST as passkeysPOST } from "@/app/api/account/passkeys/route";
import { POST as mfaPOST } from "@/app/api/account/mfa/route";
import { POST as deletePOST } from "@/app/api/account/delete/route";
import { GET as exportGET } from "@/app/api/account/export/route";
import { POST as keysPOST } from "@/app/api/keys/route";
import { DELETE as sessionsDELETE } from "@/app/api/account/sessions/route";

const ORIGIN = "https://keplar.one";

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const getAuth = async () => (await import("@/lib/accounts/auth")).auth;
const getSess = async (cookie: string) => (await import("@/lib/accounts/auth")).getSession(new Headers({ cookie }));
const forget = async (id: string) => (await import("@/lib/accounts/session-guard")).forgetSession(id);
const userRow = async (email: string) => (await neonQuery("SELECT id FROM keplar_users WHERE email = $1", [email]))[0];
const mails = async (to: string, kind: string) => (await (await import("@/lib/accounts/outbox")).listOutbox()).filter((m) => m.to === to && m.kind === kind);

/** Run `fn` with the clock set to `at` (Date only; timers keep running). */
async function at<T>(when: number, fn: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ["Date"], now: when });
  try {
    return await fn();
  } finally {
    mock.timers.reset();
  }
}

/** A sign-in made `minutesAgo` minutes ago (its session's createdAt is then). */
const oldSignIn = (email: string, minutesAgo = 20, plan: Parameters<typeof signIn>[1] = "free") => at(Date.now() - minutesAgo * 60_000, () => signIn(email, plan));

/** A cookie issued with no database, as before the sessions table existed (or with its row gone). */
async function noDbSignIn(email: string, when?: number) {
  const keep = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    return when === undefined ? await signIn(email) : await at(when, () => signIn(email));
  } finally {
    process.env.DATABASE_URL = keep;
  }
}

const body = async (r: Response) => (await r.clone().json().catch(() => ({}))) as Record<string, unknown>;

// ── F1 ────────────────────────────────────────────────────────────────────────

test("F1: a session id with no row is refused, and nothing is created for it", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "norow@example.com";
  const u = await noDbSignIn(email); // a genuine cookie whose session was never recorded
  assert.equal(await getSess(u.cookie), null, "fail closed");
  assert.equal(await userRow(email), undefined, "no user row is created from an unknown session");
  assert.equal((await neonQuery("SELECT 1 FROM keplar_sessions WHERE user_id IN (SELECT id FROM keplar_users WHERE email = $1)", [email])).length, 0);
});

test("F1: pruned or deleted rows stay dead (revoked, and still waiting for the second factor)", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "pruned@example.com";
  const a = await signIn(email);
  const b = await signIn(email);
  const sa = (await getSess(a.cookie))!;
  const sb = (await getSess(b.cookie))!;
  // Revoke one device, then the row is pruned (30 days after expiry): the copied cookie must not come back.
  assert.equal((await sessionsDELETE(jsonReq(b.cookie, "/api/account/sessions", "DELETE", { id: sa.session.id }))).status, 200);
  await neonQuery("DELETE FROM keplar_sessions WHERE id = $1", [sa.session.id]);
  await forget(sa.session.id);
  assert.equal(await getSess(a.cookie), null, "revocation survives pruning");
  // A session still waiting for its 2FA code whose row disappears is not adopted as a full session.
  await neonQuery("UPDATE keplar_sessions SET mfa_pending = true WHERE id = $1", [sb.session.id]);
  await forget(sb.session.id);
  assert.equal(await getSess(b.cookie), null);
  await neonQuery("DELETE FROM keplar_sessions WHERE id = $1", [sb.session.id]);
  await forget(sb.session.id);
  assert.equal(await getSess(b.cookie), null, "2FA can't be skipped by losing the row");
});

test("F1: cookies from before the sessions table are adopted only inside the migration window", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  assert.equal(legacyAdoptable(new Date(LEGACY_SESSION_CUTOFF - 1), LEGACY_SESSION_CUTOFF + 86_400_000), true);
  assert.equal(legacyAdoptable(new Date(LEGACY_SESSION_CUTOFF), LEGACY_SESSION_CUTOFF + 86_400_000), false, "issued after the table existed");
  assert.equal(legacyAdoptable(new Date(LEGACY_SESSION_CUTOFF - 1), LEGACY_ADOPTION_UNTIL), false, "window closed");
  const issued = LEGACY_SESSION_CUTOFF - 12 * 86_400_000;
  const inWindow = LEGACY_SESSION_CUTOFF + 13 * 86_400_000;
  const old = await noDbSignIn("legacy-window@example.com", issued);
  const s = await at(inWindow, () => getSess(old.cookie));
  assert.ok(s, "a pre-table cookie is adopted during the window");
  assert.equal((await neonQuery("SELECT provider FROM keplar_sessions WHERE id = $1", [s.session.id]))[0]?.provider, "legacy");
  const late = await noDbSignIn("legacy-late@example.com", issued);
  assert.equal(await at(LEGACY_ADOPTION_UNTIL + 60_000, () => getSess(late.cookie)), null, "after the window it is refused");
  assert.equal(await userRow("legacy-late@example.com"), undefined);
});

test("F1: deleting an account leaves a tombstone, so neither a recorded nor a pre-table cookie can recreate it", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "deleted@example.com";
  const issued = LEGACY_SESSION_CUTOFF - 5 * 86_400_000;
  const legacy = await noDbSignIn(email, issued); // an old cookie still in some browser
  const u = await signIn(email);
  const res = await deletePOST(jsonReq(u.cookie, "/api/account/delete", "POST", { confirmEmail: email, now: true }));
  assert.equal(res.status, 200, JSON.stringify(await body(res)));
  assert.equal(await userRow(email), undefined, "the login is gone");
  assert.equal(await getSess(u.cookie), null, "the cookie of the deleting session is dead");
  assert.equal(await at(LEGACY_SESSION_CUTOFF + 86_400_000, () => getSess(legacy.cookie)), null, "a pre-table cookie is not adopted after deletion");
  assert.equal(await userRow(email), undefined, "and the account was not recreated");
  const tomb = await neonQuery("SELECT email_key FROM keplar_deleted_logins");
  assert.ok(tomb.length >= 1);
  assert.ok(!JSON.stringify(tomb).includes("deleted@"), "the tombstone holds no address");
  const again = await signIn(email);
  assert.ok(await getSess(again.cookie), "the address can sign up again later");
});

test("F1: a 'Remember me' off cookie stops working with its one-day server record", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const auth = await getAuth();
  const { listOutbox } = await import("@/lib/accounts/outbox");
  const email = "short@example.com";
  const h = { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "10.77.0.1" };
  await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: h, body: JSON.stringify({ email, remember: false }) }));
  const mail = (await listOutbox()).find((m) => m.to === email)!;
  const token = new URL(mail.text.match(/https:\/\/\S+/)![0]).searchParams.get("token");
  const res = await auth.handler(new Request(`${ORIGIN}/api/auth/magic-link/confirm`, { method: "POST", headers: h, body: JSON.stringify({ token }) }));
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");
  const s = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.ok(s);
  assert.ok(new Date(s.session.expiresAt).getTime() <= Date.now() + 86_400_000 + 5_000, "embedded expiry is the server TTL, not 365 days");
  assert.equal(await at(Date.now() + 2 * 86_400_000, () => auth.api.getSession({ headers: new Headers({ cookie }) })), null, "a day later the cookie itself is dead");
});

// ── F2, F3, F8 ────────────────────────────────────────────────────────────────

test("F2: Google and Microsoft accept no client id token: sign-in is the redirect flow only", async () => {
  const { socialProvidersFromEnv } = await import("@/lib/accounts/oauth");
  const p = socialProvidersFromEnv() as Record<string, { disableIdTokenSignIn?: boolean } | undefined>;
  assert.equal(p.google?.disableIdTokenSignIn, true);
  assert.equal(p.microsoft?.disableIdTokenSignIn, true);
  const auth = await getAuth();
  for (const provider of ["google", "microsoft"]) {
    const r = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "10.78.0.1" }, body: JSON.stringify({ provider, idToken: { token: "a.b.c" } }) }));
    assert.equal(r.status, 404, provider);
    assert.ok(!r.headers.getSetCookie().some((c) => c.includes("session_token=") && !/=;/.test(c)), "no session cookie");
  }
});

test("F3: Better Auth endpoints the app doesn't use answer 404; the ones it uses still work", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const auth = await getAuth();
  const u = await signIn("builtin@example.com");
  const h = { "content-type": "application/json", origin: ORIGIN, cookie: u.cookie, "x-forwarded-for": "10.79.0.1" };
  for (const [method, path, payload] of [
    ["POST", "/update-user", { name: "x" }],
    ["GET", "/list-accounts"],
    ["POST", "/link-social", { provider: "google" }],
    ["POST", "/unlink-account", { providerId: "google" }],
    ["GET", "/account-info"],
    ["GET", "/list-sessions"],
    ["POST", "/revoke-session", { token: "x" }],
    ["POST", "/revoke-sessions", {}],
    ["POST", "/revoke-other-sessions", {}],
    ["POST", "/send-verification-email", { email: "builtin@example.com" }],
    ["GET", "/verify-email?token=x"],
    ["POST", "/update-session", {}],
    ["POST", "/change-email", { newEmail: "other@example.com" }],
    ["POST", "/delete-user", {}],
    ["POST", "/get-access-token", { providerId: "google" }],
    ["POST", "/refresh-token", { providerId: "google" }],
    ["POST", "/sign-in/email", { email: "builtin@example.com", password: "x" }],
  ] as [string, string, unknown?][]) {
    const r = await auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method, headers: h, body: payload === undefined ? undefined : JSON.stringify(payload) }));
    assert.equal(r.status, 404, `${method} ${path}`);
    assert.equal(r.headers.getSetCookie().length, 0, `${path} sets no cookie`);
  }
  const ok = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: u.cookie } }));
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { user?: { email?: string } })?.user?.email, "builtin@example.com");
  const social = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "10.79.0.2" }, body: JSON.stringify({ provider: "google", callbackURL: "/account" }) }));
  assert.equal(social.status, 200, "the Google redirect flow still starts");
  // Every disabled path is really unused by the app's own code.
  const client = readFileSync("src/components/auth/ProviderButtons.tsx", "utf8") + readFileSync("src/components/account/auth-client.ts", "utf8");
  assert.ok(!/updateUser|listSessions|linkSocial|unlinkAccount|revokeSession/.test(client));
});

test("F8: localhost is a trusted origin only outside production", async () => {
  const { trustedOriginsFor } = await import("@/lib/accounts/auth");
  const { siteUrl } = await import("@/lib/site");
  const { BUSINESS_URL } = await import("@/lib/business-site");
  assert.deepEqual(trustedOriginsFor("production"), [siteUrl, BUSINESS_URL], "only the site and Business in production");
  assert.deepEqual(trustedOriginsFor("development"), [siteUrl, BUSINESS_URL, "http://localhost:3000", "http://localhost:3001"]);
  assert.deepEqual(trustedOriginsFor("test"), trustedOriginsFor("development"));
});

// ── F4 ────────────────────────────────────────────────────────────────────────

test("F4: a password sign-up for an existing account sends the 'already have an account' notice, never a verify link", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const auth = await getAuth();
  const email = "victim@example.com";
  await signIn(email); // the owner signed up with an email link: no password
  const signUp = (ip: string) => auth.handler(new Request(`${ORIGIN}/api/auth/password/sign-up`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify({ email, name: "Mallory", password: "violet harbor lantern 42", acceptTerms: true }) }));
  const res = await signUp("10.80.0.1");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: true }, "same answer as for a new address");
  assert.equal((await mails(email, "verify-email")).length, 0, "no link that would attach the password");
  assert.equal((await mails(email, "signup-existing")).length, 1);
  assert.equal((await neonQuery("SELECT 1 FROM keplar_credentials WHERE email = $1", [email])).length, 0, "no pending credential");
  // A new address still gets its verification link.
  const fresh = await auth.handler(new Request(`${ORIGIN}/api/auth/password/sign-up`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "10.80.0.2" }, body: JSON.stringify({ email: "newcomer@example.com", password: "violet harbor lantern 42", acceptTerms: true }) }));
  assert.deepEqual(await fresh.json(), { status: true });
  assert.equal((await mails("newcomer@example.com", "verify-email")).length, 1);
});

test("F4: a verify link for a pending sign-up is refused once the address has an account", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const auth = await getAuth();
  const email = "race@example.com";
  const post = (path: string, payload: unknown, ip: string) => auth.handler(new Request(`${ORIGIN}/api/auth/password/${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify(payload) }));
  assert.equal((await post("sign-up", { email, password: "violet harbor lantern 42", acceptTerms: true }, "10.81.0.1")).status, 200);
  const link = (await mails(email, "verify-email"))[0]!;
  const token = new URL(link.text.match(/https:\/\/\S+/)![0]).searchParams.get("token");
  // The owner's account appears another way and the pending row was not dropped (e.g. that clean-up failed).
  const { upsertUser } = await import("@/lib/accounts/persist");
  await upsertUser({ email, provider: "google" });
  const v = await post("verify-email", { token }, "10.81.0.2");
  assert.equal(v.status, 400);
  assert.equal((await body(v)).code, "ACCOUNT_EXISTS");
  assert.equal((await neonQuery("SELECT 1 FROM keplar_credentials WHERE email = $1", [email])).length, 0, "the stranger's password is gone");
});

// ── F5 + F10 ──────────────────────────────────────────────────────────────────

const reauthOf = async (r: Response) => ({ status: r.status, code: (await body(r)).code });

test("F5: adding a passkey needs a recent sign-in", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const old = await oldSignIn("pk-old@example.com");
  assert.deepEqual(await reauthOf(await passkeysPOST(jsonReq(old.cookie, "/api/account/passkeys", "POST", { action: "options" }))), { status: 403, code: "reauth_required" });
  assert.deepEqual(await reauthOf(await passkeysPOST(jsonReq(old.cookie, "/api/account/passkeys", "POST", { action: "add", token: "x", response: {} }))), { status: 403, code: "reauth_required" });
  const fresh = await signIn("pk-new@example.com");
  const r = await passkeysPOST(jsonReq(fresh.cookie, "/api/account/passkeys", "POST", { action: "options" }));
  assert.equal(r.status, 200);
  assert.ok((await body(r)).options);
});

test("F5 + F10: turning on 2FA and new recovery codes need a recent sign-in; the owner is emailed about each change", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const old = await oldSignIn("mfa-old@example.com");
  for (const payload of [{ action: "setup" }, { action: "enable", code: "123456" }, { action: "regenerate", code: "123456" }]) {
    assert.deepEqual(await reauthOf(await mfaPOST(jsonReq(old.cookie, "/api/account/mfa", "POST", payload))), { status: 403, code: "reauth_required" }, payload.action);
  }
  const email = "mfa-new@example.com";
  const fresh = await signIn(email);
  const setup = await mfaPOST(jsonReq(fresh.cookie, "/api/account/mfa", "POST", { action: "setup" }));
  assert.equal(setup.status, 200);
  const { secret } = (await body(setup)) as { secret: string };
  const on = await mfaPOST(jsonReq(fresh.cookie, "/api/account/mfa", "POST", { action: "enable", code: totpAt(secret, Date.now()) }));
  assert.equal(on.status, 200, JSON.stringify(await body(on)));
  const { recoveryCodes } = (await body(on)) as { recoveryCodes: string[] };
  const regen = await mfaPOST(jsonReq(fresh.cookie, "/api/account/mfa", "POST", { action: "regenerate", code: recoveryCodes[0] }));
  assert.equal(regen.status, 200, JSON.stringify(await body(regen)));
  const { recoveryCodes: newCodes } = (await body(regen)) as { recoveryCodes: string[] };
  const off = await mfaPOST(jsonReq(fresh.cookie, "/api/account/mfa", "POST", { action: "disable", code: newCodes[0] }));
  assert.equal(off.status, 200, JSON.stringify(await body(off)));
  const notes = (await mails(email, "security-change")).map((m) => m.subject).sort();
  assert.deepEqual(notes, ["New two-factor recovery codes were made (Keplar)", "Two-factor sign-in was turned off (Keplar)", "Two-factor sign-in was turned on (Keplar)"]);
  const one = (await mails(email, "security-change"))[0]!;
  assert.match(one.text, /\/secure-account\?token=/, "with the 'wasn't me' path");
  assert.ok(!one.text.includes(secret), "no secret in the email");
});

test("F5: deleting immediately needs a recent sign-in; scheduling a deletion does not", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "del-old@example.com";
  const old = await oldSignIn(email);
  assert.deepEqual(await reauthOf(await deletePOST(jsonReq(old.cookie, "/api/account/delete", "POST", { confirmEmail: email, now: true }))), { status: 403, code: "reauth_required" });
  assert.ok(await userRow(email), "nothing was deleted");
  const scheduled = await deletePOST(jsonReq(old.cookie, "/api/account/delete", "POST", { confirmEmail: email }));
  assert.equal(scheduled.status, 200);
  assert.ok((await body(scheduled)).scheduledFor, "a cancellable, emailed schedule needs no fresh sign-in");
  const freshEmail = "del-new@example.com";
  const fresh = await signIn(freshEmail);
  const now = await deletePOST(jsonReq(fresh.cookie, "/api/account/delete", "POST", { confirmEmail: freshEmail, now: true }));
  assert.equal(now.status, 200, JSON.stringify(await body(now)));
  assert.equal(await userRow(freshEmail), undefined);
});

test("F5: the data export needs a recent sign-in (and ?check=1 asks without exporting)", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const old = await oldSignIn("exp-old@example.com");
  assert.deepEqual(await reauthOf(await exportGET(call(old.cookie, "/api/account/export?check=1"))), { status: 403, code: "reauth_required" });
  assert.deepEqual(await reauthOf(await exportGET(call(old.cookie, "/api/account/export"))), { status: 403, code: "reauth_required" });
  const fresh = await signIn("exp-new@example.com");
  const check = await exportGET(call(fresh.cookie, "/api/account/export?check=1"));
  assert.equal(check.status, 200);
  assert.deepEqual(await check.json(), { ok: true });
  const full = await exportGET(call(fresh.cookie, "/api/account/export"));
  assert.equal(full.status, 200);
  assert.match(full.headers.get("content-disposition") ?? "", /attachment/);
  await full.text();
});

test("F5 + F10: creating an API key needs a recent sign-in, and the owner is emailed", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const old = await oldSignIn("key-old@example.com", 20, "pro");
  assert.deepEqual(await reauthOf(await keysPOST(jsonReq(old.cookie, "/api/keys", "POST", { name: "ci" }))), { status: 403, code: "reauth_required" });
  const email = "key-new@example.com";
  const fresh = await signIn(email, "pro");
  const r = await keysPOST(jsonReq(fresh.cookie, "/api/keys", "POST", { name: "ci" }));
  assert.equal(r.status, 201, JSON.stringify(await body(r)));
  const key = String((await body(r)).key);
  const note = (await mails(email, "security-change"))[0];
  assert.ok(note, "owner emailed");
  assert.equal(note.subject, "A new API key was created (Keplar)");
  assert.match(note.text, /Name: ci/);
  assert.ok(!note.text.includes(key), "never the key itself");
});

test("F5: a sign-in exactly inside the window passes, just outside does not", async () => {
  const { requireRecentSignIn, REAUTH_WINDOW_MS } = await import("@/lib/accounts/reauth");
  const now = Date.now();
  assert.doesNotThrow(() => requireRecentSignIn({ session: { createdAt: new Date(now - REAUTH_WINDOW_MS + 1000) } }, now));
  assert.throws(() => requireRecentSignIn({ session: { createdAt: new Date(now - REAUTH_WINDOW_MS - 1000) } }, now), (e: { status?: number; code?: string }) => e.status === 403 && e.code === "reauth_required");
  assert.throws(() => requireRecentSignIn({ session: { createdAt: null } }, now), "unknown sign-in time is not recent");
  assert.throws(() => requireRecentSignIn({ session: { createdAt: new Date(now + 60_000) } }, now), "a sign-in time in the future is not trusted");
});

test("F5: a Business handoff can't make an old sign-in look fresh", async () => {
  const { signTicket, verifyTicket, newNonce, nonceHash } = await import("@/lib/business/handoff");
  const nonce = newNonce();
  const authAt = Date.now() - 3 * 3_600_000;
  const t = signTicket("s3cret-for-this-test-0123456789abcdef", { userId: "u", email: "b@example.com", name: null, authAt }, nonceHash(nonce));
  const v = verifyTicket("s3cret-for-this-test-0123456789abcdef", t, nonce);
  assert.ok(v.ok && v.user.authAt === authAt);
  assert.match(readFileSync("src/lib/accounts/business-auth.ts", "utf8"), /authAt: check\.user\.authAt/);
  assert.match(readFileSync("src/lib/accounts/desktop-auth.ts", "utf8"), /authAt: who\.authAt/);
});

// ── F7 ────────────────────────────────────────────────────────────────────────

test("F7: magic-link limits are shared across instances (Postgres without Upstash)", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const src = readFileSync("src/lib/accounts/stateless-magic-link.ts", "utf8");
  for (const k of ["magic:email:", "magic:ipemail:", "magic:ip:"]) assert.match(src, new RegExp(`rateLimit\\(\`${k}[^)]*\\{ shared: true \\}\\)`), k);
  const auth = await getAuth();
  const email = "shared-limit@example.com";
  for (let i = 0; i < 3; i++) await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `10.82.0.${i + 1}` }, body: JSON.stringify({ email }) }));
  // The per-email counter lives in the database, so another instance (empty memory) sees it too.
  const row = (await neonQuery("SELECT hits FROM keplar_ratelimit WHERE key = $1", [`magic:email:${email}`]))[0];
  assert.equal(Number(row?.hits), 3, "counted in the shared store");
  const fourth = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "10.82.0.9" }, body: JSON.stringify({ email }) }));
  assert.equal(fourth.status, 429);
});
