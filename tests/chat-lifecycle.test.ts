import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent, initialState, reducer, settle } from "@/components/app-ui/state/store";
import type { AppState, KeplarMessage, Thread, UserMessage } from "@/components/app-ui/state/types";

const user = (id: string, text = "Q"): UserMessage => ({ id, role: "user", text, attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false }, createdAt: 1 });
const keplar = (id: string, replyTo: string, over: Partial<KeplarMessage> = {}): KeplarMessage => ({ id, role: "keplar", replyTo, status: "running", stages: [], capabilities: [], models: [], draft: "", startedAt: Date.now(), ...over });
const withThread = (t: Thread): AppState => ({ ...initialState(), scope: "anon", threads: [t], activeThreadId: t.id });
const thread = (messages: Thread["messages"], over: Partial<Thread> = {}): Thread => ({ id: "t1", title: "T", projectId: null, createdAt: 1, updatedAt: 1, messages, ...over });
const kOf = (s: AppState, id: string) => s.threads[0].messages.find((m) => m.id === id) as KeplarMessage;

test("an error keeps what had already arrived (shown as unfinished, never as an answer)", () => {
  const m = applyEvent(keplar("k", "u", { draft: "First half of" }), { type: "error", code: "internal", message: "Something went wrong.", retryable: true });
  assert.equal(m.status, "error");
  assert.equal(m.draft, "First half of");
  assert.equal(m.answer, undefined);
});

test("plan_required (Deep Research on Free / Lite) offers plans instead of a dead-end error", () => {
  const m = applyEvent(keplar("k", "u"), { type: "error", code: "plan_required", message: "Deep Research is available on Plus and up.", retryable: false });
  assert.equal(m.error?.upgrade, true);
  assert.equal(m.error?.retryable, false);
});

test("the turn key is kept on the answer (and survives settle after a reload) for a retry that replays instead of re-running", () => {
  let s = withThread(thread([user("u"), keplar("k", "u")]));
  s = reducer(s, { type: "turn-key", threadId: "t1", keplarId: "k", key: "abcdefabcdefabcdef" });
  assert.equal(kOf(s, "k").turnKey, "abcdefabcdefabcdef");
  const after = settle(s.threads[0]).messages[1] as KeplarMessage;
  assert.equal(after.status, "error");
  assert.equal(after.error?.kind, "network");
  assert.equal(after.turnKey, "abcdefabcdefabcdef");
});

test("loading a saved chat merges: a turn started on this screen meanwhile is kept after the saved messages", () => {
  const s0 = withThread(thread([user("u2", "new"), keplar("k2", "u2")], { remote: true }));
  const s = reducer(s0, { type: "hydrate", scope: "anon", id: "t1", messages: [user("u1", "old"), keplar("k1", "u1", { status: "done", draft: "" })] });
  assert.deepEqual(s.threads[0].messages.map((m) => m.id), ["u1", "k1", "u2", "k2"]);
  assert.equal(s.threads[0].remote, false);
});

test("undo of a delete brings a chat back with its interrupted answer stopped, not spinning forever", () => {
  const t = thread([user("u"), keplar("k", "u")]);
  let s = reducer(withThread(t), { type: "delete-thread", id: "t1" });
  assert.equal(s.threads.length, 0);
  s = reducer(s, { type: "restore-thread", thread: t, open: true });
  assert.equal(kOf(s, "k").status, "stopped");
  assert.equal(s.activeThreadId, "t1");
});
