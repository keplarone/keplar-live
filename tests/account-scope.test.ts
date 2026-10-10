import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, call, jsonReq } from "./helpers/session";
import { GET as chatsGET } from "@/app/api/chats/route";
import { GET as chatGET, PUT as chatPUT, PATCH as chatPATCH, DELETE as chatDELETE } from "@/app/api/chats/[id]/route";
import { GET as memGET } from "@/app/api/memory/route";
import { DELETE as itemDELETE } from "@/app/api/memory/items/[id]/route";
import { POST as erasePOST } from "@/app/api/memory/erase/route";
import { GET as computeGET } from "@/app/api/compute/route";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { addItems, chats, listItems } from "@/lib/memory/repo";
import { listMeta, recentDigests, recordTurn, searchDigests, digests } from "@/lib/memory/digest";
import { recallReply } from "@/lib/memory/recall";
import { ACCOUNT_PREFIX, ANON_KEY, LEGACY_KEY, accountHeader, clearAccountCaches, declineImport, importCandidates, importDeclined, importProjects, removeImported, scopeOf, storageKey, type KV } from "@/components/app-ui/state/scope";
import { initialState, loadScope, persist, reducer } from "@/components/app-ui/state/store";
import type { Thread } from "@/components/app-ui/state/types";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const msgs = (text: string) => [{ id: "u1", role: "user", text }, { id: "k1", role: "keplar", status: "done" }];

/* ───────────── server: everything is scoped by the signed-in user's workspace ───────────── */

test("chats: another account cannot list, read, rename, overwrite or delete mine; anonymous gets 401", async () => {
  const a = await signIn("scope-a@example.com");
  const b = await signIn("scope-b@example.com");
  assert.notEqual(a.workspaceId, b.workspaceId);
  const id = "thr_scope_a1";
  assert.equal((await chatPUT(jsonReq(a.cookie, `/api/chats/${id}`, "PUT", { title: "A private plan", messages: msgs("A secret") }), ctx(id))).status, 200);

  assert.equal((await chatsGET(call(null, "/api/chats"))).status, 401, "signed out: no list");
  assert.equal((await chatGET(call(null, `/api/chats/${id}`), ctx(id))).status, 401);
  assert.deepEqual((await (await chatsGET(call(b.cookie, "/api/chats"))).json()).chats, [], "B's list has none of A's chats");
  assert.equal((await chatGET(call(b.cookie, `/api/chats/${id}`), ctx(id))).status, 404);
  assert.equal((await chatPATCH(jsonReq(b.cookie, `/api/chats/${id}`, "PATCH", { title: "Hijacked" }), ctx(id))).status, 404);
  await chatDELETE(jsonReq(b.cookie, `/api/chats/${id}`, "DELETE"), ctx(id));
  assert.equal((await (await chatGET(call(a.cookie, `/api/chats/${id}`), ctx(id))).json()).chat.title, "A private plan", "A's chat untouched by B's patch/delete");

  // B saving the same id makes B's own row; A's stays as it was
  assert.equal((await chatPUT(jsonReq(b.cookie, `/api/chats/${id}`, "PUT", { title: "B's chat", messages: msgs("B text") }), ctx(id))).status, 200);
  const mine = await (await chatGET(call(a.cookie, `/api/chats/${id}`), ctx(id))).json();
  assert.equal(mine.chat.title, "A private plan");
  assert.equal(JSON.stringify(mine).includes("B text"), false);
  assert.equal((await chats().list(a.workspaceId)).length, 1);
  assert.equal((await chats().list(b.workspaceId)).length, 1);
});

