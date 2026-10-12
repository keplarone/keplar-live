/* eslint-disable @typescript-eslint/no-explicit-any -- the tests read loosely-typed JSON bodies */
import "./setup";
import "./helpers/oauth-env";
import { signIn, jsonReq, call } from "./helpers/session";
import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeOf, newSecret } from "@/lib/desktop-auth/core";
import { POST as connectPost, OPTIONS as connectOptions } from "@/app/api/extension/connect/route";
import { POST as tokenPost } from "@/app/api/extension/token/route";
import { POST as disconnectPost } from "@/app/api/extension/disconnect/route";
import { GET as usageGet } from "@/app/api/v1/usage/route";
import { GET as keysGet, POST as keysPost } from "@/app/api/keys/route";
import { DELETE as keyDelete } from "@/app/api/keys/[id]/route";
import { apiKeys } from "@/lib/api/keys";
import { EXTENSION_KEY_DAYS, MAX_EXTENSION_CONNECTIONS } from "@/lib/api/extension";

// The browser extension connects to an account instead of asking for a pasted API key (src/lib/api/extension.ts).
const ORIGIN = "https://keplar.one";
const EXT_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
let n = 0;
const ip = () => `10.88.${(++n >> 8) & 255}.${n & 255}`;
const email = (tag: string) => `ext-${tag}${++n}-${Math.random().toString(36).slice(2, 7)}@example.com`;
const ext = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/extension/${path}`, { method: "POST", headers: { "content-type": "application/json", origin: EXT_ORIGIN, "x-forwarded-for": ip(), ...headers }, body: JSON.stringify(body) });
const authHandler = async (req: Request) => (await import("@/lib/accounts/auth")).auth.handler(req);
const desktop = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  authHandler(new Request(`${ORIGIN}/api/auth/desktop/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip(), ...headers }, body: JSON.stringify(body) }));
const approve = (rid: string, cookie: string) => desktop("approve", { rid }, { origin: ORIGIN, cookie });
const poll = async (rid: string, verifier: string) => (await tokenPost(ext("token", { rid, verifier }))).json() as Promise<Record<string, any>>;
const usage = (key: string) => usageGet(new Request(`${ORIGIN}/api/v1/usage`, { headers: { authorization: `Bearer ${key}`, "x-forwarded-for": ip() } }));

