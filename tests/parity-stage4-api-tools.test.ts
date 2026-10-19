import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTools, prepareTools, postsDoc } from "../src/lib/api/tools";
import { OFF_NOT_ENABLED } from "../src/lib/orchestration/research-notes";
import { parseAsk } from "../src/lib/api/ask";
import { LinkError, type LinkRead } from "../src/lib/attachments/link";

const ws = { id: "ws_api_tools", plan: "pro" } as const;
const noDaily = async () => {};

test("parseTools validates types, duplicates, urls and queries", () => {
  assert.deepEqual(parseTools(undefined), []);
  assert.deepEqual(parseTools(["reason", { type: "read_url", urls: [" https://example.com/a "] }]), [{ type: "reason" }, { type: "read_url", urls: ["https://example.com/a"] }]);
  assert.throws(() => parseTools("reason"), /array/);
  assert.throws(() => parseTools(["code_interpreter"]), /one of/);
  assert.throws(() => parseTools(["reason", "reason"]), /twice/);
  assert.throws(() => parseTools([{ type: "read_url" }]), /urls/);
  assert.throws(() => parseTools([{ type: "read_url", urls: ["ftp://x.test/a"] }]), /http/);
  assert.throws(() => parseTools([{ type: "read_url", urls: ["https://a.test", "https://b.test", "https://c.test", "https://d.test"] }]), /urls/);
  assert.throws(() => parseTools([{ type: "x_search", query: "x".repeat(400) }]), /query/);
  assert.equal(parseAsk({ question: "hi", tools: ["debate"] }).tools?.[0]?.type, "debate");
  assert.equal(parseAsk({ question: "hi" }).tools, undefined);
});

test("web and deep research stay off unless retrieval is enabled, and never on Free", async () => {
  const tools = parseTools(["web_search", "deep_research", "reason"]);
  const off = await prepareTools(ws, tools, "q", { env: {} });
  assert.deepEqual(off.modes, { reason: true });
  assert.deepEqual(off.report.map((r) => r.status), ["unavailable", "unavailable", "requested"]);
  assert.equal(off.report[1]!.detail, OFF_NOT_ENABLED);
  assert.equal((await prepareTools(ws, tools, "q", { env: { KEPLAR_RETRIEVAL_ENABLED: "yes" } })).report[1]!.detail, OFF_NOT_ENABLED);
  const on = await prepareTools(ws, tools, "q", { env: { KEPLAR_RETRIEVAL_ENABLED: "true" } });
  assert.deepEqual(on.modes, { web: true, deepResearch: true, reason: true });
  const free = await prepareTools({ id: "w", plan: "free" }, tools, "q", { env: { KEPLAR_RETRIEVAL_ENABLED: "true" } });
  assert.equal(free.modes.web, undefined);
  assert.equal(free.modes.deepResearch, undefined);
  assert.match(free.report[0].detail, /paid/);
  assert.match(free.report[1]!.detail, /paid/);
});

test("read_url hands readable pages to the models as link documents and reports failures", async () => {
  const read = async (url: string) => {
    if (url.includes("bad")) throw new LinkError("private", "That address isn't public.");
    return { url, finalUrl: url, host: "example.com", kind: "article", title: "Example page", text: "Page text", summary: "", truncated: false, notes: [] } as unknown as LinkRead;
  };
  const r = await prepareTools(ws, parseTools([{ type: "read_url", urls: ["https://example.com/a", "https://bad.test/"] }]), "q", { read: read as never, daily: noDaily });
  assert.equal(r.docs.length, 1);
  assert.equal(r.docs[0].source, "link");
  assert.equal(r.docs[0].url, "https://example.com/a");
  assert.equal(r.report[0].status, "used");
  assert.match(r.report[0].detail, /Read 1 of 2 links.*isn't public/);
  const none = await prepareTools(ws, parseTools([{ type: "read_url", urls: ["https://bad.test/"] }]), "q", { read: read as never, daily: noDaily });
  assert.equal(none.report[0].status, "failed");
  assert.equal(none.docs.length, 0);
});

test("x_search needs the connection, a paid plan and Family mode off", async () => {
  const tools = parseTools([{ type: "x_search", query: "keplar" }]);
  const posts = [{ id: "1", text: "hello\nworld", author: { handle: "someone", name: "S" }, createdAt: "2026-10-01T00:00:00Z", url: "https://x.com/someone/status/1", metrics: null }];
  const searchX = async () => ({ ok: true as const, posts });
  const env = { X_BEARER_TOKEN: "t" };
  assert.equal((await prepareTools(ws, tools, "q", { env: {}, searchX })).report[0].status, "unavailable");
  assert.equal((await prepareTools({ id: "w", plan: "free" }, tools, "q", { env, searchX })).report[0].status, "unavailable");
  assert.match((await prepareTools(ws, tools, "q", { env, searchX, family: async () => true })).report[0].detail, /Family/);
  const ok = await prepareTools(ws, tools, "q", { env, searchX, family: async () => false });
  assert.equal(ok.report[0].status, "used");
  assert.match(ok.docs[0].text, /not verified facts[\s\S]*@someone \(2026-10-01T00:00:00Z\): hello world/);
  assert.equal(postsDoc("q", []).source, "file");
  const fail = await prepareTools(ws, tools, "q", { env, family: async () => false, searchX: async () => ({ ok: false as const, reason: "rate_limited" as const, message: "Search on X is busy." }) });
  assert.deepEqual(fail.report[0], { type: "x_search", status: "failed", detail: "Search on X is busy." });
});
