import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardQaContext } from "@/lib/site-builder/qa/run";
import type { Resolver } from "@/lib/browser/run";

// IN-6 (docs/rebirth/AUDIT.md): the site QA browser opens user-authored drafts on our servers with no network allow-list, so a
// draft's <img src> or fetch() could reach a private, loopback or cloud-metadata address. It now uses Keplar Browser's guard:
// our own origin (the draft itself, even on localhost in development) passes, the public web is fetched through the pinned
// transport, anything private is refused.
const resolve: Resolver = async (host) => (host === "metadata.internal" ? ["169.254.169.254"] : host === "intranet.example" ? ["10.0.0.5"] : host === "localhost" ? ["127.0.0.1"] : ["93.184.215.14"]);

async function rig() {
  let handler: ((r: unknown) => Promise<unknown>) | undefined;
  let sockets = false;
  const ctx = { route: async (_p: string, h: (r: unknown) => Promise<unknown>) => { handler = h; }, routeWebSocket: async () => { sockets = true; } };
  const fetched: string[] = [];
  await guardQaContext(ctx as never, { baseUrl: "http://localhost:3350", resolve, transport: async (_r, url) => { fetched.push(url); return { status: 200, headers: {}, body: Buffer.from("ok") }; } });
  const send = async (url: string, method = "GET", type = "image") => {
    const r = { result: "", request: () => ({ url: () => url, method: () => method, resourceType: () => type, headers: () => ({}) }), abort: async () => { r.result = "aborted"; }, fulfill: async () => { r.result = "fulfilled"; }, continue: async () => { r.result = "continued"; } };
    await handler!(r);
    return r.result;
  };
  return { send, fetched, sockets: () => sockets };
}

test("QA browser: own origin passes (form posts too), public web goes through the pinned transport, private addresses are refused", async () => {
  const g = await rig();
  assert.ok(g.sockets(), "WebSockets are closed");
  assert.equal(await g.send("http://localhost:3350/sites/draft/s1/1?t=x", "GET", "document"), "continued");
  assert.equal(await g.send("http://localhost:3350/api/business/forms/p1", "POST", "document"), "continued", "the QA form check still works");
  assert.equal(await g.send("https://fonts.example.com/a.woff2", "GET", "font"), "fulfilled");
  assert.deepEqual(g.fetched, ["https://fonts.example.com/a.woff2"]);
  assert.equal(await g.send("http://169.254.169.254/latest/meta-data/"), "aborted");
  assert.equal(await g.send("http://metadata.internal/computeMetadata/v1/", "GET", "fetch"), "aborted");
  assert.equal(await g.send("http://intranet.example/admin"), "aborted");
  assert.equal(await g.send("http://localhost:8080/"), "aborted", "another port on localhost is not our origin");
  assert.equal(await g.send("http://127.0.0.1:3350/"), "aborted", "nor the same server under another name");
  assert.equal(await g.send("https://evil.example/collect", "POST", "document"), "aborted", "no form posts to other sites");
  assert.equal(g.fetched.length, 1);
});
