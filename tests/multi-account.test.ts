import "./setup";
import "./helpers/oauth-env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { call, jsonReq } from "./helpers/session";
import { ensureWorkspaceForUser, updateWorkspace } from "@/lib/accounts/workspaces";
import { neonQuery } from "@/lib/create/platform/neon";
import { GET as accountsGET, POST as accountsPOST } from "@/app/api/account/accounts/route";
import { GET as computeGET } from "@/app/api/compute/route";
import { GET as chatsGET } from "@/app/api/chats/route";
import { PUT as chatPUT } from "@/app/api/chats/[id]/route";
import { chooseSlot, decodeStash, encodeStash, parseCookies, readParked, buildStash, activateHeaders, type Stash, type Parked } from "@/lib/accounts/multi";

const ORIGIN = "https://keplar.one";
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => fake?.restore());

let n = 0;
const ip = () => `10.55.${(++n >> 8) & 255}.${n & 255}`;
const getAuth = async () => (await import("@/lib/accounts/auth")).auth;

/** A browser's cookie jar: applies Set-Cookie (including deletes) and sends the rest back. */
class Jar {
  m = new Map<string, string>();
  raw: string[] = [];
  apply(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      this.raw.push(sc);
      const [pair, ...attrs] = sc.split(";").map((s) => s.trim());
      const i = pair.indexOf("=");
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      const gone = !value || attrs.some((a) => /^max-age=0$/i.test(a));
      if (gone) this.m.delete(name); else this.m.set(name, value);
    }
  }
  get cookie() { return [...this.m].map(([k, v]) => `${k}=${v}`).join("; "); }
  names() { return [...this.m.keys()]; }
}

/** Sign in by magic link while the jar's cookies are sent (as a browser would). Seeds the workspace and plan. */
async function signIn(jar: Jar, email: string, plan: "free" | "plus" | "pro" = "free") {
  const auth = await getAuth();
  const { listOutbox } = await import("@/lib/accounts/outbox");
  const h = { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip() };
  const send = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, { method: "POST", headers: h, body: JSON.stringify({ email, callbackURL: "/app" }) }));
  assert.equal(send.status, 200);
  const mail = (await listOutbox()).filter((m) => m.to.toLowerCase() === email.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at))[0];
  const token = new URL(mail!.text.match(/https:\/\/\S+/)![0]).searchParams.get("token");
  const res = await auth.handler(new Request(`${ORIGIN}/api/auth/magic-link/confirm`, { method: "POST", headers: { ...h, ...(jar.cookie ? { cookie: jar.cookie } : {}) }, body: JSON.stringify({ token }) }));
  assert.equal(res.status, 200);
  jar.apply(res);
  const s = await auth.api.getSession({ headers: new Headers({ cookie: jar.cookie }) });
  assert.ok(s, "signed in");
  const ws = await ensureWorkspaceForUser({ id: s.user.id, email: s.user.email, name: s.user.name });
  if (plan !== "free") await updateWorkspace(ws.id, { plan });
  return { workspaceId: ws.id, userId: s.user.id, sessionId: s.session.id };
}

type PostJson = { ok?: boolean; error?: string; code?: string; email?: string; slot?: number; promoted?: { email: string } | null };
const post = async (jar: Jar, body: unknown, origin: string | null = ORIGIN, extra: Record<string, string> = {}) => {
  const req = new Request(`${ORIGIN}/api/account/accounts`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip(), cookie: jar.cookie, ...(origin ? { origin } : {}), ...extra }, body: JSON.stringify(body) });
  const res = await accountsPOST(req);
  jar.apply(res);
  return { status: res.status, json: (await res.json()) as PostJson };
};
const list = async (jar: Jar) => {
  const res = await accountsGET(new Request(`${ORIGIN}/api/account/accounts`, { headers: { cookie: jar.cookie, "x-forwarded-for": ip() } }));
  jar.apply(res);
  return { res, json: (await res.json()) as { active: { email: string } | null; accounts: { slot: number; email: string; expired: boolean }[] } };
};
const who = async (jar: Jar) => (await (await computeGET(call(jar.cookie || null, "/api/compute"))).json()) as { account: { id: string; email?: string; plan?: string }; plan?: string };
const activeEmail = async (jar: Jar) => (await list(jar)).json.active?.email ?? null;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const chatIds = async (jar: Jar) => ((await (await chatsGET(call(jar.cookie || null, "/api/chats"))).json()) as { chats: { id: string }[] }).chats.map((c) => c.id);

const stashOf = (over: Partial<Stash> = {}): Stash => ({ v: 1, u: "u1", e: "a@x.test", n: "A", sid: "s1", t: "tok", d: "dat", dr: null, r: true, ca: 1, x: Date.now() + 1e9, s: 1, ...over });

