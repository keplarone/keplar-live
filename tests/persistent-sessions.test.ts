import "./setup";
import "./helpers/oauth-env";
import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn, call, jsonReq } from "./helpers/session";
import { userIdForEmail } from "@/lib/accounts/magic-token";
import { LEGACY_SESSION_CUTOFF } from "@/lib/accounts/persist";
import { neonQuery } from "@/lib/create/platform/neon";
import { GET as sessionsGET, DELETE as sessionsDELETE, POST as sessionsPOST } from "@/app/api/account/sessions/route";
import { GET as chatsGET } from "@/app/api/chats/route";
import { PUT as chatPUT } from "@/app/api/chats/[id]/route";

const ORIGIN = "https://keplar.one";
const SECRET = process.env.BETTER_AUTH_SECRET as string;
const T = (v: unknown) => v === true || v === "t" || v === "true"; // Postgres boolean as text (Neon says "t", PGlite "true")

let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const getAuth = async () => (await import("@/lib/accounts/auth")).auth;
const getSess = async (cookie: string) => (await import("@/lib/accounts/auth")).getSession(new Headers({ cookie }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Magic-link sign-in returning every raw Set-Cookie header. */
async function magicSignIn(email: string, opts: { remember?: boolean; cookie?: string; ua?: string; ip?: string } = {}) {
  const auth = await getAuth();
  const { listOutbox } = await import("@/lib/accounts/outbox");
  const h = { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": opts.ip ?? `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const send = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: h, body: JSON.stringify({ email, callbackURL: "/account", ...(opts.remember === false ? { remember: false } : {}) }) }));
  assert.equal(send.status, 200);
  const mail = (await listOutbox()).filter((m) => m.to.toLowerCase() === email.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at))[0];
  const token = new URL(mail!.text.match(/https:\/\/\S+/)![0]).searchParams.get("token");
  const res = await auth.handler(new Request(`${ORIGIN}/api/auth/magic-link/confirm`, { method: "POST", headers: { ...h, ...(opts.cookie ? { cookie: opts.cookie } : {}), ...(opts.ua ? { "user-agent": opts.ua } : {}) }, body: JSON.stringify({ token }) }));
  assert.equal(res.status, 200);
  const raw = res.headers.getSetCookie();
  return { res, raw, cookie: raw.map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ") };
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = (claims: object) => `${b64({ alg: "RS256", kid: "test", typ: "JWT" })}.${b64(claims)}.c2ln`;
const realFetch = () => (fake ? (globalThis.fetch as typeof fetch) : fetch);

async function oauthSignIn(provider: "google" | "microsoft", claims: object, opts: { remember?: boolean; cookie?: string } = {}) {
  const auth = await getAuth();
  const start = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ provider, callbackURL: "/account", errorCallbackURL: "/signin" }) }));
  assert.equal(start.status, 200);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  const stateCookies = start.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));
  const prev = globalThis.fetch;
  const inner = realFetch();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (u.startsWith("https://oauth2.googleapis.com/token") || /login\.microsoftonline\.com\/.+\/token/.test(u)) {
      return new Response(JSON.stringify({ access_token: "at-test", token_type: "Bearer", expires_in: 3600, scope: "openid email profile", id_token: fakeJwt(claims) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.startsWith("https://graph.microsoft.com/")) return new Response("", { status: 404 });
    return inner(input, init);
  }) as typeof fetch;
  try {
    const cookie = [...stateCookies, ...(opts.remember === false ? ["keplar_remember=0"] : []), ...(opts.cookie ? [opts.cookie] : [])].join("; ");
    const cb = await auth.handler(new Request(`${ORIGIN}/api/auth/callback/${provider}?code=test-code&state=${encodeURIComponent(state)}`, { headers: { cookie, "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } }));
    const raw = cb.headers.getSetCookie();
    return { cb, raw, cookie: raw.map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ") };
  } finally {
    globalThis.fetch = prev;
  }
}
const googleClaims = (email: string, name = "Ada") => ({ iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, sub: `g-${email}`, email, email_verified: true, name });
const attr = (setCookie: string, name: string) => setCookie.split(";").map((p) => p.trim()).find((p) => p.toLowerCase().startsWith(`${name.toLowerCase()}`));
const rowOf = async (sql: string, p: unknown[] = []) => (await neonQuery(sql, p))[0];
/** Run `fn` with the clock (Date only) at `when`: for cookies issued before the sessions table existed. */
async function at<T>(when: number, fn: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ["Date"], now: when });
  try {
    return await fn();
  } finally {
    mock.timers.reset();
  }
}
const PRE_TABLE = LEGACY_SESSION_CUTOFF - 10 * 86_400_000; // issued before keplar_sessions existed
const IN_WINDOW = LEGACY_SESSION_CUTOFF + 10 * 86_400_000; // checked while such cookies are still adopted (see persist.ts)

test("no database: magic-link sign-in still works (stateless cookie) and the device list is unavailable", async () => {
  const keep = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { cookie, raw } = await magicSignIn("nodb@example.com");
    const s = await getSess(cookie);
    assert.equal(s?.user.email, "nodb@example.com");
    assert.equal(s?.user.id, userIdForEmail(SECRET, "nodb@example.com"), "derived id, as before");
    assert.match(raw.find((c) => c.includes("session_token"))!, /Max-Age=5184000/i, "persistent even without a database");
    const res = await sessionsGET(call(cookie, "/api/account/sessions"));
    assert.equal(res.status, 501);
  } finally {
    process.env.DATABASE_URL = keep;
  }
});

test("old stateless cookies keep working after the upgrade and are adopted into Neon (during the migration window)", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const keep = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL; // sign in the way production did before this change
  const old = await at(PRE_TABLE, () => magicSignIn("legacy@example.com"));
  process.env.DATABASE_URL = keep;
  const s = await at(IN_WINDOW, () => getSess(old.cookie));
  assert.ok(s, "existing signed-in user is not logged out");
  assert.equal(s.user.email, "legacy@example.com");
  assert.equal(s.user.id, userIdForEmail(SECRET, "legacy@example.com"), "same account id as before, so the same plan/credits/chats");
  const sess = await rowOf("SELECT user_id, provider FROM keplar_sessions WHERE id = $1", [s.session.id]);
  assert.equal(sess.user_id, s.user.id);
  assert.equal(sess.provider, "legacy");
  assert.ok(await rowOf("SELECT 1 FROM keplar_users WHERE email = 'legacy@example.com'"), "user row created on first sight");
});

test("session cookie is persistent: Max-Age, HttpOnly, Secure, SameSite=Lax, Path=/ (and no Expires-less session cookie)", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { raw } = await magicSignIn("cookies@example.com");
  const token = raw.find((c) => c.startsWith("__Secure-better-auth.session_token="))!;
  assert.ok(token, "Secure-prefixed session cookie");
  assert.equal(attr(token, "Max-Age"), "Max-Age=5184000", "60 days");
  for (const a of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(token.split(";").map((p) => p.trim()).includes(a), a);
  const data = raw.find((c) => c.startsWith("__Secure-better-auth.session_data"))!;
  assert.ok(data && /Max-Age=5184000/.test(data) && /HttpOnly/.test(data) && /SameSite=Lax/.test(data), "encrypted cache cookie is persistent too");
  assert.ok(!raw.some((c) => c.includes("dont_remember=true")), "no session-only marker when remembered");
});

test("Remember me off gives a session-only cookie (no Max-Age) that is still HttpOnly/Secure/Lax", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const { raw, cookie } = await magicSignIn("forget@example.com", { remember: false });
  const token = raw.find((c) => c.startsWith("__Secure-better-auth.session_token="))!;
  assert.ok(!/max-age|expires/i.test(token), "browser-session cookie");
  assert.ok(/HttpOnly/.test(token) && /Secure/.test(token) && /SameSite=Lax/.test(token));
  assert.ok(raw.some((c) => c.includes("dont_remember=")), "marker so refreshes stay session-only");
  assert.ok(await getSess(cookie));
  const row = await rowOf("SELECT remember, (expires_at < now() + interval '2 days') AS short FROM keplar_sessions s JOIN keplar_users u ON u.id = s.user_id WHERE u.email = 'forget@example.com'");
  assert.equal(T(row.remember), false);
  assert.equal(T(row.short), true, "server record lapses after a day");
});

