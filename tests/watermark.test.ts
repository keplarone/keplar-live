import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { updateWorkspace } from "@/lib/accounts/workspaces";
import { call, jsonReq, signIn } from "./helpers/session";
import { renderPage } from "@/lib/site-builder/render";
import { footerStrip, injectWatermark, watermarkFiles, watermarkRequired } from "@/lib/site-builder/watermark";

const site = { id: "site_wm", slug: "wm-demo", name: "WM", seo: { title: "", description: "", ogImage: "", indexable: false } } as never;
const PAGE = (extraHead = "", bodyAttrs = "") => `<!doctype html><html><head><title>Hi</title>${extraHead}</head><body${bodyAttrs}><header><nav><a href="index.html">Home</a></nav></header><main><h1>Hello</h1></main><footer><p>Mine</p></footer></body></html>`;
const wm = (html: string) => (html.match(/data-keplar-watermark/g) ?? []).length;

/* ───────── plan -> watermark decision ───────── */

test("watermark decision: Free and Lite show it; Plus, Pro, Business and Admin never do; unknown fails closed", () => {
  assert.equal(watermarkRequired("free"), true);
  assert.equal(watermarkRequired("lite"), true);
  for (const p of ["plus", "pro", "business"]) assert.equal(watermarkRequired(p), false, p);
  for (const p of [undefined, null, "", "enterprise", "PLUS"]) assert.equal(watermarkRequired(p as never), true, String(p));
});

/* ───────── render: footer placement ───────── */

test("render: Free live page ends with the watermark strip after ALL content, in normal flow, linking to keplar.one", () => {
  const html = renderPage({ "index.html": PAGE() }, "index.html", { site, mode: "live", plan: "free" });
  assert.equal(wm(html), 1);
  const iMain = html.indexOf("</main>");
  const iUserFooter = html.indexOf("<footer>");
  const iWm = html.indexOf('id="k-wm"');
  assert.ok(iWm > iUserFooter && iWm > iMain, "after the user's own content");
  // it is the last element in <body>: nothing but the closing tags follows it
  assert.match(html, /<\/div>\s*<\/body>\s*<\/html>\s*$/);
  const strip = html.slice(iWm, html.indexOf("</div>", iWm));
  assert.match(strip, /href="https:\/\/keplar\.one"/);
  assert.match(strip, /Made with Keplar/);
  assert.doesNotMatch(strip, /position:\s*fixed|position:\s*absolute|position:\s*sticky/);
  assert.match(strip, /position:\s*static !important/);
  assert.match(strip, /display:\s*block !important/);
  assert.match(html, /\/s\/wm-demo\/_report/, "published sites keep the abuse link");
});

test("render: Free and Lite show it in the preview too (no abuse link there); Plus and above show none anywhere", () => {
  const files = { "index.html": PAGE() };
  for (const plan of ["free", "lite"] as const) {
    const pv = renderPage(files, "index.html", { site, mode: "preview", version: 1, token: "t", plan });
    assert.equal(wm(pv), 1, `preview ${plan}`);
    assert.doesNotMatch(pv, /_report/);
    assert.equal(wm(renderPage(files, "index.html", { site, mode: "live", plan })), 1, `live ${plan}`);
  }
  for (const plan of ["plus", "pro", "business"] as const) {
    for (const mode of ["preview", "live"] as const) {
      const html = renderPage(files, "index.html", { site, mode, version: 1, token: "t", plan });
      assert.equal(wm(html), 0, `${plan} ${mode}`);
      assert.doesNotMatch(html, /Made with Keplar|keplar\.one|k-wm|kwm/);
    }
    // a published paid site keeps only the neutral abuse link, with no Keplar branding
    const live = renderPage(files, "index.html", { site, mode: "live", plan });
    assert.match(live, /Report abuse/);
  }
  // no plan given -> Free (fail closed)
  assert.equal(wm(renderPage(files, "index.html", { site, mode: "live" })), 1);
});