test("summaries (digests), search and recall are per account; deleting a chat only removes your own summary", async () => {
  const a = await signIn("scope-digest-a@example.com");
  const b = await signIn("scope-digest-b@example.com");
  await recordTurn({ chatId: "thr_dg_a", workspaceId: a.workspaceId, title: "Quantum bakery", prompt: "How do I proof sourdough overnight?", answer: "Cold-proof it in the fridge for twelve hours.", at: 5000 });
  await recordTurn({ chatId: "thr_dg_b", workspaceId: b.workspaceId, title: "Marathon", prompt: "Plan my marathon training", answer: "Run four times a week.", at: 6000 });

  assert.deepEqual((await listMeta(b.workspaceId)).map((d) => d.id), ["thr_dg_b"]);
  assert.deepEqual((await recentDigests(b.workspaceId)).map((d) => d.id), ["thr_dg_b"]);
  assert.deepEqual(await searchDigests(b.workspaceId, "sourdough proof overnight"), [], "B's search never returns A's chats");
  assert.deepEqual((await searchDigests(a.workspaceId, "sourdough proof overnight")).map((h) => h.id), ["thr_dg_a"]);
  const reply = recallReply("last", await listMeta(b.workspaceId), { currentId: "x" });
  assert.equal(/sourdough|bakery/i.test(reply), false, "recall for B never mentions A's chat");
  // B deleting an id that A also uses leaves A's digest in place
  await chatDELETE(jsonReq(b.cookie, "/api/chats/thr_dg_a", "DELETE"), ctx("thr_dg_a"));
  assert.ok(await digests().get(a.workspaceId, "thr_dg_a"));
});

test("memory: B cannot read, delete or erase A's items", async () => {
  const a = await signIn("scope-mem-a@example.com");
  const b = await signIn("scope-mem-b@example.com");
  const [item] = await addItems(a.workspaceId, [{ text: "The user is called Ada.", kind: "name" }], "auto");
  assert.equal((await memGET(call(null, "/api/memory"))).status, 401);
  assert.deepEqual((await (await memGET(call(b.cookie, "/api/memory"))).json()).items, []);
  assert.equal((await itemDELETE(jsonReq(b.cookie, `/api/memory/items/${item.id}`, "DELETE"), ctx(item.id))).status, 404);
  await erasePOST(jsonReq(b.cookie, "/api/memory/erase", "POST", { confirm: true, chats: true }));
  assert.equal((await listItems(a.workspaceId)).length, 1, "B's erase never touches A");
});

test("stale-tab guard: a request that claims another account than the session is refused (409) and writes nothing", async () => {
  const a = await signIn("scope-guard-a@example.com");
  const b = await signIn("scope-guard-b@example.com");
  const acct = async (cookie: string) => (await (await computeGET(call(cookie, "/api/compute"))).json()).account.id as string;
  const idA = await acct(a.cookie);
  const idB = await acct(b.cookie);
  assert.notEqual(idA, idB);
  const put = (cookie: string, claim: string | null, id: string) =>
    chatPUT(new Request(`https://keplar.one/api/chats/${id}`, { method: "PUT", headers: { cookie, origin: "https://keplar.one", "content-type": "application/json", ...(claim ? { "x-keplar-account": claim } : {}) }, body: JSON.stringify({ title: "Chat", messages: msgs("hi") }) }), ctx(id));
  assert.equal((await put(b.cookie, idA, "thr_guard_1")).status, 409, "screen shows A, session is B");
  assert.equal((await put(b.cookie, "anon", "thr_guard_2")).status, 409, "screen is anonymous, session is B");
  assert.equal((await chats().list(b.workspaceId)).length, 0, "nothing written to B");
  assert.equal((await put(b.cookie, idB, "thr_guard_3")).status, 200);
  assert.equal((await put(b.cookie, null, "thr_guard_4")).status, 200, "no header (older client / API): allowed");
  const list = await chatsGET(new Request("https://keplar.one/api/chats", { headers: { cookie: b.cookie, "x-keplar-account": idA } }));
  assert.equal(list.status, 409);
  const ask = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", cookie: b.cookie, "x-keplar-account": idA, "x-forwarded-for": "10.99.1.1" }, body: JSON.stringify({ prompt: "hello", chatId: "thr_guard_9" }) }));
  assert.equal(ask.status, 409, "answers (and their memory/summaries) are never recorded under another account");
  assert.equal((await digests().list(b.workspaceId)).length, 0);
});

