import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jsonReq, call, signIn } from "./helpers/session";
import { GET, PUT, DELETE } from "../src/app/api/studio/chats/route";
import { chatKey, STUDIO_CHAT_LIMITS } from "../src/lib/studio/chats";
import { USER_COLLECTIONS } from "../src/lib/privacy/account-data";

const KEY = "keplar-studio-chat:id:132547270460088";
const session = (savedAt: number, text = "Add a door") => ({
  v: 1, savedAt, name: "Keplar Testing", items: [{ kind: "user", key: "u", text, images: [] }],
  history: [{ role: "user", content: text }], plan: [], current: 0, finished: false, built: [], stats: { steps: 0, changes: 0, errors: 0 }, units: 0,
});

test("studio chats: saved on the account per game, newest save wins, and only for its owner", async () => {
  const a = await signIn("studio-sync-a@example.com", "plus");
  const b = await signIn("studio-sync-b@example.com", "plus");
  const t0 = Date.now() - 60_000;

  assert.equal((await GET(call(null, `/api/studio/chats?key=${encodeURIComponent(KEY)}`))).status, 401, "signed out: nothing");
  assert.deepEqual(await (await GET(call(a.cookie, `/api/studio/chats?key=${encodeURIComponent(KEY)}`))).json(), { chat: null });

  const put = await PUT(jsonReq(a.cookie, "/api/studio/chats", "PUT", { key: KEY, session: session(t0) }));
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { savedAt: t0, stale: false });

  // Another computer opens the same game and gets it.
  const got = await (await GET(call(a.cookie, `/api/studio/chats?key=${encodeURIComponent(KEY)}`))).json() as { chat: { savedAt: number; session: { items: { text: string }[] } } };
  assert.equal(got.chat.savedAt, t0);
  assert.equal(got.chat.session.items[0]!.text, "Add a door");

  // A newer save replaces it; an older one (a device that was offline) does not.
  await PUT(jsonReq(a.cookie, "/api/studio/chats", "PUT", { key: KEY, session: session(t0 + 10_000, "Make the door red") }));
  const stale = await (await PUT(jsonReq(a.cookie, "/api/studio/chats", "PUT", { key: KEY, session: session(t0 + 5_000, "old") }))).json();
  assert.deepEqual(stale, { savedAt: t0 + 10_000, stale: true });
  const now = await (await GET(call(a.cookie, `/api/studio/chats?key=${encodeURIComponent(KEY)}`))).json() as { chat: { session: { items: { text: string }[] } } };
  assert.equal(now.chat.session.items[0]!.text, "Make the door red");

  // Per account: someone else's account does not see it.
  assert.deepEqual(await (await GET(call(b.cookie, `/api/studio/chats?key=${encodeURIComponent(KEY)}`))).json(), { chat: null });

  // The list shows names and dates only.
  const list = await (await GET(call(a.cookie, "/api/studio/chats"))).json() as { chats: { key: string; name: string; savedAt: number }[] };
  assert.deepEqual(list.chats, [{ key: KEY, name: "Keplar Testing", savedAt: t0 + 10_000 }]);

  // New session for that game removes it from the account.
  assert.deepEqual(await (await DELETE(call(a.cookie, `/api/studio/chats?key=${encodeURIComponent(KEY)}`, { method: "DELETE" }))).json(), { removed: true });
  assert.deepEqual(await (await GET(call(a.cookie, `/api/studio/chats?key=${encodeURIComponent(KEY)}`))).json(), { chat: null });
});

test("studio chats: bad keys, images, oversized saves and cross-site writes are refused", async () => {
  const a = await signIn("studio-sync-c@example.com", "plus");
  for (const key of ["", "id:0", "id:abc", "other:1", "x".repeat(300)]) {
    assert.equal((await PUT(jsonReq(a.cookie, "/api/studio/chats", "PUT", { key, session: session(Date.now()) }))).status, 400, key);
  }
  const withImage = { ...session(Date.now()), items: [{ kind: "user", key: "u", text: "x", images: ["data:image/png;base64,AAAA"] }] };
  assert.equal((await PUT(jsonReq(a.cookie, "/api/studio/chats", "PUT", { key: KEY, session: withImage }))).status, 400);
  const huge = { ...session(Date.now()), history: [{ role: "user", content: "x".repeat(STUDIO_CHAT_LIMITS.maxChars) }] };
  assert.equal((await PUT(jsonReq(a.cookie, "/api/studio/chats", "PUT", { key: KEY, session: huge }))).status, 413);
  assert.equal((await PUT(jsonReq(a.cookie, "/api/studio/chats", "PUT", { key: KEY, session: { v: 2 } }))).status, 400);
  const crossSite = new Request("https://keplar.one/api/studio/chats", { method: "PUT", headers: { cookie: a.cookie, origin: "https://evil.test", "content-type": "application/json" }, body: JSON.stringify({ key: KEY, session: session(Date.now()) }) });
  assert.equal((await PUT(crossSite)).status, 403);
});

test("studio chats: stable ids per game, and they are exported and deleted with the account", () => {
  assert.equal(chatKey(KEY).id, chatKey("id:132547270460088").id, "the device key and the bare key are the same game");
  assert.notEqual(chatKey("name:my obby").id, chatKey("name:my obby 2").id);
  assert.ok((USER_COLLECTIONS as readonly string[]).includes("studio_chats"));
  const hook = readFileSync("src/components/app-ui/studio-mode/useStudioAgent.ts", "utf8");
  assert.match(hook, /if \(remote\.savedAt <= \(local\?\.savedAt \?\? 0\)\) return;/, "the account copy replaces the device copy only when newer");
  assert.match(hook, /if \(skipSave\.current\) \{ skipSave\.current = false; return; \}/, "a restore is not saved back before the account copy is compared");
  assert.match(hook, /void deleteRemote\(placeKey\(placeRef\.current\)\)/, "New session clears the account copy too");
});
