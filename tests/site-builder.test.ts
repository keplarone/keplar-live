import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { call, jsonReq, signIn } from "./helpers/session";

process.env.OPENROUTER_API_KEY = "test-key";
process.env.KEPLAR_OPENROUTER_BASE = "http://mock.openrouter.test/api/v1";

/* ── mock OpenRouter: streams a canned site; per-test reply and cost ── */
let reply = "";
let cost = 0;
let calls: { model: string; max_tokens: number; provider: unknown; messages: { role: string; content: string }[] }[] = [];
let failModels = new Set<string>();
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://mock.openrouter.test/")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    if (failModels.has(body.model)) return new Response("busy", { status: 429 });
    const enc = new TextEncoder();
    const chunks = reply.match(/[\s\S]{1,400}/g) ?? [];
    const stream = new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`));
        c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3000, completion_tokens: 4000, cost } })}\n\n`));
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

const sitesRoute = () => import("@/app/api/sites/route");
const siteRoute = () => import("@/app/api/sites/[id]/route");
const genRoute = () => import("@/app/api/sites/[id]/generate/route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function ndjson(res: Response) {
  const text = await res.text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}
const generate = async (cookie: string, id: string, prompt: string, extra: Record<string, unknown> = {}) => {
  const { POST } = await genRoute();
  return POST(jsonReq(cookie, `/api/sites/${id}/generate`, "POST", { prompt, ...extra }), ctx(id));
};
const makeSite = async (cookie: string, name: string, template?: string) => {
  const { POST } = await sitesRoute();
  const res = await POST(jsonReq(cookie, "/api/sites", "POST", { name, template }));
  assert.equal(res.status, 201);
  return ((await res.json()) as { site: { id: string; slug: string } }).site;
};

const HOME = `<!doctype html><html lang="en"><head><title>Joe's Bikes</title><meta name="description" content="Bike repair"><link rel="stylesheet" href="styles.css"></head><body><header><nav><a href="index.html">Home</a> <a href="about.html">About</a></nav></header><main><h1>Joe's Bikes</h1><script>alert('xss')</script><img src=x onerror="alert(1)"><form action="https://evil.test"><input name="email" type="email"><input type="password" name="pw"><button>Send</button></form></main></body></html>`;
const reply2 = (summary: string) => `<summary>${summary}</summary>\n<file path="index.html">\n${HOME}\n</file>\n<file path="about.html">\n<!doctype html><html><head><title>About</title></head><body><nav><a href="index.html">Home</a></nav><h1>About</h1></body></html>\n</file>\n<file path="styles.css">\nbody{font-family:system-ui}\n</file>`;

