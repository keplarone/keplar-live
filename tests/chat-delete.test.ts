import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, call, jsonReq } from "./helpers/session";
import { DELETE as chatDELETE, GET as chatGET, PUT as chatPUT } from "@/app/api/chats/[id]/route";
import { DELETE as allDELETE, GET as listGET } from "@/app/api/chats/route";
import { recordOutcome, recordSignal } from "@/lib/learning/record";
import { armRows, outcomes, signalRows, turnKey } from "@/lib/learning/repo";
import { chats } from "@/lib/memory/repo";
import { digests, recordTurn } from "@/lib/memory/digest";
import { addItems, listItems } from "@/lib/memory/repo";
import { collection } from "@/lib/create/platform/store";
import { answerIds } from "@/lib/memory/delete-chat";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const msgs = (answerId: string) => [
  { id: "u1", role: "user", text: "hello there friend", attachments: [{ name: "a.pdf", size: 3, type: "application/pdf" }], modes: {}, createdAt: 1 },
  { id: "k1", role: "keplar", replyTo: "u1", status: "done", answer: { id: answerId, markdown: "Hi" }, stages: [], createdAt: 2 },
];
const put = (cookie: string, id: string, answerId: string) => chatPUT(jsonReq(cookie, `/api/chats/${id}`, "PUT", { title: "T", messages: msgs(answerId) }), ctx(id));
async function turn(workspaceId: string, answerId: string, category: string) {
  await recordOutcome({ key: turnKey(workspaceId, answerId), tier: "paid", category, mode: "single", seats: [{ id: "cm-1", ok: true }], latencyMs: 1, units: 1, status: "ok", policyVersion: 0 });
}

test("answer ids are read from the stored messages", () => {
  assert.deepEqual(answerIds(msgs("a1")), ["a1"]);
  assert.deepEqual(answerIds([null, 3, { answer: {} }]), []);
});

test("delete: owner only, 404 for a missing or someone else's chat, 400 for a bad id, 401 signed out", async () => {
  const a = await signIn("del-a@example.com", "plus");
  const b = await signIn("del-b@example.com", "plus");
  await put(a.cookie, "chat-own-1", "ans-own-1");
  assert.equal((await chatDELETE(jsonReq(null, "/api/chats/chat-own-1", "DELETE"), ctx("chat-own-1"))).status, 401);
  assert.equal((await chatDELETE(jsonReq(b.cookie, "/api/chats/chat-own-1", "DELETE"), ctx("chat-own-1"))).status, 404);
  assert.ok(await chats().get(a.workspaceId, "chat-own-1"), "someone else's delete did not touch it");
  assert.equal((await chatDELETE(jsonReq(a.cookie, "/api/chats/!!", "DELETE"), ctx("!!"))).status, 400);
  assert.equal((await chatDELETE(jsonReq(a.cookie, "/api/chats/never-existed", "DELETE"), ctx("never-existed"))).status, 404);
  assert.equal((await chatDELETE(jsonReq(a.cookie, "/api/chats/chat-own-1", "DELETE"), ctx("chat-own-1"))).status, 200);
  assert.equal((await chatGET(call(a.cookie, "/api/chats/chat-own-1"), ctx("chat-own-1"))).status, 404);
  assert.equal((await chatDELETE(jsonReq(a.cookie, "/api/chats/chat-own-1", "DELETE"), ctx("chat-own-1"))).status, 404, "a second delete finds nothing");
});

test("a stale tab from another account is refused (409) and nothing is deleted", async () => {
  const a = await signIn("del-c@example.com", "plus");
  await put(a.cookie, "chat-x-1", "ans-x-1");
  const stale = new Request("https://keplar.one/api/chats/chat-x-1", { method: "DELETE", headers: { cookie: a.cookie, origin: "https://keplar.one", "x-keplar-account": "some-other-user" } });
  assert.equal((await chatDELETE(stale, ctx("chat-x-1"))).status, 409);
  assert.ok(await chats().get(a.workspaceId, "chat-x-1"));
});

