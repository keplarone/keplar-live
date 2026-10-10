import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialState, reducer } from "@/components/app-ui/state/store";
import type { Thread } from "@/components/app-ui/state/types";

/** A first question sent before /api/compute answers (scope still "pending") survives the first identity answer. */
const thread = (id: string, text: string, msgs = true): Thread => ({ id, title: text, projectId: null, createdAt: 1, updatedAt: 2, messages: msgs ? [{ id: `u_${id}`, role: "user", text, attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false }, createdAt: 1 }] : [] } as Thread);

test("pending -> anon/user merges the in-flight first turn in front of the stored chats and keeps it open", () => {
  const s0 = { ...initialState(), threads: [thread("thr_new", "pg or mysql?")], activeThreadId: "thr_new" };
  const stored = { threads: [thread("thr_old", "older chat")], projects: [{ id: "prj_1", name: "P", createdAt: 1 }], activeThreadId: "thr_old", settings: s0.settings };
  for (const scope of ["anon", "user:uid-A"] as const) {
    const s1 = reducer(s0, { type: "scope", scope, account: scope === "anon" ? null : { id: "uid-A", email: null, name: null }, loaded: stored });
    assert.equal(s1.scope, scope);
    assert.deepEqual(s1.threads.map((t) => t.id), ["thr_new", "thr_old"]);
    assert.equal(s1.activeThreadId, "thr_new", "the first turn stays on screen");
    assert.equal(s1.epoch, s0.epoch, "no account-bound reset");
    assert.equal(s1.view, s0.view);
    assert.deepEqual(s1.projects.map((p) => p.id), ["prj_1"]);
  }
});

test("pending with nothing sent still opens the stored chat; an empty draft thread is not kept", () => {
  const s0 = { ...initialState(), threads: [thread("thr_blank", "", false)], activeThreadId: "thr_blank" };
  const s1 = reducer(s0, { type: "scope", scope: "anon", account: null, loaded: { threads: [thread("thr_old", "older")], projects: [], activeThreadId: "thr_old", settings: s0.settings } });
  assert.deepEqual(s1.threads.map((t) => t.id), ["thr_old"]);
  assert.equal(s1.activeThreadId, "thr_old");
});

test("a real account switch still replaces everything", () => {
  const a = { ...initialState(), scope: "user:uid-A" as const, threads: [thread("thr_a", "A")], activeThreadId: "thr_a" };
  const b = reducer(a, { type: "scope", scope: "user:uid-B", account: { id: "uid-B", email: null, name: null }, loaded: { threads: [], projects: [], activeThreadId: null, settings: a.settings } });
  assert.deepEqual(b.threads, []);
  assert.equal(b.epoch, a.epoch + 1);
});

test("the app does not abort a run when the scope leaves pending, and exposes data-app-ready", () => {
  const src = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(src, /if \(prev !== "pending"\) \{\s*controllers\.current\.forEach\(\(c\) => c\.abort\(\)\)/);
  assert.match(src, /data-app-ready=\{state\.scope === "pending" \? undefined : ""\}/);
  assert.match(readFileSync("src/components/app-ui/HomeStart.tsx", "utf8"), /data-faq=\{faqState\}/);
});
