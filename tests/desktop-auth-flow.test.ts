import "./setup";
import "./helpers/oauth-env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn } from "./helpers/session";
import { challengeOf, newSecret, parseAuthDeepLink } from "@/lib/desktop-auth/core";

const ORIGIN = "https://keplar.one";
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon(); // null when PGlite isn't installed: the same flow then runs on the memory store
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

const auth = async () => (await import("@/lib/accounts/auth")).auth;
let n = 0;
const ip = () => `10.77.${(++n >> 8) & 255}.${n & 255}`;
const post = async (path: string, body: unknown, opts: { cookie?: string; origin?: string | null } = {}) => {
  const a = await auth();
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip() };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await a.handler(new Request(`${ORIGIN}/api/auth/desktop/${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads loosely-typed JSON
  return { res, json: (await res.json().catch(() => ({}))) as Record<string, any> };
};
/** The desktop app's own requests: no cookies, no Origin (it is not a web page). */
const app = (path: string, body: unknown) => post(path, body, { origin: null });
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");

async function begin() {
  const verifier = newSecret();
  const { res, json } = await app("start", { challenge: challengeOf(verifier), label: "Keplar One on Windows" });
  assert.equal(res.status, 200);
  assert.equal(json.rid.length, 32);
  assert.match(json.code, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  assert.equal(new URL(json.url).pathname, "/desktop/connect");
  assert.equal(new URL(json.url).searchParams.get("rid"), json.rid);
  return { verifier, rid: json.rid as string, shown: json.code as string };
}

async function finish(ticket: string, cookie?: string) {
  const a = await auth();
  const res = await a.handler(new Request(`${ORIGIN}/api/auth/desktop/finish?ticket=${ticket}`, { method: "GET", redirect: "manual", headers: { "x-forwarded-for": ip(), ...(cookie ? { cookie } : {}) } } as RequestInit));
  return res;
}

test("start validates the challenge", async () => {
  for (const challenge of [undefined, "", "short", "x".repeat(44), 5]) assert.equal((await app("start", { challenge })).res.status, 400);
});

test("the browser side needs a signed-in session and our Origin", async () => {
  const b = await begin();
  assert.equal((await post("approve", { rid: b.rid })).res.status, 401); // right origin, no session
  const { cookie } = await signIn("flow-origin@example.com");
  assert.equal((await post("approve", { rid: b.rid }, { cookie, origin: "https://evil.example" })).res.status, 403);
  assert.equal((await post("approve", { rid: b.rid }, { cookie, origin: null })).res.status, 403);
  assert.equal((await post("deny", { rid: b.rid }, { origin: "https://evil.example" })).res.status, 403);
});

test("full flow: start, sign in in the browser, approve, deep link, exchange, finish => a real session for that account", async () => {
  const b = await begin();
  const { cookie: browser } = await signIn("flow-full@example.com");
  const ok = await post("approve", { rid: b.rid }, { cookie: browser });
  assert.equal(ok.res.status, 200);
  const link = parseAuthDeepLink(ok.json.deepLink);
  assert.ok(link);
  assert.equal(link.rid, b.rid);

  // PKCE: someone who only has the link (and no verifier) gets nothing
  const stolen = await app("exchange", { rid: b.rid, code: link.code, verifier: newSecret() });
  assert.equal(stolen.res.status, 400);

  const ex = await app("exchange", { rid: b.rid, code: link.code, verifier: b.verifier });
  assert.equal(ex.res.status, 200);
  assert.equal(typeof ex.json.ticket, "string");

  // the code is single use
  assert.equal((await app("exchange", { rid: b.rid, code: link.code, verifier: b.verifier })).res.status, 400);

  // the app's window redeems the ticket: cookie set, redirect into the app (new accounts go to the welcome flow first)
  const fin = await finish(ex.json.ticket);
  assert.equal(fin.status, 302);
  assert.match(fin.headers.get("location") ?? "", /^\/(app|welcome)/);
  const cookie = cookieOf(fin);
  assert.match(cookie, /session_token=/);
  const a = await import("@/lib/accounts/auth");
  const session = await a.getSession(new Headers({ cookie }));
  assert.equal(session?.user.email, "flow-full@example.com");

  // the ticket is single use too: replaying the URL signs nobody in
  const replay = await finish(ex.json.ticket);
  assert.equal(replay.status, 302);
  assert.match(replay.headers.get("location") ?? "", /error=desktop_link_used/);
  assert.equal(cookieOf(replay), "");
});

test("polling fallback: the app (and only the app) learns the code once the browser approved", async () => {
  const b = await begin();
  assert.equal((await app("poll", { rid: b.rid, verifier: b.verifier })).json.status, "pending");
  const { cookie } = await signIn("flow-poll@example.com");
  assert.equal((await post("approve", { rid: b.rid }, { cookie })).res.status, 200);
  assert.equal((await app("poll", { rid: b.rid, verifier: newSecret() })).json.status, "invalid");
  const polled = await app("poll", { rid: b.rid, verifier: b.verifier });
  assert.equal(polled.json.status, "approved");
  const ex = await app("exchange", { rid: b.rid, code: polled.json.code, verifier: b.verifier });
  assert.equal(ex.res.status, 200);
  assert.equal((await app("poll", { rid: b.rid, verifier: b.verifier })).json.status, "used");
});

test("cancel from the app: the browser's approve is refused afterwards", async () => {
  const b = await begin();
  assert.deepEqual((await app("cancel", { rid: b.rid, verifier: newSecret() })).json, { ok: false });
  assert.deepEqual((await app("cancel", { rid: b.rid, verifier: b.verifier })).json, { ok: true });
  const { cookie } = await signIn("flow-cancel@example.com");
  assert.equal((await post("approve", { rid: b.rid }, { cookie })).res.status, 400);
  assert.equal((await app("poll", { rid: b.rid, verifier: b.verifier })).json.status, "cancelled");
});

test("deny from the browser: the app sees it on its next poll", async () => {
  const b = await begin();
  assert.equal((await post("deny", { rid: b.rid })).res.status, 200);
  assert.equal((await app("poll", { rid: b.rid, verifier: b.verifier })).json.status, "denied");
});

test("Add account: finishing while another account is signed in keeps both on the device", async () => {
  const first = await signIn("flow-first@example.com");
  const b = await begin();
  const { cookie: browser } = await signIn("flow-second@example.com");
  const ok = await post("approve", { rid: b.rid }, { cookie: browser });
  const link = parseAuthDeepLink(ok.json.deepLink)!;
  const ex = await app("exchange", { rid: b.rid, code: link.code, verifier: b.verifier });
  // the app's window still carries the first account's cookies
  const fin = await finish(ex.json.ticket, first.cookie);
  assert.equal(fin.status, 302);
  const raw = fin.headers.getSetCookie().join("\n");
  assert.match(raw, /keplar_acct_1=/, "the first account is parked in a slot");
  const a = await import("@/lib/accounts/auth");
  const session = await a.getSession(new Headers({ cookie: cookieOf(fin) }));
  assert.equal(session?.user.email, "flow-second@example.com");
});

test("an unknown or malformed request id is refused everywhere", async () => {
  const { cookie } = await signIn("flow-unknown@example.com");
  assert.equal((await post("approve", { rid: "nope" }, { cookie })).res.status, 400);
  assert.equal((await app("exchange", { rid: "nope", code: "x", verifier: "y" })).res.status, 400);
  assert.equal((await app("poll", { rid: "nope", verifier: "y" })).json.status, "invalid");
  assert.equal((await finish("not-a-ticket")).status, 302);
});