test("accounts persist in Neon: one user per email with id, name, created_at, last_login and linked providers", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "grace@example.com";
  const a = await magicSignIn(email);
  const first = await rowOf("SELECT id, name, created_at, last_login, providers FROM keplar_users WHERE email = $1", [email]);
  assert.equal(first.id, userIdForEmail(SECRET, email));
  assert.ok(first.created_at && first.last_login);
  assert.deepEqual(JSON.parse(first.providers as string), ["magic-link"]);
  await new Promise((r) => setTimeout(r, 15));
  const g = await oauthSignIn("google", googleClaims("Grace@Example.com", "Grace H"));
  assert.equal(g.cb.status, 302, "google callback redirects");
  const after = await rowOf("SELECT id, created_at, last_login, providers FROM keplar_users WHERE email = $1", [email]);
  assert.equal(after.id, first.id, "same account whether magic link or Google");
  assert.equal(after.created_at, first.created_at);
  assert.ok(String(after.last_login) > String(first.last_login), "last_login moves");
  assert.deepEqual(JSON.parse(after.providers as string).sort(), ["google", "magic-link"]);
  assert.equal((await neonQuery("SELECT 1 FROM keplar_users WHERE email = $1", [email])).length, 1);
  const sa = await getSess(a.cookie);
  const sg = await getSess(g.cookie);
  assert.equal(sa?.user.id, sg?.user.id);
  assert.notEqual(sa?.session.id, sg?.session.id, "two devices, two sessions");
});