test("render: model/site code cannot add, move or hide it on Free (injected after sanitized content, hardened against page CSS)", () => {
  const hostile = `<style>div,a,footer,body>*:last-child,#k-wm,[data-keplar-watermark]{display:none!important;visibility:hidden!important;opacity:0!important;position:fixed!important}html,body{display:none!important;height:0!important;overflow:hidden!important}</style>`;
  // body markup that tries to close the document early and fake/pre-empt the strip
  const page = `<!doctype html><html><head>${hostile}</head><body style="display:none !important"><div id="k-wm" data-keplar-watermark="1"></div></main></body></html><p>after</p></body></html></html></body></html></html>`;
  const html = renderPage({ "index.html": page, "x.css": "body{display:none}" }, "index.html", { site, mode: "live", plan: "free" });
  // a lookalike the user wrote is just user content; the real strip is Keplar's and comes last
  const real = html.lastIndexOf('id="k-wm"');
  assert.match(html.slice(real), /href="https:\/\/keplar\.one"/);
  assert.match(html, /\s*<\/body>\s*<\/html>\s*$/);
  // inline important beats every author rule; the guard layer comes first in <head>, before the user's styles
  assert.ok(html.indexOf("@layer kwm") > 0 && html.indexOf("@layer kwm") < html.indexOf("display:none!important;visibility"), "guard is the first stylesheet");
  assert.match(html, /@layer kwm\{[^}]*visibility:visible!important/);
  assert.match(html, /body\{display:block!important\}/, "a body that hides itself is forced visible");
  assert.doesNotMatch(html.match(/<body[^>]*>/)![0], /important/, "!important removed from <body style> so the guard layer wins");
  // Paid pages are not touched by the guard at all
  const paid = renderPage({ "index.html": PAGE() }, "index.html", { site, mode: "live", plan: "plus" });
  assert.doesNotMatch(paid, /kwm|data-keplar/);
});

test("render: a normal flex-column body is not forced to display:block", () => {
  const html = renderPage({ "index.html": PAGE("<style>body{display:flex;flex-direction:column;min-height:100vh}</style>") }, "index.html", { site, mode: "live", plan: "free" });
  assert.doesNotMatch(html, /body\{display:block!important\}/);
  assert.match(html, /margin:\s*auto 0px 0px 0px !important|margin:\s*auto 0 0 0 !important/, "sticks to the bottom of a short page");
});

/* ───────── ZIP export content ───────── */

test("zip files: Free/Lite get the strip in every page (once); Plus+ are untouched", () => {
  const files = { "index.html": PAGE(), "about.html": PAGE(), "styles.css": "body{}" };
  for (const plan of ["free", "lite"]) {
    const out = watermarkFiles(files, plan);
    assert.equal(wm(out["index.html"]), 1);
    assert.equal(wm(out["about.html"]), 1);
    assert.equal(out["styles.css"], "body{}");
    assert.match(out["index.html"], /Made with Keplar<\/a><\/div>\s*<\/body>/);
    assert.equal(injectWatermark(out["index.html"]), out["index.html"], "idempotent");
  }
  for (const plan of ["plus", "pro", "business"]) assert.deepEqual(watermarkFiles(files, plan), files);
  assert.equal(footerStrip({ watermark: false, reportHref: null }), "");
});

/* ───────── end to end: serve-time plan, upgrade/downgrade, preview, ZIP ───────── */

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

