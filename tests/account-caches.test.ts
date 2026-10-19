import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { errorResponse, HttpError } from "@/lib/create/platform/http";
import { GET as turnGET } from "@/app/api/keplar/turn/route";
import { clearAccountCaches, setActiveScope, STUDIO_ACCOUNT_PREFIX, type KV } from "@/components/app-ui/state/scope";
import { deviceKey, deleteRemote, fetchRemote, gameKeyOf, placeKey, pushRemote, readSaved, studioHeaders, toSaved, writeSaved } from "@/components/app-ui/studio-mode/saved-session";
import { deviceSessions } from "@/components/app-ui/studio-mode/workspace/panels/panel-logic";
import { draftKeyFor, readDraft, writeDraft } from "@/components/app-ui/drafts";
import { authHref, hereOf } from "@/components/app-ui/signin-href";

class Mem implements KV {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const withLocal = async <T,>(ls: Mem, fn: () => T | Promise<T>): Promise<T> => {
  const g = globalThis as unknown as { localStorage?: unknown };
  const prev = g.localStorage;
  g.localStorage = ls;
  try { return await fn(); } finally { g.localStorage = prev; }
};
const req = (claim: string | null) => new Request("https://keplar.one/api/x", { headers: claim ? { "x-keplar-account": claim } : {} });
const thrown = (fn: () => void): HttpError | null => { try { fn(); return null; } catch (e) { return e as HttpError; } };
const session = (name: string, at = 1000) => toSaved({ name, items: [{ kind: "keplar", key: "k1", text: `About ${name}` }], history: [], plan: [], current: 0, finished: false, built: [], stats: { steps: 0, changes: 0, errors: 0 }, units: 0 }, at);

/* ── account guard ── */

test("guard: an expired session is reported as expired (401 session_expired), a different account stays 409", async () => {
  assert.equal(thrown(() => assertSameAccount(req(null), null)), null, "no header: allowed");
  assert.equal(thrown(() => assertSameAccount(req("uid-A"), "uid-A")), null, "same account");
  assert.equal(thrown(() => assertSameAccount(req("anon"), null)), null, "anonymous screen, no session");

  const expired = thrown(() => assertSameAccount(req("uid-A"), null))!;
  assert.equal(expired.status, 401);
  assert.equal(expired.code, "session_expired");
  const res = errorResponse(expired);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Your session expired. Sign in again to continue.", code: "session_expired" });

  const other = thrown(() => assertSameAccount(req("uid-A"), "uid-B"))!;
  assert.equal(other.status, 409);
  assert.equal(other.code, "account_changed");
  assert.equal(thrown(() => assertSameAccount(req("anon"), "uid-B"))!.status, 409, "anonymous screen, someone signed in");
});

test("guard on a route that allows anonymous use: a signed-out request for an account's screen gets session_expired", async () => {
  const r = await turnGET(new Request("https://keplar.one/api/keplar/turn?key=t_abcdefgh12345678", { headers: { "x-keplar-account": "uid-gone", "x-forwarded-for": "10.77.0.1" } }));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, "session_expired");
});

/* ── sign-out clears everything that belongs to the account ── */

test("sign-out: account Studio chats, account drafts, the App build to resume and view handoffs go; device-local ones stay", () => {
  const ls = new Mem(), ss = new Mem();
  ls.setItem(`${STUDIO_ACCOUNT_PREFIX}uid-A|id:1`, "{}");
  ls.setItem("keplar-studio-chat:id:2", "{}");
  ls.setItem("keplar:app-build", JSON.stringify({ appId: "app_1", prompt: "secret plan", at: 1 }));
  writeDraft(draftKeyFor("user:uid-A", "t1", false)!, "account draft", ls);
  writeDraft(draftKeyFor("anon", "t2", false)!, "device draft", ls);
  for (const k of ["keplar:app-prompt", "keplar:app-open", "keplar:study-open", "keplar:slides-open", "keplar:create-remix"]) ss.setItem(k, "x");

  clearAccountCaches(ls, ss);

  assert.deepEqual([...ls.m.keys()].sort(), ["keplar-drafts-v1", "keplar-studio-chat:id:2"]);
  assert.equal(readDraft("user:uid-A|t1", ls), null);
  assert.equal(readDraft("anon|t2", ls), "device draft");
  assert.equal(ss.length, 0);

  const onlyAccount = new Mem();
  writeDraft("user:uid-A|t1", "x", onlyAccount);
  clearAccountCaches(onlyAccount, null);
  assert.equal(onlyAccount.length, 0, "nothing left: the drafts entry itself goes");
});

