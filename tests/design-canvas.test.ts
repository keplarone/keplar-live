import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { call, jsonReq, signIn } from "./helpers/session";
import { cleanFragment, parseCanvasReply } from "@/lib/site-builder/canvas";
import { BUSINESS_TIERS } from "@/lib/business/tiers";

process.env.OPENROUTER_API_KEY = "test-key";
process.env.KEPLAR_OPENROUTER_BASE = "http://mock.canvas.test/api/v1";

/* ── mock OpenRouter (non-streaming JSON reply) ── */
let reply = "";
let seen: { model: string; messages: { role: string; content: string }[] }[] = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://mock.canvas.test/")) return realFetch(input, init);
    seen.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: reply } }], usage: { prompt_tokens: 500, completion_tokens: 300, cost: 0.0012 } });
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const canvas = () => import("@/app/api/sites/[id]/canvas/route");

async function siteFor(plan: "business" | "pro") {
  const { cookie } = await signIn(`canvas-${plan}-${Math.random().toString(36).slice(2, 8)}@example.com`, plan);
  const { POST } = await import("@/app/api/sites/route");
  const res = await POST(jsonReq(cookie, "/api/sites", "POST", { name: "Fig & Oat", template: "restaurant" }));
  assert.equal(res.status, 201, await res.clone().text());
  const site = ((await res.json()) as { site: { id: string; headVersion: number; kind: string } }).site;
  const { GET } = await import("@/app/api/sites/[id]/route");
  const detail = (await (await GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json()) as { files: Record<string, string>; site: { headVersion: number; kind: string } };
  return { cookie, site, files: detail.files, head: detail.site.headVersion, kind: detail.site.kind };
}

test("sanitizing AI fragments: scripts, handlers and javascript: links never reach the canvas", () => {
  const out = cleanFragment(`<section style="padding:24px"><h2 onclick="steal()">Menu</h2><script>alert(1)</script><a href="javascript:alert(1)">x</a></section>`);
  assert.match(out, /^<section style="padding:24px"><h2>Menu<\/h2>/);
  assert.doesNotMatch(out, /script|onclick|javascript:/i);
  assert.equal(parseCanvasReply("no json here"), null);
  assert.equal(parseCanvasReply(`{"html": "just text", "note": "x"}`), null, "must be an element");
  assert.deepEqual(parseCanvasReply(`Sure! {"html": "<p>Hi</p>", "note": "Shorter intro"}`), { html: "<p>Hi</p>", note: "Shorter intro" });
});

test("Design Canvas is Business only: Keplar One plans get 402 for AI and saving", async () => {
  const { cookie, site, files, head } = await siteFor("pro");
  const { POST, PUT } = await canvas();
  const ai = await POST(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "POST", { element: "<h1>Hi</h1>", instruction: "make it bigger" }), ctx(site.id));
  assert.equal(ai.status, 402);
  const save = await PUT(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "PUT", { files: { "index.html": files["index.html"].replace("</h1>", " today</h1>") }, baseVersion: head }), ctx(site.id));
  assert.equal(save.status, 402);
});

test("Business: AI proposes a sanitized element and charges usage; nothing is saved until approval", async () => {
  const { cookie, site, head } = await siteFor("business");
  const { POST } = await canvas();
  seen = [];
  reply = JSON.stringify({ html: `<h1 style="font-size:56px" onmouseover="x()">Fig &amp; Oat</h1><script>bad()</script>`, note: "Larger headline" });
  const res = await POST(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "POST", { element: "<h1>Fig &amp; Oat</h1>", instruction: "make the headline much larger", classes: ["hero", "bad class!"] }), ctx(site.id));
  assert.equal(res.status, 200, await res.clone().text());
  const out = (await res.json()) as { html: string; note: string };
  assert.match(out.html, /font-size:56px/);
  assert.doesNotMatch(out.html, /script|onmouseover/);
  assert.equal(out.note, "Larger headline");
  assert.equal(seen.length, 1);
  assert.match(seen[0].messages[1].content, /CLASSES USED ON THIS PAGE: hero\n/, "only safe class names reach the model");
  const { GET } = await import("@/app/api/sites/[id]/route");
  const after = (await (await GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json()) as { site: { headVersion: number } };
  assert.equal(after.site.headVersion, head, "an AI proposal alone saves nothing");

  const empty = await POST(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "POST", { element: "", instruction: "x y z" }), ctx(site.id));
  assert.equal(empty.status, 400);
});

test("Business: Approve and save makes a sanitized new version; a stale draft is refused, not merged", async () => {
  const { cookie, site, files, head } = await siteFor("business");
  const { PUT } = await canvas();
  const edited = files["index.html"].replace(/<h1([^>]*)>/, `<h1$1 style="color:#b45309">`).replace("</body>", `<script>alert(1)</script></body>`);
  const res = await PUT(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "PUT", { files: { "index.html": edited }, baseVersion: head, note: "Text color of h1" }), ctx(site.id));
  assert.equal(res.status, 200, await res.clone().text());
  const { version } = (await res.json()) as { version: number };
  assert.equal(version, head + 1);
  const { GET } = await import("@/app/api/sites/[id]/route");
  const now = (await (await GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json()) as { files: Record<string, string>; versions: { n: number; kind: string; summary: string }[] };
  assert.match(now.files["index.html"], /color:#b45309/);
  assert.doesNotMatch(now.files["index.html"], /alert\(1\)/, "saved through the same sanitizer as every edit");
  assert.equal(now.versions[0].kind, "edit");
  assert.equal(now.versions[0].summary, "Text color of h1");

  const stale = await PUT(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "PUT", { files: { "index.html": edited.replace("#b45309", "#000000") }, baseVersion: head }), ctx(site.id));
  assert.equal(stale.status, 409);
  const unknown = await PUT(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "PUT", { files: { "secret.html": "<p>x</p>" }, baseVersion: version }), ctx(site.id));
  assert.equal(unknown.status, 404);
  const same = await PUT(jsonReq(cookie, `/api/sites/${site.id}/canvas`, "PUT", { files: { "index.html": now.files["index.html"] }, baseVersion: version }), ctx(site.id));
  assert.equal(same.status, 400, "no changes, no empty version");
});

test("the canvas is a real Business workspace module, and the plans that promise it can open it", () => {
  const ws = readFileSync("src/components/business-app/BusinessWorkspace.tsx", "utf8");
  assert.match(ws, /label: "Design Canvas"/);
  assert.match(ws, /import\("\.\/DesignCanvas"\)/);
  const ui = readFileSync("src/components/business-app/DesignCanvas.tsx", "utf8");
  assert.match(ui, /sandbox="allow-same-origin"/, "draft renders with scripts, forms and navigation off");
  assert.match(ui, /Approve and save/);
  assert.match(ui, /method: "PUT"/);
  assert.ok(BUSINESS_TIERS.starter.includes.includes("AI Design Canvas"));
});
