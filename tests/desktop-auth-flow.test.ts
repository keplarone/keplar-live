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
/** The short code each started request showed in the app: the person types it on the connect page (AUTH-6). */
const shownFor = new Map<string, string>();
const post = async (path: string, body: unknown, opts: { cookie?: string; origin?: string | null; typed?: boolean } = {}) => {
  const a = await auth();
  const b = body as Record<string, unknown>;
  if (path === "approve" && opts.typed !== false && b && typeof b.rid === "string" && b.code === undefined && shownFor.has(b.rid)) body = { ...b, code: shownFor.get(b.rid) };
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip() };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await a.handler(new Request(`${ORIGIN}/api/auth/desktop/${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads loosely-typed JSON
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (path === "start" && typeof json.rid === "string") shownFor.set(json.rid, json.code);
  return { res, json };
};
/** What the Keplar One window sends when it loads the finish URL itself (keplar-desktop src/main/user-agent.ts). */
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) keplar-desktop/0.3.1 Chrome/140.0.0.0 Electron/38.1.0 Safari/537.36 keplar-desktop";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
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

async function finish(ticket: string, cookie?: string, headers: Record<string, string> = { "user-agent": DESKTOP_UA, "sec-fetch-site": "none" }) {
  const a = await auth();
  const res = await a.handler(new Request(`${ORIGIN}/api/auth/desktop/finish?ticket=${ticket}`, { method: "GET", redirect: "manual", headers: { "x-forwarded-for": ip(), ...headers, ...(cookie ? { cookie } : {}) } } as RequestInit));
  return res;
}

/** Start, approve as `email`, exchange with the verifier: the ticket the app would load. */
async function ticketFor(email: string): Promise<string> {
  const b = await begin();
  const { cookie } = await signIn(email);
  const ok = await post("approve", { rid: b.rid }, { cookie });
  const ex = await app("exchange", { rid: b.rid, code: parseAuthDeepLink(ok.json.deepLink)!.code, verifier: b.verifier });
  assert.equal(ex.res.status, 200);
  return ex.json.ticket as string;
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

test("Keplar Business desktop app: keplar-business:// link, and the session is issued only on business.keplar.one", async () => {
  const verifier = newSecret();
  const st = await app("start", { challenge: challengeOf(verifier), label: "", app: "business" });
  assert.equal(st.res.status, 200);
  assert.equal(new URL(st.json.url).origin, ORIGIN, "the browser still approves on keplar.one, where the account signs in");
  const { cookie: browser } = await signIn("flow-business@example.com");
  const ok = await post("approve", { rid: st.json.rid }, { cookie: browser });
  assert.equal(ok.res.status, 200);
  assert.match(ok.json.deepLink, /^keplar-business:\/\/auth\?/);
  assert.equal(parseAuthDeepLink(ok.json.deepLink), null, "Keplar One's app ignores a Business link");
  const link = parseAuthDeepLink(ok.json.deepLink, "business");
  assert.ok(link);

  const a = await auth();
  const finishOn = async (host: string) => {
    const ex = await app("exchange", { rid: st.json.rid, code: link.code, verifier });
    return { ex, fin: ex.res.status === 200 ? await a.handler(new Request(`https://${host}/api/auth/desktop/finish?ticket=${ex.json.ticket}`, { method: "GET", redirect: "manual", headers: { host, "x-forwarded-for": ip() } } as RequestInit)) : null };
  };
  // Opened on keplar.one (the wrong host): no session, and the ticket is spent.
  const wrong = await finishOn("keplar.one");
  assert.equal(wrong.fin?.status, 302);
  assert.match(wrong.fin?.headers.get("location") ?? "", /error=desktop_link_used/);
  assert.equal(cookieOf(wrong.fin!), "");

  // A fresh request finished on the Business host: a Business session, straight into the workspace.
  const v2 = newSecret();
  const st2 = await app("start", { challenge: challengeOf(v2), app: "business" });
  const ok2 = await post("approve", { rid: st2.json.rid }, { cookie: browser });
  const l2 = parseAuthDeepLink(ok2.json.deepLink, "business")!;
  const ex2 = await app("exchange", { rid: st2.json.rid, code: l2.code, verifier: v2 });
  assert.equal(ex2.res.status, 200);
  const fin = await a.handler(new Request(`https://business.keplar.one/api/auth/desktop/finish?ticket=${ex2.json.ticket}`, { method: "GET", redirect: "manual", headers: { host: "business.keplar.one", "x-forwarded-for": ip() } } as RequestInit));
  assert.equal(fin.status, 302);
  assert.equal(fin.headers.get("location"), "/work");
  const cookie = cookieOf(fin);
  assert.match(cookie, /session_token=/);
  const session = await (await import("@/lib/accounts/auth")).getSession(new Headers({ cookie }));
  assert.equal(session?.user.email, "flow-business@example.com");
});

// AUTH-6 (docs/rebirth/AUDIT.md): phishing. Someone starts a sign-in in THEIR app and sends you the connect link; you're signed in
// and click Connect. Without the code their app shows (which the page never shows) nothing is approved.
test("approve without the app's code (a link someone sent) is refused, and the app learns nothing", async () => {
  const b = await begin();
  const { cookie } = await signIn("flow-phish@example.com");
  const bare = await post("approve", { rid: b.rid }, { cookie, typed: false });
  assert.equal(bare.res.status, 400);
  assert.equal(bare.json.code, "REQUEST_WRONG_CODE");
  assert.equal((await post("approve", { rid: b.rid, code: "AAA-AAA" }, { cookie })).res.status, 400);
  assert.equal((await app("poll", { rid: b.rid, verifier: b.verifier })).json.status, "pending");
  assert.equal((await post("approve", { rid: b.rid, code: b.shown.toLowerCase() }, { cookie })).res.status, 200);
});

// AUTH-6: login CSRF. Someone finishes their own sign-in up to the ticket and gets YOUR browser to open the finish link: you would
// be signed in to their account (and type your data into it). The ticket only works when the Keplar One window loads it itself.
test("finish refuses a ticket opened from another site's link or in an ordinary browser", async () => {
  // A link or redirect from another site: refused before the ticket is touched, so the app can still finish with it.
  const t1 = await ticketFor("flow-csrf-1@example.com");
  for (const site of ["cross-site", "same-site"]) {
    const res = await finish(t1, undefined, { "user-agent": BROWSER_UA, "sec-fetch-site": site });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location") ?? "", /error=desktop_link_used/);
    assert.equal(cookieOf(res), "", `no session from a ${site} link`);
  }
  const app1 = await finish(t1);
  assert.match(cookieOf(app1), /session_token=/, "the app's own load still works");

  // Pasted or typed into an ordinary browser (no app user agent): no session, and the ticket is spent.
  const t2 = await ticketFor("flow-csrf-2@example.com");
  const typed = await finish(t2, undefined, { "user-agent": BROWSER_UA, "sec-fetch-site": "none" });
  assert.equal(typed.status, 302);
  assert.equal(cookieOf(typed), "");
  assert.equal(cookieOf(await finish(t2)), "", "single use");
});