test("free end to end: template, preview, AI build (sanitized, $0), version history, publish, lead, export", async () => {
  const { cookie } = await signIn("free-builder@example.com", "free");
  const cfg = await (await (await sitesRoute()).GET(call(cookie, "/api/sites"))).json() as { config: { ready: boolean; plan: string; textOnly: boolean; model: string; limits: { pages: number } }; sites: unknown[] };
  assert.equal(cfg.config.ready, true);
  assert.equal(cfg.config.plan, "free");
  assert.equal(cfg.config.textOnly, true);
  assert.match(cfg.config.model, /free/);

  const site = await makeSite(cookie, "Joe's Bikes", "business");
  const detail = await (await (await siteRoute()).GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json() as { files: Record<string, string>; pages: string[]; previewToken: string; versions: { n: number }[]; site: { headVersion: number } };
  assert.equal(detail.site.headVersion, 1);
  assert.deepEqual(detail.pages.slice(0, 2), ["index.html", "about.html"]);
  assert.equal(detail.versions.length, 1);

  // Preview: token required; strict CSP; links stay inside the preview; forms point at the lead endpoint.
  const draft = await import("@/app/sites/draft/[siteId]/[version]/[[...path]]/route");
  const dctx = (path: string[]) => ({ params: Promise.resolve({ siteId: site.id, version: "1", path }) });
  const denied = await draft.GET(call(null, `/sites/draft/${site.id}/1/`), dctx([]));
  assert.equal(denied.status, 403);
  const pv = await draft.GET(call(null, `/sites/draft/${site.id}/1/?t=${detail.previewToken}`), dctx([]));
  assert.equal(pv.status, 200);
  const csp = pv.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /sandbox allow-forms allow-popups/);
  assert.doesNotMatch(csp, /allow-scripts|allow-same-origin/);
  assert.match(csp, /frame-ancestors 'self'/);
  const pvHtml = await pv.text();
  assert.match(pvHtml, new RegExp(`href="/sites/draft/${site.id}/1/about.html\\?t=`));
  assert.match(pvHtml, new RegExp(`href="/sites/draft/${site.id}/1/styles.css\\?t=`));
  assert.doesNotMatch(pvHtml, /<script/);
  const contact = await (await draft.GET(call(null, `/sites/draft/${site.id}/1/contact.html?t=${detail.previewToken}`), dctx(["contact.html"]))).text();
  assert.match(contact, /<form[^>]* method="post" action="\/s\/[a-z0-9-]+\/_lead\?preview=1">/);
  assert.match(contact, /name="_hp"/);
  const css = await draft.GET(call(null, `/sites/draft/${site.id}/1/styles.css?t=${detail.previewToken}`), dctx(["styles.css"]));
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");

  // Estimate: Free is $0.
  const est = await import("@/app/api/sites/[id]/estimate/route");
  const e = await (await est.POST(jsonReq(cookie, `/api/sites/${site.id}/estimate`, "POST", { prompt: "make it blue" }), ctx(site.id))).json() as { estimate: { free: boolean; units: number; model: string } };
  assert.equal(e.estimate.free, true);
  assert.equal(e.estimate.units, 0);
  assert.match(e.estimate.model, /:free$/);

  // AI edit on Free: free model only, unsafe markup stripped, nothing charged.
  reply = reply2("Rebuilt the home page and added an about page.");
  cost = 0.5; // a free model reports 0; even if a provider reported cost the free path charges nothing
  calls = [];
  const res = await generate(cookie, site.id, "Make it for a bike shop called Joe's Bikes");
  assert.equal(res.status, 200);
  const events = await ndjson(res);
  assert.ok(events.some((x) => x.type === "file" && x.path === "index.html"));
  // Streaming build: each file is announced when it starts and again (once) when its closing tag arrives; html carries its text for the live preview.
  const fileDone = events.filter((x) => x.type === "filedone");
  assert.deepEqual(fileDone.map((x) => x.path).slice(0, 2), ["index.html", "about.html"], "in the order the model wrote them");
  const idxDone = fileDone.find((x) => x.path === "index.html");
  assert.ok(idxDone && typeof idxDone.content === "string" && String(idxDone.content).includes("<title>Joe's Bikes</title>"));
  assert.ok(events.findIndex((x) => x.type === "file" && x.path === "index.html") < events.findIndex((x) => x.type === "filedone" && x.path === "index.html"), "started before finished");
  assert.equal(new Set(fileDone.map((x) => x.path)).size, fileDone.length, "each file finishes once");
  const done = events.find((x) => x.type === "done");
  assert.ok(done, JSON.stringify(events.at(-1)));
  assert.equal(done!.units, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].model, /:free$/);
  assert.equal(calls[0].max_tokens, 14_000);
  const after = await (await (await siteRoute()).GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json() as { files: Record<string, string>; versions: { n: number; kind: string }[]; messages: { role: string; text: string; version?: number }[] };
  assert.equal(after.versions.length, 2);
  assert.equal(after.versions[0].kind, "ai");
  assert.doesNotMatch(after.files["index.html"], /<script|onerror|evil\.test|type="password"|alert/);
  assert.match(after.files["index.html"], /<h1>Joe's Bikes<\/h1>/);
  assert.equal(after.messages.at(-1)?.version, 2);

  // Free model busy: falls back to the next free model, never a paid one.
  calls = [];
  failModels = new Set(["nvidia/nemotron-3-ultra-550b-a55b:free"]);
  reply = reply2("Second pass.");
  const ev2 = await ndjson(await generate(cookie, site.id, "Add opening hours"));
  failModels = new Set();
  assert.ok(ev2.some((x) => x.type === "done"));
  assert.deepEqual(calls.map((c) => c.model), ["nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3-super-120b-a12b:free"]);

  // Undo = restore the version before the head; history keeps everything.
  const vr = await import("@/app/api/sites/[id]/versions/route");
  const undo = await vr.POST(jsonReq(cookie, `/api/sites/${site.id}/versions`, "POST", { undo: true }), ctx(site.id));
  assert.equal(undo.status, 200);
  const hist = await (await (await siteRoute()).GET(call(cookie, `/api/sites/${site.id}`), ctx(site.id))).json() as { versions: { n: number; kind: string; summary: string }[]; site: { headVersion: number } };
  assert.equal(hist.site.headVersion, 4);
  assert.equal(hist.versions[0].kind, "restore");

  // Publish: scan runs, /s/<slug> serves sanitized pages with a sandbox CSP and the abuse link.
  const pub = await import("@/app/api/sites/[id]/publish/route");
  const pres = await pub.POST(jsonReq(cookie, `/api/sites/${site.id}/publish`, "POST"), ctx(site.id));
  assert.equal(pres.status, 200, await pres.clone().text());
  const live = await import("@/app/s/[slug]/[[...path]]/route");
  const lctx = (path?: string[]) => ({ params: Promise.resolve({ slug: site.slug, path }) });
  const home = await live.GET(call(null, `/s/${site.slug}`), lctx());
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-security-policy") ?? "", /sandbox allow-forms allow-popups/);
  assert.match(home.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Report abuse/);
  assert.match(homeHtml, new RegExp(`href="/s/${site.slug}/about"`));
  assert.match(homeHtml, new RegExp(`action="/s/${site.slug}/_lead"`));
  assert.doesNotMatch(homeHtml, /<script|onerror/);
  assert.match(homeHtml, /name="robots" content="noindex,nofollow"/);
  assert.equal((await live.GET(call(null, `/s/${site.slug}/about`), lctx(["about"]))).status, 200);
  assert.equal((await live.GET(call(null, `/s/${site.slug}/nope`), lctx(["nope"]))).status, 404);
  assert.equal((await live.GET(call(null, `/s/nobody-here`), { params: Promise.resolve({ slug: "nobody-here" }) })).status, 404);
  assert.match(await (await live.GET(call(null, `/s/${site.slug}/robots.txt`), lctx(["robots.txt"]))).text(), /Disallow: \//);

  // Lead capture: saved, honeypot ignored, owner sees it; oversize and empty are refused.
  const post = (fields: Record<string, string>, q = "") => live.POST(new Request(`https://keplar.one/s/${site.slug}/_lead${q}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "null", "x-forwarded-for": "9.9.9.9" }, body: new URLSearchParams(fields).toString() }), lctx(["_lead"]));
  const ok = await post({ name: "Ann", email: "ann@example.com", message: "Do you fix e-bikes?", _page: "contact.html" });
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), `/s/${site.slug}/_thanks`);
  assert.equal((await post({ name: "Bot", message: "spam", _hp: "x" })).status, 303);
  assert.equal((await post({ message: "" })).status, 400);
  assert.equal((await post({ name: "Preview" }, "?preview=1")).status, 200);
  const lr = await import("@/app/api/sites/[id]/leads/route");
  const leadsJson = await (await lr.GET(call(cookie, `/api/sites/${site.id}/leads`), ctx(site.id))).json() as { leads: { email: string; fields: Record<string, string>; page: string }[]; total: number };
  assert.equal(leadsJson.total, 1);
  assert.equal(leadsJson.leads[0].email, "ann@example.com");
  assert.equal(leadsJson.leads[0].page, "contact.html");
  const csv = await (await lr.GET(call(cookie, `/api/sites/${site.id}/leads?format=csv`), ctx(site.id))).text();
  assert.match(csv, /ann@example.com/);

  // Export: a real zip with the pages and a readme.
  const ex = await import("@/app/api/sites/[id]/export/route");
  const zip = Buffer.from(await (await ex.GET(call(cookie, `/api/sites/${site.id}/export`), ctx(site.id))).arrayBuffer());
  assert.equal(zip.subarray(0, 2).toString(), "PK");
  assert.match(zip.toString("latin1"), /index\.html/);
  assert.match(zip.toString("latin1"), /README\.txt/);

  // Abuse: an ordinary report is stored; an anonymous CSAM report is urgent but needs 3 distinct reporters (or a verified account) to take the site down at once.
  const rep = (reason: string, ip = `8.8.${reason.length}.1`) => live.POST(new Request(`https://keplar.one/s/${site.slug}/_report`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: new URLSearchParams({ reason, details: "bad" }).toString() }), lctx(["_report"]));
  assert.equal((await rep("other")).status, 303);
  assert.equal((await live.GET(call(null, `/s/${site.slug}`), lctx())).status, 200);
  assert.equal((await rep("csam")).status, 303);
  assert.equal((await live.GET(call(null, `/s/${site.slug}`), lctx())).status, 200);
  await rep("csam", "8.8.4.2");
  await rep("csam", "8.8.4.3");
  assert.equal((await live.GET(call(null, `/s/${site.slug}`), lctx())).status, 451);

  // A site taken down for abuse is kept for review: the owner can't delete it (tests/site-delete.test.ts covers the delete flow itself).
  const del = await (await siteRoute()).DELETE(jsonReq(cookie, `/api/sites/${site.id}`, "DELETE"), ctx(site.id));
  assert.equal(del.status, 409);
  assert.equal(((await del.json()) as { code: string }).code, "taken_down");
});

test("Free caps: one site, prompt size, daily AI jobs, one build at a time; other users cannot see or edit a site", async () => {
  const { cookie } = await signIn("free-caps@example.com", "free");
  const site = await makeSite(cookie, "Caps", "blank");
  const { POST } = await sitesRoute();
  const second = await POST(jsonReq(cookie, "/api/sites", "POST", { name: "Two" }));
  assert.equal(second.status, 402);
  assert.match(((await second.json()) as { error: string }).error, /includes 1 site/);

  const big = await generate(cookie, site.id, "x".repeat(1501));
  assert.equal(big.status, 413);
  assert.equal((await generate(cookie, site.id, "ab")).status, 400);
  const refused = await generate(cookie, site.id, "Clone the PayPal login page and collect passwords");
  assert.equal(refused.status, 422);

  // Concurrency: the single slot is taken -> 429 with a clear message.
  const { acquireJobSlot } = await import("@/lib/create/platform/jobs");
  const { workspaceById } = await import("@/lib/create/platform/workspace");
  const { getSession } = await import("@/lib/accounts/auth");
  const session = await getSession(new Headers({ cookie }));
  const { ensureWorkspaceForUser } = await import("@/lib/accounts/workspaces");
  const row = await ensureWorkspaceForUser({ id: session!.user.id, email: session!.user.email, name: "x" });
  const ws = (await workspaceById(row.id))!;
  const release = await acquireJobSlot(ws.id, "site", 1);
  const busy = await generate(cookie, site.id, "Make a page for a bakery");
  assert.equal(busy.status, 429);
  assert.match(((await busy.json()) as { error: string }).error, /already have a build running/);
  await release();

  // Another account: not found.
  const other = await signIn("free-other@example.com", "free");
  const peek = await (await siteRoute()).GET(call(other.cookie, `/api/sites/${site.id}`), ctx(site.id));
  assert.equal(peek.status, 404);
  const steal = await generate(other.cookie, site.id, "overwrite it");
  assert.equal(steal.status, 404);
  assert.equal((await (await siteRoute()).GET(call(null, `/api/sites/${site.id}`), ctx(site.id))).status, 401);

  // Daily AI job cap (8 on Free): the ninth is refused.
  reply = reply2("ok");
  cost = 0;
  const { rateLimit } = await import("@/lib/create/platform/ratelimit");
  void rateLimit;
  let last = 200;
  for (let i = 0; i < 9; i++) last = (await generate(cookie, site.id, `Change number ${i + 1} please`)).status;
  assert.equal(last, 429);
});

test("Plus: stronger model, metered at real cost x1.1 through the credit system and windows; confirmation above the threshold", async () => {
  const { cookie, workspaceId } = await signIn("plus-builder@example.com", "plus");
  const site = await makeSite(cookie, "Plus Site", "landing");
  const { meter } = await import("@/lib/create/platform/compute");
  const { workspaceById } = await import("@/lib/create/platform/workspace");
  reply = reply2("Plus build.");
  cost = 0.05;
  calls = [];
  const events = await ndjson(await generate(cookie, site.id, "Add a pricing table with three tiers"));
  const done = events.find((x) => x.type === "done");
  assert.ok(done, JSON.stringify(events.at(-1)));
  assert.equal(calls[0].model, "google/gemini-3.8-flash");
  assert.equal(calls[0].max_tokens, 22_000);
  assert.deepEqual(calls[0].provider, { allow_fallbacks: true, data_collection: "deny" });
  assert.equal(done!.units, Math.ceil((0.05 * 1.1) / 0.002)); // 28
  const m = await meter((await workspaceById(workspaceId, "plus"))!);
  assert.equal(m.used, 28);
  assert.equal(m.windows?.[0].used, 28);

  // Above the confirmation threshold the job waits for a yes (and shows its estimate).
  process.env.KEPLAR_SITE_CONFIRM_UNITS = "5";
  const need = await generate(cookie, site.id, "Rewrite everything with more detail");
  assert.equal(need.status, 409);
  const needBody = (await need.json()) as { code: string; estimate: { units: number; free: boolean } };
  assert.equal(needBody.code, "confirm");
  assert.ok(needBody.estimate.units > 5);
  const yes = await generate(cookie, site.id, "Rewrite everything with more detail", { confirm: true });
  assert.equal(yes.status, 200);
  await ndjson(yes);
  delete process.env.KEPLAR_SITE_CONFIRM_UNITS;

  // A failed run that the provider billed is still charged; one that cost nothing is not.
  const before = (await meter((await workspaceById(workspaceId, "plus"))!)).used;
  reply = "I cannot do that.";
  cost = 0.01;
  const bad = await ndjson(await generate(cookie, site.id, "Add a blog page"));
  assert.equal(bad.at(-1)?.type, "error");
  const afterBad = (await meter((await workspaceById(workspaceId, "plus"))!)).used;
  assert.ok(afterBad > before, "billed failure is charged");
});

test("cooldown trips from real Create spend, shows the reset time, blocks new jobs, and clears for other users", async () => {
  const { cookie, workspaceId } = await signIn("plus-cooldown@example.com", "plus");
  const other = await signIn("plus-neighbour@example.com", "plus");
  const site = await makeSite(cookie, "Hot Site", "blank");
  reply = reply2("big job");
  cost = 1.0; // charged $1.10 per job: the second one passes Plus's $2/hour
  const first = await ndjson(await generate(cookie, site.id, "Build a detailed site number one"));
  assert.ok(first.some((x) => x.type === "done"));
  const second = await ndjson(await generate(cookie, site.id, "Build a detailed site number two"));
  assert.ok(second.some((x) => x.type === "done"));
  const third = await generate(cookie, site.id, "Build a detailed site number three");
  assert.equal(third.status, 429);
  const body = (await third.json()) as { code: string; error: string; until: string; strikes: number };
  assert.equal(body.code, "cooldown");
  assert.match(body.error, /Keplar usage cooldown/);
  assert.equal(body.strikes, 1);
  const mins = (new Date(body.until).getTime() - Date.now()) / 60_000;
  assert.ok(mins > 29 && mins <= 30.1, `about 30 minutes, got ${mins}`);
  assert.ok(third.headers.get("retry-after"));
  // The shared meter reports it (what the UI countdown reads).
  const { GET: computeGet } = await import("@/app/api/compute/route");
  const meterJson = (await (await computeGet(call(cookie, "/api/compute"))).json()) as { cooldown: { until: string; message: string } | null };
  assert.equal(meterJson.cooldown?.until, body.until);
  assert.equal(workspaceId.length > 0, true);
  // Another account is unaffected.
  const s2 = await makeSite(other.cookie, "Calm", "blank");
  cost = 0.01;
  assert.ok((await ndjson(await generate(other.cookie, s2.id, "Build a calm little site"))).some((x) => x.type === "done"));
});