test("end to end: every page, preview, ZIP and 404 follow the owner's CURRENT plan with no stale cache", async () => {
  const { cookie, workspaceId } = await signIn("wm-owner@example.com", "free");
  const created = await (await import("@/app/api/sites/route")).POST(jsonReq(cookie, "/api/sites", "POST", { name: "Watermark Bikes", template: "business" }));
  assert.equal(created.status, 201);
  const s = ((await created.json()) as { site: { id: string; slug: string } }).site;
  const detail = await (await (await import("@/app/api/sites/[id]/route")).GET(call(cookie, `/api/sites/${s.id}`), ctx(s.id))).json() as { pages: string[]; previewToken: string };
  const pub = await (await import("@/app/api/sites/[id]/publish/route")).POST(jsonReq(cookie, `/api/sites/${s.id}/publish`, "POST"), ctx(s.id));
  assert.equal(pub.status, 200, await pub.clone().text());

  const live = await import("@/app/s/[slug]/[[...path]]/route");
  const draft = await import("@/app/sites/draft/[siteId]/[version]/[[...path]]/route");
  const exp = await import("@/app/api/sites/[id]/export/route");
  const htmlPages = detail.pages.filter((p) => p.endsWith(".html") && p !== "404.html");
  assert.ok(htmlPages.length >= 2, "multi-page fixture");

  const liveGet = async (file: string) => {
    const path = file === "index.html" ? undefined : [file.replace(/\.html$/, "")];
    const r = await live.GET(call(null, `/s/${s.slug}${path ? "/" + path[0] : ""}`), { params: Promise.resolve({ slug: s.slug, path }) });
    assert.equal(r.status, 200, file);
    assert.equal(r.headers.get("cache-control"), "no-store", "plan-dependent HTML is never CDN/browser cached");
    return r.text();
  };
  const previewGet = async (file: string) => {
    const r = await draft.GET(call(null, `/sites/draft/${s.id}/1/${file}?t=${detail.previewToken}`), { params: Promise.resolve({ siteId: s.id, version: "1", path: [file] }) });
    assert.equal(r.status, 200);
    return r.text();
  };
  const zipText = async () => {
    const r = await exp.GET(call(cookie, `/api/sites/${s.id}/export`), ctx(s.id));
    assert.equal(r.status, 200);
    return Buffer.from(await r.arrayBuffer()).toString("latin1"); // stored (uncompressed) entries
  };

  // Free: watermark on every published page, the preview and every HTML file in the ZIP.
  for (const f of htmlPages) assert.equal(wm(await liveGet(f)), 1, `free live ${f}`);
  for (const f of htmlPages) assert.equal(wm(await previewGet(f)), 1, `free preview ${f}`);
  const freeZip = await zipText();
  assert.ok((freeZip.match(/data-keplar-watermark/g) ?? []).length >= htmlPages.length, "every page in the ZIP");

  // Upgrade: gone at once, everywhere.
  await updateWorkspace(workspaceId, { plan: "plus" });
  for (const f of htmlPages) assert.equal(wm(await liveGet(f)), 0, `plus live ${f}`);
  for (const f of htmlPages) assert.equal(wm(await previewGet(f)), 0, `plus preview ${f}`);
  assert.doesNotMatch(await zipText(), /data-keplar-watermark|Made with Keplar/);
  for (const plan of ["pro", "business"] as const) {
    await updateWorkspace(workspaceId, { plan });
    assert.equal(wm(await liveGet("index.html")), 0, plan);
  }

  // Lite keeps it (only Plus and above remove it).
  await updateWorkspace(workspaceId, { plan: "lite" });
  assert.equal(wm(await liveGet("index.html")), 1, "lite live");

  // Downgrade to Free: back at once.
  await updateWorkspace(workspaceId, { plan: "plus" });
  assert.equal(wm(await liveGet("index.html")), 0);
  await updateWorkspace(workspaceId, { plan: "free" });
  for (const f of htmlPages) assert.equal(wm(await liveGet(f)), 1, `downgraded live ${f}`);
  assert.equal(wm(await previewGet(htmlPages[0])), 1);

  // The site's own 404 page carries it on Free, and not on Plus.
  const notFound = async () => live.GET(call(null, `/s/${s.slug}/does-not-exist`), { params: Promise.resolve({ slug: s.slug, path: ["does-not-exist"] }) });
  const nf = await notFound();
  assert.equal(nf.status, 404);
  const nfHtml = await nf.text();
  if (detail.pages.includes("404.html")) {
    assert.equal(wm(nfHtml), 1, "404.html on Free");
    await updateWorkspace(workspaceId, { plan: "plus" });
    assert.equal(wm(await (await notFound()).text()), 0, "404.html on Plus");
  }
});
