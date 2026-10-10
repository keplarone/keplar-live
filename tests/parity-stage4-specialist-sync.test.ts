import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq } from "./helpers/session";
import { PUT as chatPUT, GET as chatGET } from "@/app/api/chats/[id]/route";
import { GET as chatsGET } from "@/app/api/chats/route";
import { reducer, initialState } from "@/components/app-ui/state/store";
import type { AppState } from "@/components/app-ui/state/types";

test("a chat's Specialist is saved with the account copy and comes back on another device", async () => {
  const s = (await signIn("spec-sync@example.com")).cookie;
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const put = (id: string, specialistId: unknown) => chatPUT(jsonReq(s, `http://localhost/api/chats/${id}`, "PUT", { title: "T", projectId: null, createdAt: 1, updatedAt: 2, messages: [{ id: "m", role: "user", text: "hi" }], specialistId }), ctx(id));
  assert.equal((await put("chat_spec_1", "sp_abcdefghijkl")).status, 200);
  assert.equal((await put("chat_spec_2", "../../etc")).status, 200);
  const one = await (await chatGET(jsonReq(s, "http://localhost/api/chats/chat_spec_1", "GET", undefined), ctx("chat_spec_1"))).json() as { chat: { specialistId: string | null } };
  assert.equal(one.chat.specialistId, "sp_abcdefghijkl");
  const two = await (await chatGET(jsonReq(s, "http://localhost/api/chats/chat_spec_2", "GET", undefined), ctx("chat_spec_2"))).json() as { chat: { specialistId: string | null } };
  assert.equal(two.chat.specialistId, null, "anything that isn't a specialist id is dropped");
  const list = await (await chatsGET(jsonReq(s, "http://localhost/api/chats", "GET", undefined))).json() as { chats: { id: string; specialistId?: string }[] };
  assert.equal(list.chats.find((c) => c.id === "chat_spec_1")?.specialistId, "sp_abcdefghijkl");

  // Another device: the list brings the specialist in, and opening the chat keeps it.
  let st: AppState = { ...initialState(), scope: "user:u" };
  st = reducer(st, { type: "merge-remote", scope: st.scope, chats: [{ id: "chat_spec_1", title: "T", projectId: null, createdAt: 1, updatedAt: 2, specialistId: "sp_abcdefghijkl" }] });
  assert.equal(st.threads.find((t) => t.id === "chat_spec_1")?.specialistId, "sp_abcdefghijkl");
  st = reducer(st, { type: "hydrate", scope: st.scope, id: "chat_spec_1", messages: [], specialistId: null });
  assert.equal(st.threads.find((t) => t.id === "chat_spec_1")?.specialistId, undefined, "the server copy wins when the chat is opened");
});