test("/api/compute names the signed-in account (and nobody when signed out)", async () => {
  const a = await signIn("Scope-Compute@Example.com");
  const out = await (await computeGET(call(null, "/api/compute"))).json();
  assert.equal(out.signedIn, false);
  assert.equal(out.account, null);
  const inn = await (await computeGET(call(a.cookie, "/api/compute"))).json();
  assert.equal(inn.signedIn, true);
  assert.equal(inn.account.email, "scope-compute@example.com");
  assert.ok(inn.account.id);
  // the same email again (magic link, or Google/Microsoft which derive the same id) is the same account
  const again = await signIn("scope-compute@example.com");
  assert.equal((await (await computeGET(call(again.cookie, "/api/compute"))).json()).account.id, inn.account.id);
});

/* ───────────── client: scope-keyed caches, sign-out wipe, consented import ───────────── */

class Mem implements KV {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const thread = (id: string, text: string, extra: Partial<Thread> = {}): Thread => ({ id, title: text, projectId: null, createdAt: 1, updatedAt: 2, messages: [{ id: `u_${id}`, role: "user", text, attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false }, createdAt: 1 }], ...extra });
const withWindow = <T,>(ls: Mem, ss: Mem, fn: () => T): T => {
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = { localStorage: ls, sessionStorage: ss };
  try { return fn(); } finally { g.window = prev; }
};

test("client: each scope reads and writes only its own key; signed-in chat text is never cached locally", () => {
  const ls = new Mem(), ss = new Mem();
  withWindow(ls, ss, () => {
    assert.equal(initialState().scope, "pending");
    assert.deepEqual(initialState().threads, [], "nothing from storage is shown before the account is known");
    persist(initialState());
    assert.equal(ls.length, 0, "pending persists nothing");

    const anon = { ...initialState(), scope: scopeOf(null), threads: [thread("thr_anon1", "device question")] };
    persist(anon);
    assert.equal(loadScope("anon").threads.length, 1);
    const userA = { ...initialState(), scope: scopeOf("uid-A"), threads: [thread("thr_a1", "account A secret")] };
    persist(userA);
    assert.equal(JSON.stringify([...ls.m.values()]).includes("account A secret"), false, "account chats are not cached in the browser");
    assert.equal(loadScope("user:uid-B").threads.length, 0);
    assert.equal(loadScope("user:uid-A").threads.length, 0);
    assert.equal(loadScope("anon").threads.map((t) => t.id).join(), "thr_anon1");
    assert.equal(storageKey("anon"), ANON_KEY);
    assert.equal(storageKey("user:x"), `${ACCOUNT_PREFIX}x`);
    assert.equal(storageKey("pending"), null);
    // the legacy store (may hold a previous account's cache) is never shown as the anonymous list
    ls.setItem(LEGACY_KEY, JSON.stringify({ threads: [thread("thr_legacy", "old account chat")] }));
    assert.equal(loadScope("anon").threads.some((t) => t.id === "thr_legacy"), false);
    assert.equal(accountHeader("pending"), null);
    assert.equal(accountHeader("anon"), "anon");
    assert.equal(accountHeader("user:uid-B"), "uid-B");
  });
});