async function begin(label = "Keplar One extension (Chrome)") {
  const verifier = newSecret();
  const res = await connectPost(ext("connect", { challenge: challengeOf(verifier), label }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*", "the extension reads it cross-origin, without cookies");
  const j = (await res.json()) as Record<string, any>;
  return { verifier, rid: j.rid as string, code: j.code as string, url: j.url as string };
}

/** Start, approve as this signed-in person, collect: the key the extension would store. */
async function connect(cookie: string, label?: string): Promise<string> {
  const b = await begin(label);
  assert.equal((await approve(b.rid, cookie)).status, 200);
  const r = await poll(b.rid, b.verifier);
  assert.equal(r.status, "connected");
  return r.key as string;
}

test("connect: approve on keplar.one, then the extension collects a key for that account, exactly once", async () => {
  const who = email("full");
  const u = await signIn(who, "plus");
  const b = await begin();
  assert.equal(new URL(b.url).origin, ORIGIN);
  assert.equal(new URL(b.url).pathname, "/desktop/connect", "the same approval page as the desktop app");
  assert.equal(new URL(b.url).searchParams.get("rid"), b.rid);
  assert.match(b.code, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/, "a code to compare with the one on the page");

  assert.equal((await poll(b.rid, b.verifier)).status, "pending", "nothing until the person approves");
  assert.equal((await approve(b.rid, u.cookie)).status, 200);
  assert.equal((await poll(b.rid, newSecret())).status, "invalid", "PKCE: without the extension's verifier there is nothing to collect");

  const r = await poll(b.rid, b.verifier);
  assert.equal(r.status, "connected");
  assert.match(r.key, /^kpl_[A-Za-z0-9_-]{32}$/);
  assert.equal(r.email, who);
  assert.equal((await poll(b.rid, b.verifier)).status, "used", "collected once; a second poll gets no second key");

  const rows = await apiKeys().list(u.workspaceId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.kind, "extension");
  assert.deepEqual(rows[0]!.scopes, ["ask", "usage"]);
  assert.equal(rows[0]!.name, "Keplar One extension (Chrome)");
  assert.ok(!JSON.stringify(rows).includes(r.key), "only the hash is stored");
  const days = (Date.parse(rows[0]!.expiresAt!) - Date.now()) / 864e5;
  assert.ok(days > EXTENSION_KEY_DAYS - 1 && days <= EXTENSION_KEY_DAYS, `lasts ${EXTENSION_KEY_DAYS} days`);

  // It is that account's: the plan and credits are the account's own, read like any key.
  const used = await usage(r.key);
  assert.equal(used.status, 200);
  assert.equal(((await used.json()) as Record<string, any>).plan, "plus");
  // Account → Developer API lists it as a browser extension.
  const list = (await (await keysGet(call(u.cookie, "/api/keys"))).json()) as Record<string, any>;
  assert.equal(list.keys[0].kind, "extension");
});

test("a connection is outside the plan's key allowance: Free can connect and still make its one key", async () => {
  const u = await signIn(email("free"), "free");
  const key = await connect(u.cookie);
  const made = await keysPost(jsonReq(u.cookie, "/api/keys", "POST", { name: "my script", scopes: ["ask", "usage"] }));
  assert.equal(made.status, 201, "the connection doesn't use up Free's single key");
  const hand = ((await made.json()) as Record<string, any>).key as string;
  assert.equal((await usage(key)).status, 200, "and the connection isn't cut as 'over the limit'");
  assert.equal((await usage(hand)).status, 200);
  assert.equal((await keysPost(jsonReq(u.cookie, "/api/keys", "POST", { name: "second" }))).status, 409, "Free's own allowance is unchanged");
});

test("never a browser session: an extension ticket can't open /desktop/finish, and a desktop request can't be collected as a key", async () => {
  const u = await signIn(email("sess"), "plus");
  const b = await begin();
  assert.equal((await approve(b.rid, u.cookie)).status, 200);
  // Even the extension itself, walking the desktop app's own steps with its verifier, gets no session.
  const polled = (await (await desktop("poll", { rid: b.rid, verifier: b.verifier })).json()) as Record<string, any>;
  assert.equal(polled.status, "approved");
  const ex = (await (await desktop("exchange", { rid: b.rid, code: polled.code, verifier: b.verifier })).json()) as Record<string, any>;
  assert.equal(typeof ex.ticket, "string");
  const fin = await authHandler(new Request(`${ORIGIN}/api/auth/desktop/finish?ticket=${ex.ticket}`, { method: "GET", redirect: "manual", headers: { "x-forwarded-for": ip() } } as RequestInit));
  assert.ok([302, 303, 307].includes(fin.status));
  assert.match(fin.headers.get("location") ?? "", /error=desktop_link_used/);
  assert.ok(!fin.headers.getSetCookie().some((c) => /session_token=[^;]+/.test(c) && !/session_token=;/.test(c)), "no session cookie");

  // A desktop app's request (Keplar One) approved by the same person is never turned into a key.
  const verifier = newSecret();
  const started = (await (await desktop("start", { challenge: challengeOf(verifier), label: "Keplar One on Windows" })).json()) as Record<string, any>;
  assert.equal((await approve(started.rid, u.cookie)).status, 200);
  assert.equal((await poll(started.rid, verifier)).status, "invalid");
  assert.equal((await apiKeys().list(u.workspaceId)).length, 0, "no key was made");
});

test("stopped or unknown requests give nothing", async () => {
  const b = await begin();
  assert.equal((await desktop("deny", { rid: b.rid }, { origin: ORIGIN })).status, 200);
  assert.equal((await poll(b.rid, b.verifier)).status, "denied");
  assert.equal((await poll("x".repeat(32), b.verifier)).status, "invalid");
  assert.equal((await poll("short", "short")).status, "invalid");
  assert.equal((await connectPost(ext("connect", { challenge: "nope" }))).status, 400);
  assert.equal((await connectOptions()).status, 204);
});

test("disconnect: the extension revokes its own connection; a key made by hand can't be revoked this way", async () => {
  const u = await signIn(email("disc"), "plus");
  const key = await connect(u.cookie);
  assert.equal((await disconnectPost(ext("disconnect", {}, { authorization: `Bearer ${key}` }))).status, 204);
  assert.equal((await usage(key)).status, 401, "the very next request is refused");
  assert.equal((await disconnectPost(ext("disconnect", {}, { authorization: `Bearer ${key}` }))).status, 401, "already gone");
  assert.equal((await disconnectPost(ext("disconnect", {}))).status, 401, "no key");

  const hand = ((await (await keysPost(jsonReq(u.cookie, "/api/keys", "POST", { name: "by hand", scopes: ["ask", "usage"] }))).json()) as Record<string, any>).key as string;
  assert.equal((await disconnectPost(ext("disconnect", {}, { authorization: `Bearer ${hand}` }))).status, 403);
  assert.equal((await usage(hand)).status, 200, "untouched");

  // Disconnecting in Account → Developer API works like revoking a key.
  const again = await connect(u.cookie);
  const row = (await apiKeys().list(u.workspaceId)).find((k) => k.kind === "extension" && !k.revokedAt)!;
  const del = await keyDelete(call(u.cookie, `/api/keys/${row.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: row.id }) });
  assert.ok(del.status < 300, `revoked from Account: ${del.status}`);
  assert.equal((await usage(again)).status, 401);
});

test(`at most ${MAX_EXTENSION_CONNECTIONS} browsers per account: connecting one more retires the oldest`, async () => {
  const u = await signIn(email("cap"), "plus");
  const keys: string[] = [];
  for (let i = 0; i <= MAX_EXTENSION_CONNECTIONS; i++) keys.push(await connect(u.cookie, `Browser ${i}`));
  assert.equal((await usage(keys[0]!)).status, 401, "the oldest connection was retired");
  for (const k of keys.slice(1)) assert.equal((await usage(k)).status, 200);
});