test("cascade: messages, summary and the learning records of that chat's answers go; everything else stays", async () => {
  const a = await signIn("del-d@example.com", "plus");
  const b = await signIn("del-e@example.com", "plus");
  await put(a.cookie, "chat-keep", "ans-keep");
  await put(a.cookie, "chat-gone", "ans-gone");
  await put(b.cookie, "chat-b", "ans-b");
  await recordTurn({ chatId: "chat-gone", workspaceId: a.workspaceId, prompt: "a private question about taxes", answer: "an answer", restricted: false });
  await recordTurn({ chatId: "chat-keep", workspaceId: a.workspaceId, prompt: "another question", answer: "another answer", restricted: false });
  await turn(a.workspaceId, "ans-gone", "writing:simple");
  await turn(a.workspaceId, "ans-keep", "writing:simple");
  await turn(b.workspaceId, "ans-b", "writing:simple");
  await recordSignal({ workspaceId: a.workspaceId, answerId: "ans-gone", kind: "up" });
  await recordSignal({ workspaceId: a.workspaceId, answerId: "ans-gone", kind: "copy" });
  await addItems(a.workspaceId, [{ text: "The user likes short answers.", kind: "style" }], "auto");
  const faq = collection<{ id: string; workspaceId: string; n: number }>("faq_counts");
  await faq.insert({ id: "q1", workspaceId: "system", n: 5 });
  const arms = JSON.stringify(await armRows().list("system"));

  const kGone = turnKey(a.workspaceId, "ans-gone");
  assert.ok(await outcomes().get("system", kGone));
  assert.ok(await signalRows().get("system", `${kGone}:vote`));
  assert.equal((await chatDELETE(jsonReq(a.cookie, "/api/chats/chat-gone", "DELETE"), ctx("chat-gone"))).status, 200);

  assert.equal(await chats().get(a.workspaceId, "chat-gone"), null);
  assert.equal(await digests().get(a.workspaceId, "chat-gone"), null, "summary gone");
  assert.equal(await outcomes().get("system", kGone), null, "outcome row gone");
  assert.equal(await signalRows().get("system", `${kGone}:vote`), null);
  assert.equal(await signalRows().get("system", `${kGone}:copy`), null);
  // untouched: the other chat, its summary and learning rows, the other account's, memory notes, aggregates, counts
  assert.ok(await chats().get(a.workspaceId, "chat-keep"));
  assert.ok(await digests().get(a.workspaceId, "chat-keep"));
  assert.ok(await outcomes().get("system", turnKey(a.workspaceId, "ans-keep")));
  assert.ok(await chats().get(b.workspaceId, "chat-b"));
  assert.ok(await outcomes().get("system", turnKey(b.workspaceId, "ans-b")));
  assert.equal((await listItems(a.workspaceId)).length, 1);
  assert.equal(JSON.stringify(await armRows().list("system")), arms, "running tallies are aggregates and stay");
  assert.equal((await faq.get("system", "q1"))?.n, 5);
});

test("delete all: needs the typed word, deletes only this person's chats", async () => {
  const a = await signIn("del-f@example.com", "plus");
  const b = await signIn("del-g@example.com", "plus");
  await put(a.cookie, "all-1", "ans-all-1");
  await put(a.cookie, "all-2", "ans-all-2");
  await put(b.cookie, "all-b", "ans-all-b");
  await turn(a.workspaceId, "ans-all-1", "factual:simple");
  assert.equal((await allDELETE(jsonReq(null, "/api/chats", "DELETE", { confirm: "DELETE" }))).status, 401);
  for (const c of [undefined, true, "delete", "yes"]) assert.equal((await allDELETE(jsonReq(a.cookie, "/api/chats", "DELETE", { confirm: c }))).status, 400, String(c));
  assert.equal((await chats().list(a.workspaceId)).length, 2);
  const r = await allDELETE(jsonReq(a.cookie, "/api/chats", "DELETE", { confirm: "DELETE" }));
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { deleted: number }).deleted, 2);
  assert.equal((await (await listGET(call(a.cookie, "/api/chats"))).json() as { chats: unknown[] }).chats.length, 0);
  assert.equal(await outcomes().get("system", turnKey(a.workspaceId, "ans-all-1")), null);
  assert.equal((await chats().list(b.workspaceId)).length, 1, "the other account keeps its chat");
});