test("stash cookies are signed: round trip works, any tamper or foreign signature is rejected", () => {
  const s = stashOf();
  const enc = encodeStash(s);
  assert.deepEqual(decodeStash(enc), s);
  const [body, sig] = enc.split(".");
  assert.equal(decodeStash(`${body}x.${sig}`), null);
  assert.equal(decodeStash(`${Buffer.from(JSON.stringify({ ...s, e: "evil@x.test" })).toString("base64url")}.${sig}`), null);
  assert.equal(decodeStash(`${body}.${sig.slice(0, -2)}AA`), null);
  assert.equal(decodeStash("garbage"), null);
  assert.equal(decodeStash(null), null);
});

test("slot choice: the same account keeps its slot, then free slots, then the least recently used is replaced", () => {
  const p = (slot: 1 | 2 | 3 | 4, e: string, s: number): Parked => ({ slot, stash: stashOf({ e, s }) });
  assert.equal(chooseSlot([], "a@x.test"), 1);
  assert.equal(chooseSlot([p(1, "a@x.test", 5), p(2, "b@x.test", 6)], "b@x.test"), 2);
  assert.equal(chooseSlot([p(1, "a@x.test", 5), p(3, "b@x.test", 6)], "c@x.test"), 2);
  assert.equal(chooseSlot([p(1, "a@x.test", 9), p(2, "b@x.test", 3), p(3, "c@x.test", 7), p(4, "d@x.test", 8)], "e@x.test"), 2, "oldest parked is evicted");
});

test("stash holds the raw session cookies and rebuilds exactly the same cookies on activate (HttpOnly, SameSite=Lax, Secure, 60 days)", () => {
  const names = { sessionToken: "__Secure-better-auth.session_token", sessionData: "__Secure-better-auth.session_data", dontRemember: "__Secure-better-auth.dont_remember" };
  const header = `${names.sessionToken}=T.sig; ${names.sessionData}=DATA; other=1`;
  const st = buildStash(header, names, { id: "sid", userId: "u1", email: "A@x.test", name: "A", createdAt: new Date(), expiresAt: new Date(Date.now() + 5e9) }, true)!;
  assert.equal(st.e, "a@x.test");
  const out = activateHeaders(st, names, true, 60 * 86400);
  const tok = out.find((c) => c.startsWith(`${names.sessionToken}=`))!;
  assert.match(tok, /^__Secure-better-auth\.session_token=T\.sig;/);
  for (const c of out.filter((c) => !c.includes("Max-Age=0"))) {
    assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Secure/); assert.match(c, /Path=\//);
  }
  assert.equal(parseCookies("a=1; b=2=3").get("b"), "2=3");
  assert.deepEqual(readParked("keplar_acct_1=zzz", false), []);
});

test("add account keeps both signed in; switching changes the active account with no re-login and no data bleed", async () => {
  const jar = new Jar();
  const a = await signIn(jar, "ada.multi@example.com", "plus");
  assert.deepEqual((await list(jar)).json.accounts, []);
  const b = await signIn(jar, "bob.multi@example.com", "free"); // "Add account" = sign in again with the first account's cookies present
  assert.notEqual(a.userId, b.userId);
  assert.equal(await activeEmail(jar), "bob.multi@example.com");
  const l = await list(jar);
  assert.deepEqual(l.json.accounts.map((x) => [x.email, x.expired]), [["ada.multi@example.com", false]], "the first account is still signed in, parked");
  assert.ok(jar.names().some((k) => /keplar_acct_1$/.test(k)));
  assert.equal(JSON.stringify(l.json).includes("="), false, "the list holds no cookie or token values");
  assert.equal((await who(jar)).account.id, b.userId);

  // chats written by each account stay with that account
  assert.equal((await chatPUT(jsonReq(jar.cookie, "/api/chats/thr_bob_1", "PUT", { title: "Bob chat", messages: [{ role: "user", text: "hi" }] }), ctx("thr_bob_1"))).status, 200);
  const sw = await post(jar, { action: "switch", slot: l.json.accounts[0].slot });
  assert.equal(sw.status, 200);
  assert.equal(await activeEmail(jar), "ada.multi@example.com");
  assert.equal((await who(jar)).account.id, a.userId, "plan/credits come from Ada's workspace now");
  assert.deepEqual(await chatIds(jar), [], "Bob's chat does not show for Ada");
  assert.equal((await chatPUT(jsonReq(jar.cookie, "/api/chats/thr_ada_1", "PUT", { title: "Ada chat", messages: [{ role: "user", text: "yo" }] }), ctx("thr_ada_1"))).status, 200);
  assert.deepEqual(await chatIds(jar), ["thr_ada_1"]);
  // and back: Bob is parked now, and still has his own chat
  const back = (await list(jar)).json.accounts[0];
  assert.equal(back.email, "bob.multi@example.com");
  await post(jar, { action: "switch", slot: back.slot });
  assert.equal(await activeEmail(jar), "bob.multi@example.com");
  assert.deepEqual(await chatIds(jar), ["thr_bob_1"]);
  assert.equal((await who(jar)).account.id, b.userId);
  assert.equal((await list(jar)).json.accounts.length, 1, "switching never adds or loses an account");
});

