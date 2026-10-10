import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeMagicToken, createMagicToken, safeCallbackPath, userIdForEmail, verifyMagicToken } from "@/lib/accounts/magic-token";

const SECRET = "test-secret-for-magic-links-0123456789abcdefghij";
process.env.BETTER_AUTH_SECRET = SECRET;
process.env.BETTER_AUTH_URL = "https://keplar.one";

test("magic token: round-trips, normalizes email, rejects tampering and other keys", () => {
  const { token, payload } = createMagicToken(SECRET, { email: "  Ada@Example.COM ", callbackURL: "/app?x=1" });
  assert.match(token, /^v1\.[\w-]+\.[\w-]+$/);
  const res = verifyMagicToken(SECRET, token);
  assert.ok(res.ok);
  assert.equal(res.payload.e, "ada@example.com");
  assert.equal(res.payload.cb, "/app?x=1");
  assert.equal(payload.exp - payload.iat, 15 * 60, "15-minute expiry");

  assert.deepEqual(verifyMagicToken("another-secret-another-secret-0123456789", token), { ok: false, reason: "bad_signature" });
  const [v, body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...payload, e: "eve@evil.test" })).toString("base64url");
  assert.deepEqual(verifyMagicToken(SECRET, `${v}.${forged}.${sig}`), { ok: false, reason: "bad_signature" });
  assert.deepEqual(verifyMagicToken(SECRET, `${v}.${body}.${sig.slice(0, -2)}`), { ok: false, reason: "bad_signature" });
  for (const bad of ["", "abc", "v2.a.b", `v1.${body}`, null, undefined, "v1..", "x".repeat(5000)]) assert.equal(verifyMagicToken(SECRET, bad as string).ok, false);
});

test("magic token: expires after 15 minutes", () => {
  const t0 = Date.UTC(2026, 8, 28, 23, 53);
  const { token } = createMagicToken(SECRET, { email: "a@b.co" }, { now: t0 });
  assert.ok(verifyMagicToken(SECRET, token, { now: t0 + 14 * 60_000 }).ok);
  assert.deepEqual(verifyMagicToken(SECRET, token, { now: t0 + 15 * 60_000 }), { ok: false, reason: "expired" });
});

test("magic token: verify never consumes (prefetch-safe); consume is single-use", () => {
  const { token } = createMagicToken(SECRET, { email: "once@b.co" });
  for (let i = 0; i < 3; i++) assert.ok(verifyMagicToken(SECRET, token).ok, "landing page / scanner GETs don't burn it");
  assert.ok(consumeMagicToken(SECRET, token).ok);
  assert.deepEqual(consumeMagicToken(SECRET, token), { ok: false, reason: "used" });
});

test("callback paths: only same-origin relative paths (no open redirects)", () => {
  assert.equal(safeCallbackPath("/account"), "/account");
  assert.equal(safeCallbackPath("/app?tab=1#x"), "/app?tab=1#x");
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "\\\\evil.test", "javascript:alert(1)", "evil.test", "/\nhttps://evil", "", undefined, null]) {
    assert.equal(safeCallbackPath(bad as string), "/account", String(bad));
  }
  const { token } = createMagicToken(SECRET, { email: "a@b.co", callbackURL: "https://evil.test/steal" });
  const res = verifyMagicToken(SECRET, token);
  assert.ok(res.ok && res.payload.cb === "/account");
});

test("user id is stable per email and secret", () => {
  assert.equal(userIdForEmail(SECRET, "Ada@Example.com"), userIdForEmail(SECRET, "ada@example.com "));
  assert.notEqual(userIdForEmail(SECRET, "ada@example.com"), userIdForEmail(SECRET, "bob@example.com"));
  assert.notEqual(userIdForEmail(SECRET, "ada@example.com"), userIdForEmail(`${SECRET}x`, "ada@example.com"));
});

const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

test("auth: request link → confirm → session readable with no server-side state; bad tokens rejected", async () => {
  process.env.KEPLAR_DEV_TOOLS = "1"; // keep the outbox body so the test can read the link
  const { auth } = await import("@/lib/accounts/auth");
  const { listOutbox } = await import("@/lib/accounts/outbox");
  const origin = "https://keplar.one";

  const send = await auth.handler(new Request(`${origin}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ email: "E2E@Example.com", callbackURL: "/account" }) }));
  assert.equal(send.status, 200);
  const mail = (await listOutbox()).find((m) => m.to === "E2E@Example.com");
  assert.ok(mail, "magic link mail written");
  const link = mail.text.match(/https:\/\/\S+/)?.[0];
  assert.ok(link && link.startsWith("https://keplar.one/signin/verify?token=v1."), "link points at the landing page on the public host");
  const token = new URL(link).searchParams.get("token") as string;

  const confirm = (t: string, o = origin) => auth.handler(new Request(`${origin}/api/auth/magic-link/confirm`, { method: "POST", headers: { "content-type": "application/json", origin: o }, body: JSON.stringify({ token: t }) }));

  assert.equal((await confirm(token, "https://evil.test")).status, 403, "foreign origin rejected");
  const ok = await confirm(token);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: true, redirectTo: "/account" });
  const cookies = cookieHeader(ok);
  assert.match(cookies, /__Secure-better-auth\.session_token=/);
  assert.match(cookies, /__Secure-better-auth\.session_data=/);

  // Nothing was stored server-side: the memory adapter holds no session, yet
  // the cookie alone resolves the session (as it would on another instance).
  const ctx = await auth.$context;
  assert.equal((await ctx.adapter.findMany({ model: "session" })).length, 0);
  for (let i = 0; i < 3; i++) {
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
    assert.equal(session?.user.email, "e2e@example.com");
    assert.equal(session?.user.emailVerified, true);
  }

  assert.equal((await confirm(token)).status, 400, "second use rejected");
  assert.equal((await confirm(`${token.slice(0, -3)}abc`)).status, 400, "tampered token rejected");
  assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: "__Secure-better-auth.session_token=forged; __Secure-better-auth.session_data=forged" }) }), null);
});