test("same account across Google, Microsoft and magic link: plan, credits, chats follow the persisted account", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "linus@example.com";
  const m = await signIn(email, "plus");
  const g = await oauthSignIn("google", googleClaims(email, "Linus"));
  const ms = await oauthSignIn("microsoft", { iss: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0", tid: "9188040d-6c67-4c5b-b112-36a304b66dad", oid: "o1", sub: "s1", aud: process.env.MICROSOFT_CLIENT_ID, email, name: "Linus" });
  const { currentWorkspace } = await import("@/lib/create/platform/workspace");
  const wsM = await currentWorkspace(call(m.cookie, "/api/compute"));
  const wsG = await currentWorkspace(call(g.cookie, "/api/compute"));
  const wsMs = await currentWorkspace(call(ms.cookie, "/api/compute"));
  assert.equal(wsG.id, wsM.id);
  assert.equal(wsMs.id, wsM.id);
  assert.equal(wsG.plan, "plus", "the plan set through one login shows on the others");
  assert.equal(wsG.userId, wsM.userId);
  // chats saved via magic link are visible from the Google session
  const put = await chatPUT(jsonReq(m.cookie, "/api/chats/thr_persist1", "PUT", { title: "Persisted", messages: [{ role: "user", text: "hi" }] }), ctx("thr_persist1"));
  assert.equal(put.status, 200);
  const list = (await (await chatsGET(call(g.cookie, "/api/chats"))).json()) as { chats: { id: string }[] };
  assert.deepEqual(list.chats.map((c) => c.id), ["thr_persist1"]);
});

test("session ids rotate on login and the previous session in the browser is revoked", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "rotate@example.com";
  const one = await magicSignIn(email);
  const s1 = await getSess(one.cookie);
  const two = await magicSignIn(email, { cookie: one.cookie });
  const s2 = await getSess(two.cookie);
  assert.ok(s1 && s2);
  assert.notEqual(s1.session.id, s2.session.id, "fresh id on every sign-in");
  assert.notEqual(s1.session.token, s2.session.token);
  assert.equal(await getSess(one.cookie), null, "the session this browser held before is no longer valid");
  assert.ok(await getSess(two.cookie));
});

