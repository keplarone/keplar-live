import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialState, messagesForSave, reducer } from "@/components/app-ui/state/store";
import { docsFor, docsForTurn, keepTranscript } from "@/components/app-ui/doc-client";
import { modelChain, MODELS } from "@/lib/site-builder/limits";
import type { KeplarMessage, UserMessage } from "@/components/app-ui/state/types";

const modes = { web: false, deepResearch: false, create: false, agent: false };

function user(id: string, text: string): UserMessage {
  return { id, role: "user", text, attachments: [], modes, createdAt: 1 };
}

test("a saved chat does not drop a message sent while it was loading", () => {
  const base = initialState();
  let st = reducer(base, { type: "scope", scope: "user:u1", account: { id: "u1", email: null, name: null }, loaded: { threads: [], projects: [], activeThreadId: null, settings: base.settings } });
  st = reducer(st, { type: "merge-remote", scope: st.scope, chats: [{ id: "c1", title: "T", projectId: null, createdAt: 1, updatedAt: 2 }] });
  const local = user("u_local", "while loading");
  const keplar: KeplarMessage = { id: "k_local", role: "keplar", replyTo: local.id, status: "running", stages: [], capabilities: [], models: [], draft: "", startedAt: 4 };
  st = reducer(st, { type: "send", threadId: "c1", user: local, keplar });
  st = reducer(st, { type: "hydrate", scope: st.scope, id: "c1", messages: [user("u_old", "saved")] });
  const ids = st.threads.find((t) => t.id === "c1")!.messages.map((m) => m.id);
  assert.deepEqual(ids, ["u_old", "u_local", "k_local"]);
});

test("chat save drops image and video bytes before the request", () => {
  const saved = messagesForSave([{
    ...user("u", "see this"),
    media: [{ id: "m", kind: "image", name: "a.png", bytes: 9, images: [{ dataUrl: "data:image/png;base64,AAAA", width: 1, height: 1, name: "a.png" }], thumb: "data:image/jpeg;base64,BBBB" }],
  }]);
  const media = saved[0].role === "user" ? saved[0].media?.[0] : undefined;
  assert.equal(media?.name, "a.png");
  assert.equal(media && "images" in media ? media.images : undefined, undefined);
  assert.equal(JSON.stringify(saved).includes("base64"), false);
});

test("two files with the same name and size keep their own extracted text, and a follow-up still sees the first", () => {
  const first = keepTranscript("notes.pdf", "aaaa");
  const second = keepTranscript("notes.pdf", "bbbb");
  assert.equal(docsFor([first])?.[0]?.text, "aaaa");
  assert.equal(docsFor([second])?.[0]?.text, "bbbb");
  const turn = docsForTurn([first], [second]);
  assert.deepEqual(turn?.map((d) => d.text), ["bbbb", "aaaa"]);
});

test("Lite site builds use the Flash chain, not the Pro model", () => {
  assert.equal(modelChain("lite", "normal")[0]?.id, MODELS.plus.id);
  assert.equal(modelChain("lite", "normal").some((m) => m.id === MODELS.pro.id), false);
  assert.equal(modelChain("pro", "normal")[0]?.id, MODELS.pro.id);
});

test("Business app paths land on the workspace, and Stripe return leaves for it", () => {
  const cfg = readFileSync("next.config.ts", "utf8");
  assert.match(cfg, /\["\/app\/business", "\/app\/agents", "\/app\/approvals"\]\.map\(\(source\) => \(\{ source, destination: "https:\/\/business\.keplar\.one\/work"/);
  assert.match(cfg, /\["\/enterprise", "\/agents"\]\.map\(\(source\) => \(\{ source, destination: "https:\/\/business\.keplar\.one"/);
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /openBusinessWorkspace\(\)/);
  assert.match(app, /openBusinessWorkspace\("replace"\)/);
  assert.doesNotMatch(app, /businessUrl\("\/work"\)/, "the desktop window stays on keplar.one");
  const site = readFileSync("src/lib/business-site.ts", "utf8");
  assert.match(site, /businessUrl\("\/work"\)/);
  assert.match(site, /data-desktop/);
});