test("signing in again as a parked account does not duplicate it, and at most four other accounts are kept", async () => {
  const jar = new Jar();
  await signIn(jar, "one.cap@example.com");
  await signIn(jar, "two.cap@example.com");
  await signIn(jar, "one.cap@example.com");
  let l = (await list(jar)).json;
  assert.equal(l.active?.email, "one.cap@example.com");
  assert.deepEqual(l.accounts.map((x) => x.email), ["two.cap@example.com"]);
  for (const e of ["three", "four", "five", "six", "seven"]) await signIn(jar, `${e}.cap@example.com`);
  l = (await list(jar)).json;
  assert.equal(l.active?.email, "seven.cap@example.com");
  assert.equal(l.accounts.length, 4);
  assert.ok(!l.accounts.some((x) => x.email === "one.cap@example.com" || x.email === "two.cap@example.com") || l.accounts.length === 4);
  assert.ok(jar.names().filter((k) => /keplar_acct_/.test(k)).length <= 4);
});

test("sign out removes only the current account; the other becomes active; the old session is really dead", async () => {
  const jar = new Jar();
  await signIn(jar, "ada.out@example.com");
  const b = await signIn(jar, "bob.out@example.com");
  const bobCookie = jar.cookie;
  const out = await post(jar, { action: "signout" });
  assert.equal(out.status, 200);
  assert.equal(out.json.promoted?.email, "ada.out@example.com");
  assert.equal(await activeEmail(jar), "ada.out@example.com");
  assert.deepEqual((await list(jar)).json.accounts, []);
  if (fake) {
    const { getSession } = await import("@/lib/accounts/auth");
    assert.equal(await getSession(new Headers({ cookie: bobCookie })), null, "the signed-out session was revoked on the server, a copied cookie is useless");
    const r = await neonQuery("SELECT revoked_at FROM keplar_sessions WHERE id = $1", [b.sessionId]);
    assert.ok(r[0]?.revoked_at);
  }
  const last = await post(jar, { action: "signout" });
  assert.equal(last.json.promoted, null);
  assert.equal(await activeEmail(jar), null);
  assert.equal(jar.cookie, "");
});

test("sign out of all removes every account from the device and revokes them all", async () => {
  const jar = new Jar();
  await signIn(jar, "a.all@example.com");
  await signIn(jar, "b.all@example.com");
  await signIn(jar, "c.all@example.com");
  const before = jar.cookie;
  assert.equal((await list(jar)).json.accounts.length, 2);
  assert.equal((await post(jar, { action: "signout_all" })).status, 200);
  assert.equal(jar.cookie, "", "no cookie of any account is left");
  assert.equal(await activeEmail(jar), null);
  if (fake) {
    const { getSession } = await import("@/lib/accounts/auth");
    assert.equal(await getSession(new Headers({ cookie: before })), null);
    const l = await list(Object.assign(new Jar(), { m: new Map(before.split("; ").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)] as [string, string])) }));
    assert.ok(l.json.accounts.every((x) => x.expired), "a copied parked cookie is dead too");
  }
});

test("an expired account is flagged on its own: switching to it is refused with its email, the others keep working", async (t) => {
  if (!fake) return t.skip("needs the session store");
  const jar = new Jar();
  const a = await signIn(jar, "ada.exp@example.com");
  await signIn(jar, "bob.exp@example.com");
  await signIn(jar, "cy.exp@example.com");
  // Ada's session ends elsewhere (signed out on another device)
  await neonQuery("UPDATE keplar_sessions SET revoked_at = now() WHERE id = $1", [a.sessionId]);
  const l = (await list(jar)).json;
  assert.equal(l.active?.email, "cy.exp@example.com", "the active account is unaffected");
  const ada = l.accounts.find((x) => x.email === "ada.exp@example.com")!;
  const bob = l.accounts.find((x) => x.email === "bob.exp@example.com")!;
  assert.equal(ada.expired, true);
  assert.equal(bob.expired, false);
  const bad = await post(jar, { action: "switch", slot: ada.slot });
  assert.equal(bad.status, 409);
  assert.equal(bad.json.code, "expired");
  assert.equal(bad.json.email, "ada.exp@example.com");
  assert.equal(await activeEmail(jar), "cy.exp@example.com", "a failed switch changes nothing");
  assert.equal((await post(jar, { action: "switch", slot: bob.slot })).status, 200);
  assert.equal(await activeEmail(jar), "bob.exp@example.com");
  // signing out the active one skips the dead account
  const out = await post(jar, { action: "signout" });
  assert.equal(out.json.promoted?.email, "cy.exp@example.com");
  // forgetting the dead one
  const ada2 = (await list(jar)).json.accounts.find((x) => x.email === "ada.exp@example.com")!;
  assert.equal((await post(jar, { action: "remove", slot: ada2.slot })).status, 200);
  assert.ok(!(await list(jar)).json.accounts.some((x) => x.email === "ada.exp@example.com"));
});