/* ── Studio chats are tied to the account on this device ── */

test("studio: device copies are stored per account, the old shared keys belong to the signed-out device only", async () => {
  const game = placeKey({ name: "Obby", placeId: "111" })!;
  assert.equal(deviceKey(game, "anon"), game);
  assert.equal(deviceKey(game, "user:uid-A"), `${STUDIO_ACCOUNT_PREFIX}uid-A|id:111`);
  assert.equal(deviceKey(game, "pending"), null, "unknown: nothing kept");
  assert.equal(gameKeyOf(`${STUDIO_ACCOUNT_PREFIX}uid-A|id:111`, "user:uid-A"), game);
  assert.equal(gameKeyOf(`${STUDIO_ACCOUNT_PREFIX}uid-A|id:111`, "user:uid-B"), null);
  assert.equal(gameKeyOf(game, "user:uid-A"), null, "an un-namespaced (old) key is never handed to an account");

  const ls = new Mem();
  await withLocal(ls, () => {
    ls.setItem(game, JSON.stringify(session("Old device chat")));
    assert.equal(readSaved(game, "user:uid-A"), null, "A does not see the old shared copy");
    assert.equal(readSaved(game, "anon")?.name, "Old device chat");
    assert.equal(writeSaved(game, session("A's chat", 2000), "user:uid-A"), true);
    assert.equal(writeSaved(game, session("x"), "pending"), false);
    assert.equal(readSaved(game, "user:uid-A")?.name, "A's chat");
    assert.equal(readSaved(game, "user:uid-B"), null, "B never reads A's chat");
    assert.equal(readSaved(game, "anon")?.name, "Old device chat");

    assert.deepEqual(deviceSessions(ls, "roblox", "user:uid-A").map((e) => [e.key, e.name]), [[game, "A's chat"]]);
    assert.deepEqual(deviceSessions(ls, "roblox", "user:uid-B"), []);
    assert.deepEqual(deviceSessions(ls, "roblox", "anon").map((e) => e.name), ["Old device chat"]);
    assert.deepEqual(deviceSessions(ls, "roblox", "pending"), []);

    clearAccountCaches(ls, null);
    assert.equal(readSaved(game, "user:uid-A"), null, "sign-out removes the account's copy");
    assert.equal(readSaved(game, "anon")?.name, "Old device chat");
  });
});

test("studio: account sync says which account the screen is for, and is not sent when signed out or unknown", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const g = globalThis as unknown as { fetch: typeof fetch };
  const prev = g.fetch;
  g.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify({ chat: null }), { status: 200 });
  }) as typeof fetch;
  try {
    const game = "keplar-studio-chat:id:5";
    await fetchRemote(game, "user:uid-A");
    await pushRemote(game, session("x"), "user:uid-A");
    await deleteRemote(game, "user:uid-A");
    assert.equal(calls.length, 3);
    for (const c of calls) assert.equal(c.headers["x-keplar-account"], "uid-A", c.url);
    calls.length = 0;
    await fetchRemote(game, "anon");
    await pushRemote(game, session("x"), "pending");
    await deleteRemote(game, "anon");
    assert.equal(calls.length, 0);
    assert.deepEqual(studioHeaders("pending"), {});
    setActiveScope("user:uid-C");
    assert.deepEqual(studioHeaders(), { "x-keplar-account": "uid-C" }, "inside the app, the app's scope is used");
  } finally {
    g.fetch = prev;
    setActiveScope("pending");
  }
});

/* ── sign-in links return to where the person was ── */

test("sign-in links keep the current location", () => {
  assert.equal(authHref("signin", "/app/create?tab=apps&id=1"), "/signin?next=%2Fapp%2Fcreate%3Ftab%3Dapps%26id%3D1");
  assert.equal(authHref("signup", "/app/c/thr_1"), "/signup?next=%2Fapp%2Fc%2Fthr_1");
  assert.equal(authHref("signin"), "/signin?next=%2Fapp");
  assert.equal(hereOf({ pathname: "/app/study", search: "?set=9" }), "/app/study?set=9");
  assert.equal(hereOf(null), "/app");
});