test("client: switching account replaces the whole list; late answers for the old account are dropped", () => {
  const a = { ...initialState(), scope: scopeOf("uid-A"), threads: [thread("thr_a1", "A chat")], activeThreadId: "thr_a1", projectFilter: "prj_a" };
  const b = reducer(a, { type: "scope", scope: scopeOf("uid-B"), account: { id: "uid-B", email: "b@example.com", name: null }, loaded: { threads: [], projects: [], activeThreadId: null, settings: a.settings } });
  assert.equal(b.scope, "user:uid-B");
  assert.deepEqual(b.threads, []);
  assert.equal(b.activeThreadId, null);
  assert.equal(b.projectFilter, null);
  assert.equal(b.view, "thread");
  assert.equal(b.account?.email, "b@example.com");
  assert.equal(b.epoch, a.epoch + 1, "account-bound UI (composer, open panels) is reset");
  const late = reducer(b, { type: "merge-remote", scope: "user:uid-A", chats: [{ id: "thr_a1", title: "A chat", projectId: null, createdAt: 1, updatedAt: 2 }] });
  assert.deepEqual(late.threads, [], "A's list arriving after the switch never appears under B");
  assert.deepEqual(reducer(b, { type: "hydrate", scope: "user:uid-A", id: "x", messages: [] }), b);
  const ok = reducer(b, { type: "merge-remote", scope: "user:uid-B", chats: [{ id: "thr_b1", title: "B chat", projectId: null, createdAt: 1, updatedAt: 3 }] });
  assert.deepEqual(ok.threads.map((t) => t.id), ["thr_b1"]);
  const out = reducer(ok, { type: "scope", scope: "anon", account: null, loaded: { threads: [], projects: [], activeThreadId: null, settings: a.settings } });
  assert.deepEqual(out.threads, [], "signing out leaves no account chats on screen");
  // pending -> resolved keeps the view (e.g. /app/slides)
  assert.equal(reducer({ ...initialState(), view: "slides" }, { type: "scope", scope: "anon", account: null, loaded: loadScopeEmpty() }).view, "slides");
});
const loadScopeEmpty = () => ({ threads: [], projects: [], activeThreadId: null, settings: initialState().settings });

test("client: sign-out wipes account caches (and session handoffs), keeps device-local chats", () => {
  const ls = new Mem(), ss = new Mem();
  ls.setItem(`${ACCOUNT_PREFIX}uid-A`, "{}");
  ls.setItem(`${ACCOUNT_PREFIX}uid-B`, "{}");
  ls.setItem("keplar.upsell.v1", "{}");
  ls.setItem(ANON_KEY, JSON.stringify({ threads: [thread("thr_anon", "kept")] }));
  ls.setItem("keplar-theme", "dark");
  ss.setItem("keplar.mcp.oauth", "{}");
  clearAccountCaches(ls, ss);
  assert.deepEqual([...ls.m.keys()].sort(), [ANON_KEY, "keplar-theme"].sort());
  assert.equal(ss.length, 0);
});

test("client: anonymous chats move to an account only on an explicit import, once; a decline is remembered", () => {
  const ls = new Mem();
  ls.setItem(ANON_KEY, JSON.stringify({ threads: [thread("thr_d1", "one", { projectId: "prj_1" }), thread("thr_d2", "two"), { ...thread("thr_empty", "x"), messages: [] }], projects: [{ id: "prj_1", name: "Bakery", createdAt: 1 }] }));
  ls.setItem(LEGACY_KEY, JSON.stringify({ threads: [thread("thr_d2", "two"), thread("thr_old", "legacy")] }));
  const found = importCandidates(ls);
  assert.deepEqual(found.map((t) => t.id).sort(), ["thr_d1", "thr_d2", "thr_old"], "empty chats are not offered; duplicates collapse");
  assert.deepEqual(importProjects(found, ls).map((p) => p.id), ["prj_1"]);
  // nothing is removed or sent by looking
  assert.equal(importCandidates(ls).length, 3);
  assert.equal(importDeclined("uid-A", ls), false);
  declineImport("uid-A", ls);
  assert.equal(importDeclined("uid-A", ls), true);
  assert.equal(importDeclined("uid-B", ls), false, "a decline is per account");
  assert.equal(importCandidates(ls).length, 3, "declining keeps the chats on the device");
  removeImported(["thr_d1", "thr_d2", "thr_old"], ls);
  assert.deepEqual(importCandidates(ls), [], "after an import no later account can claim them");
  assert.equal(ls.getItem(LEGACY_KEY), null);
});
