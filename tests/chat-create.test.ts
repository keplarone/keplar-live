import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, reducer } from "@/components/app-ui/state/store";
import type { KeplarMessage, Thread } from "@/components/app-ui/state/types";

/** The chat Create card's state: patches merge into the card, other turns and unknown ids are left alone. */
const kmsg = (over: Partial<KeplarMessage>): KeplarMessage => ({ id: "k1", role: "keplar", replyTo: "u1", status: "done", startedAt: 1, finishedAt: 2, ...over } as KeplarMessage);

test("chat Create card: a patch moves the card through its phases and keeps what it already knew", () => {
  const thread: Thread = {
    id: "t1", title: "t", projectId: null, createdAt: 1, updatedAt: 1,
    messages: [
      { id: "u1", role: "user", text: "build a bike shop site", attachments: [], modes: { web: false, deepResearch: false, create: true, agent: false }, createdAt: 1 },
      kmsg({ create: { phase: "waiting" } }),
      kmsg({ id: "k2", answer: undefined }),
    ],
  };
  const s0 = { ...initialState(), threads: [thread], activeThreadId: "t1" };
  const s1 = reducer(s0, { type: "create", threadId: "t1", keplarId: "k1", patch: { phase: "working", appId: "sit_1", buildId: "bld_1" } });
  const s2 = reducer(s1, { type: "create", threadId: "t1", keplarId: "k1", patch: { phase: "ready", name: "BikeFix", previewUrl: "/apps/draft/x/" } });
  const m = s2.threads[0].messages[1] as KeplarMessage;
  assert.deepEqual(m.create, { phase: "ready", appId: "sit_1", buildId: "bld_1", name: "BikeFix", previewUrl: "/apps/draft/x/" });
  assert.equal(reducer(s0, { type: "create", threadId: "t1", keplarId: "k2", patch: { phase: "ready" } }).threads[0].messages[2], thread.messages[2], "a turn without a Create card is left alone");
  assert.equal(reducer(s0, { type: "create", threadId: "t1", keplarId: "nope", patch: { phase: "ready" } }).threads[0].messages[1], thread.messages[1]);
});