test("revocation: sign out one device, the list shows it, other users can't revoke it, sign out of all devices", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "revoke@example.com";
  const laptop = await magicSignIn(email, { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", ip: "203.0.113.7" });
  const phone = await magicSignIn(email, { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" });
  const stranger = await magicSignIn("stranger@example.com");

  const list = (await (await sessionsGET(call(laptop.cookie, "/api/account/sessions"))).json()) as { sessions: { id: string; current: boolean; device: string }[] };
  assert.equal(list.sessions.length, 2);
  assert.equal(list.sessions.filter((s) => s.current).length, 1);
  assert.deepEqual(list.sessions.map((s) => s.device).sort(), ["Chrome on macOS", "Safari on iOS"]);
  assert.ok(!JSON.stringify(list).includes("203.0.113.7"), "no raw IP is exposed");
  const stored = await rowOf("SELECT user_agent, ip_hash FROM keplar_sessions s JOIN keplar_users u ON u.id = s.user_id WHERE u.email = $1 AND s.user_agent LIKE '%Macintosh%'", [email]);
  assert.ok(String(stored.user_agent).includes("Macintosh"));
  assert.match(String(stored.ip_hash), /^[0-9a-f]{24}$/);
  assert.ok(!String(stored.ip_hash).includes("203"), "IP is stored only as a keyed hash");

  const phoneId = (await getSess(phone.cookie))!.session.id;
  const denied = await sessionsDELETE(jsonReq(stranger.cookie, "/api/account/sessions", "DELETE", { id: phoneId }));
  assert.equal(denied.status, 404, "can't revoke someone else's session");
  assert.ok(await getSess(phone.cookie));

  const del = await sessionsDELETE(jsonReq(laptop.cookie, "/api/account/sessions", "DELETE", { id: phoneId }));
  assert.equal(del.status, 200);
  assert.equal(await getSess(phone.cookie), null, "revoked device is signed out");
  assert.ok(await getSess(laptop.cookie), "other device unaffected");

  const tablet = await magicSignIn(email);
  const all = await sessionsPOST(jsonReq(laptop.cookie, "/api/account/sessions", "POST", { action: "all" }));
  assert.equal(all.status, 200);
  assert.ok(all.headers.getSetCookie().some((c) => c.includes("session_token=") && /Max-Age=0/i.test(c)), "this browser's cookie is cleared");
  assert.equal(await getSess(laptop.cookie), null);
  assert.equal(await getSess(tablet.cookie), null);
  assert.ok(await getSess(stranger.cookie), "other accounts untouched");
});

test("after 'sign out of all devices' the user can sign in again, and old never-recorded cookies stay dead", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "again@example.com";
  const keep = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const legacy = await at(PRE_TABLE, () => magicSignIn(email)); // issued before the table existed: no row
  process.env.DATABASE_URL = keep;
  const first = await magicSignIn(email);
  const all = await sessionsPOST(jsonReq(first.cookie, "/api/account/sessions", "POST", { action: "all" }));
  assert.equal(all.status, 200);
  assert.equal(await at(IN_WINDOW, () => getSess(legacy.cookie)), null, "a cookie older than the sign-out-everywhere cutoff is refused even without a row, inside the adoption window too");
  assert.equal(await getSess(first.cookie), null);
  await new Promise((r) => setTimeout(r, 20));
  const fresh = await magicSignIn(email);
  assert.ok(await getSess(fresh.cookie), "signing in again works");
});

test("sign-out through the auth API ends the server-side session (a copied cookie stops working)", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const auth = await getAuth();
  const u = await magicSignIn("signout@example.com");
  const res = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-out`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, cookie: u.cookie }, body: "{}" }));
  assert.equal(res.status, 200);
  assert.equal(await getSess(u.cookie), null);
});

test("sliding expiry: activity extends the stored expiry; expired sessions are refused", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "slide@example.com";
  const u = await magicSignIn(email);
  const s = (await getSess(u.cookie))!;
  const { forgetSession } = await import("@/lib/accounts/session-guard");
  await neonQuery("UPDATE keplar_sessions SET last_seen = now() - interval '1 hour', expires_at = now() + interval '3 days' WHERE id = $1", [s.session.id]);
  forgetSession(s.session.id);
  assert.ok(await getSess(u.cookie));
  const r = await rowOf("SELECT (expires_at > now() + interval '59 days') AS slid FROM keplar_sessions WHERE id = $1", [s.session.id]);
  assert.equal(T(r.slid), true, "expiry pushed back out to 60 days");
  await neonQuery("UPDATE keplar_sessions SET expires_at = now() - interval '1 minute' WHERE id = $1", [s.session.id]);
  forgetSession(s.session.id);
  assert.equal(await getSess(u.cookie), null);
});

test("OAuth 'Remember me' off gives a session-only cookie; default is persistent", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const on = await oauthSignIn("google", googleClaims("oauth-on@example.com"));
  assert.match(on.raw.find((c) => c.includes("session_token="))!, /Max-Age=5184000/);
  const off = await oauthSignIn("google", googleClaims("oauth-off@example.com"), { remember: false });
  const tok = off.raw.find((c) => c.includes("session_token=") && !/=;/.test(c))!;
  assert.ok(!/max-age|expires/i.test(tok));
  assert.ok(await getSess(off.cookie));
});

test("CSRF/origin checks intact: cross-site confirm and cross-site device revocation are refused", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const auth = await getAuth();
  const evil = await auth.handler(new Request(`${ORIGIN}/api/auth/magic-link/confirm`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.test" }, body: JSON.stringify({ token: "v1.x.y" }) }));
  assert.equal(evil.status, 403);
  const u = await magicSignIn("csrf@example.com");
  const bad = await sessionsPOST(new Request(`${ORIGIN}/api/account/sessions`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.test", cookie: u.cookie }, body: JSON.stringify({ action: "all" }) }));
  assert.equal(bad.status, 403);
  assert.ok(await getSess(u.cookie), "still signed in");
  const unauth = await sessionsGET(call(null, "/api/account/sessions"));
  assert.equal(unauth.status, 401);
});

test("rate limits: confirm attempts and the magic-link request are limited per IP", async () => {
  const auth = await getAuth();
  const ip = "198.51.100.77";
  let limited = 0;
  for (let i = 0; i < 14; i++) {
    const r = await auth.handler(new Request(`${ORIGIN}/api/auth/magic-link/confirm`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify({ token: "v1.bad.token" }) }));
    if (r.status === 429) limited++;
  }
  assert.ok(limited > 0, "confirm is rate limited");
  let mailLimited = 0;
  for (let i = 0; i < 5; i++) {
    const r = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "198.51.100.78" }, body: JSON.stringify({ email: "flood@example.com" }) }));
    if (r.status === 429) mailLimited++;
  }
  assert.ok(mailLimited > 0, "link requests are rate limited");
});

test("no secrets are logged or stored: tokens, cookies and raw IPs stay out of logs and tables", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const lines: string[] = [];
  const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) console[k] = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  let u: Awaited<ReturnType<typeof magicSignIn>>;
  try {
    u = await magicSignIn("quiet@example.com", { ip: "192.0.2.55" });
    await getSess(u.cookie);
    await sessionsGET(call(u.cookie, "/api/account/sessions"));
  } finally {
    Object.assign(console, orig);
  }
  const secretish = [u.cookie.split("; ").map((c) => c.split("=")[1]), SECRET, "192.0.2.55"].flat();
  const out = lines.join("\n");
  for (const s of secretish) if (s && s.length > 8) assert.ok(!out.includes(s), "not logged");
  const dump = JSON.stringify(await neonQuery("SELECT * FROM keplar_sessions"));
  assert.ok(!dump.includes("192.0.2.55"));
  for (const c of u.cookie.split("; ")) assert.ok(!dump.includes(c.split("=")[1]), "cookie values never stored");
});