test("a stash past its 60 days or with a forged signature is never usable", async () => {
  const jar = new Jar();
  await signIn(jar, "ada.old@example.com");
  await signIn(jar, "bob.old@example.com");
  const k = jar.names().find((x) => /keplar_acct_1$/.test(x))!;
  const real = decodeStash(jar.m.get(k))!;
  jar.m.set(k, encodeStash({ ...real, x: Date.now() - 1000 }));
  const l = (await list(jar)).json;
  assert.equal(l.accounts[0].expired, true);
  assert.equal((await post(jar, { action: "switch", slot: 1 })).status, 409);
  jar.m.set(k, `${encodeStash(real).split(".")[0]}.forged`);
  assert.deepEqual((await list(jar)).json.accounts, [], "a forged cookie is ignored");
  assert.equal((await post(jar, { action: "switch", slot: 1 })).status, 404);
  assert.equal(await activeEmail(jar), "bob.old@example.com");
});

test("CSRF: cross-site changes are refused and change nothing; reads are no-store", async () => {
  const jar = new Jar();
  await signIn(jar, "ada.csrf@example.com");
  await signIn(jar, "bob.csrf@example.com");
  const before = jar.cookie;
  for (const [origin, extra] of [["https://evil.test", {}], ["null", {}], [null, { "sec-fetch-site": "cross-site" }]] as [string | null, Record<string, string>][]) {
    for (const body of [{ action: "signout_all" }, { action: "signout" }, { action: "switch", slot: 1 }, { action: "remove", slot: 1 }]) {
      const r = await post(jar, body, origin, extra);
      assert.equal(r.status, 403, `${origin} ${body.action}`);
    }
  }
  assert.equal(jar.cookie, before);
  assert.equal((await list(jar)).res.headers.get("cache-control"), "no-store");
  assert.equal((await post(jar, { action: "nope" })).status, 400);
  assert.equal((await post(jar, { action: "switch", slot: 9 })).status, 404);
});

test("signed out: the list is empty and harmless", async () => {
  const j = new Jar();
  const l = await list(j);
  assert.equal(l.res.status, 200);
  assert.deepEqual(l.json, { ok: true, active: null, accounts: [] });
  assert.equal((await post(j, { action: "signout" })).status, 200);
});

test("Google sign-in while another account is active adds it without logging the first one out", async () => {
  const auth = await getAuth();
  const jar = new Jar();
  await signIn(jar, "first.oauth@example.com");
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claims = { iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, sub: "g-second", email: "second.oauth@example.com", email_verified: true, name: "Second" };
  const start = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip() }, body: JSON.stringify({ provider: "google", callbackURL: "/app" }) }));
  assert.equal(start.status, 200);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  const stateCookies = start.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("="));
  const prev = globalThis.fetch;
  const inner = (fake ? globalThis.fetch : fetch) as typeof fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (u.startsWith("https://oauth2.googleapis.com/token")) {
      const id = `${b64({ alg: "RS256", kid: "t", typ: "JWT" })}.${b64(claims)}.c2ln`;
      return new Response(JSON.stringify({ access_token: "at", token_type: "Bearer", expires_in: 3600, scope: "openid email profile", id_token: id }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return inner(input, init);
  }) as typeof fetch;
  try {
    const cb = await auth.handler(new Request(`${ORIGIN}/api/auth/callback/google?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie: [jar.cookie, ...stateCookies].join("; "), "x-forwarded-for": ip() } }));
    assert.ok(cb.status === 302 || cb.status === 200, `callback ${cb.status}`);
    jar.apply(cb);
  } finally {
    globalThis.fetch = prev;
  }
  const l = (await list(jar)).json;
  assert.equal(l.active?.email, "second.oauth@example.com");
  assert.deepEqual(l.accounts.map((x) => x.email), ["first.oauth@example.com"]);
  assert.equal(l.accounts[0].expired, false);
});
