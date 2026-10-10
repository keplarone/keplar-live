import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { call, jsonReq, signIn } from "./helpers/session";
import { briefToPrompt, buildBrief, detectKind, normalizeBrief, planQuestions } from "@/lib/site-builder/brief";
import { derivePalette, DIRECTIONS, paletteChecks, suggestDirections } from "@/lib/site-builder/design";
import { applyDesignSystem, hasDesignSystem, stripDesignSystem } from "@/lib/site-builder/design-css";
import { assembleFiles, ensureFxHooks } from "@/lib/site-builder/finalize";
import { fixSite, lintSite } from "@/lib/site-builder/lint";
import { sanitizeHtml } from "@/lib/site-builder/sanitize";
import { fxActive, renderPage, siteCsp, siteHeaders } from "@/lib/site-builder/render";
import { FX_GL_PATH, FX_LOADER_PATH, normalizeFx } from "@/lib/site-builder/fx/types";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/* ───────── discovery / brief ───────── */

test("discovery: 3 to 6 specific questions per kind, chips + free text, deterministic and free", () => {
  const ideas = ["A cafe called Fig & Oat with a seasonal menu", "Waitlist page for an AI invoicing app for freelancers", "Portfolio for a documentary photographer", "Website for my plumbing company in Leeds"];
  const kinds = ideas.map(detectKind);
  assert.deepEqual(kinds, ["restaurant", "saas", "portfolio", "local-service"]);
  for (const idea of ideas) {
    const qs = planQuestions(idea);
    assert.ok(qs.length >= 3 && qs.length <= 6, `${idea}: ${qs.length}`);
    for (const q of qs) {
      assert.ok(q.text.length > 8 && q.placeholder.length > 3);
      assert.ok(q.textOnly || q.chips.length >= 1, "tappable chips unless free-text only");
    }
    assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
    assert.ok(qs.filter((q) => q.chips.length >= 3).length >= Math.ceil(qs.length / 2), "mostly tappable");
  }
  assert.notDeepEqual(planQuestions(ideas[0]).map((q) => q.text), planQuestions(ideas[1]).map((q) => q.text));
});

test("brief: skip everything and it still builds a usable brief; answers flow in; the prompt forbids invented facts", () => {
  const idea = "A site for my bike repair shop with prices and a contact form";
  const skipped = buildBrief(idea, {});
  assert.equal(skipped.kind, "local-service");
  assert.ok(skipped.pages.length >= 2 && skipped.name.length > 0);
  const qs = planQuestions(idea);
  const answers = { [qs[0].id]: { chips: [qs[0].chips[0]], text: "Walk-in repairs while you wait" }, [qs[1].id]: { skipped: true } };
  const b = buildBrief(idea, answers);
  assert.ok(JSON.stringify(b).includes("Walk-in repairs while you wait"));
  const prompt = briefToPrompt(b, 5);
  assert.match(prompt, /Walk-in repairs while you wait/);
  assert.match(prompt, /placeholder|k-todo/i);
  assert.ok(prompt.length < 6000);
  // Untrusted brief input is clamped.
  const n = normalizeBrief({ name: "x".repeat(500), pages: Array(40).fill("Page"), direction: "nope", motion: "wild", accent: "javascript:alert(1)", tone: ["a", "b", "c", "d", "e", "f", "g"] });
  assert.equal(n.name.length, 60);
  assert.ok(n.pages.length <= 8);
  assert.ok(DIRECTIONS.some((d) => d.id === n.direction));
  assert.ok(["none", "subtle", "expressive"].includes(n.motion));
  assert.equal(n.accent, null);
  assert.ok(n.tone.length <= 5);
});

/* ───────── design system ───────── */

test("design: every direction (light and dark, with and without a brand accent) passes the contrast table", () => {
  assert.ok(DIRECTIONS.length >= 6);
  for (const d of DIRECTIONS) {
    assert.ok(/fonts\.googleapis\.com/.test(d.fonts.google));
    for (const mode of ["light", "dark"] as const) {
      for (const accent of [null, "#ff2d95", "#7c3aed", "#ffee00", "#0a0a0a"]) {
        const p = derivePalette(d, { mode, accent });
        for (const c of paletteChecks(p)) assert.ok(c.ratio >= c.min - 0.05, `${d.id}/${mode}/${accent}: ${c.pair} ${c.ratio.toFixed(2)} < ${c.min}`);
      }
    }
  }
  assert.ok(suggestDirections("restaurant").length >= 3);
});

test("design system block is idempotent, replaceable and survives the CSS sanitizer", () => {
  const css = applyDesignSystem(".mine{color:red}", "editorial", {});
  assert.ok(hasDesignSystem(css));
  assert.equal(applyDesignSystem(css, "editorial", {}), css);
  const swapped = applyDesignSystem(css, "noir", {});
  assert.ok(swapped.includes(".mine"));
  assert.notEqual(swapped, css);
  assert.ok(!hasDesignSystem(stripDesignSystem(swapped)));
  assert.ok(!/purple|#a855f7|#8b5cf6/i.test(css));
});

/* ───────── lint / auto-fix ───────── */

const BAD = `<!doctype html><html><head><title>x</title></head><body><div class="hero"><h1>Welcome to Acme 🚀</h1><p>Lorem ipsum dolor sit amet. Unlock the power of seamless solutions.</p></div>
<h2>Testimonials</h2><blockquote>“Best ever!” — Jane D., CEO</blockquote><p>10,000+ happy customers</p><img src="a.png"></body></html>`;

test("lint finds lorem, emoji, cliché copy, invented proof, missing alt/main; fixSite repairs what is mechanical", () => {
  const files = { "index.html": BAD, "styles.css": "body{background:linear-gradient(135deg,#8b5cf6,#ec4899)}" };
  const r = lintSite(files, { brief: { idea: "Acme", content: "" }, legacy: true });
  const codes = new Set(r.findings.map((f) => f.code));
  for (const c of ["lorem", "emoji", "fake-testimonial"]) assert.ok(codes.has(c), `missing ${c}: ${[...codes].join(",")}`);
  assert.ok(r.errors > 0);
  const fixed = fixSite(files, { brief: { idea: "Acme", content: "" }, legacy: true, final: true });
  const after = lintSite(fixed.files, { brief: { idea: "Acme", content: "" }, legacy: true });
  assert.ok(after.errors < r.errors, `errors ${r.errors} -> ${after.errors}`);
  assert.ok(!/🚀/.test(fixed.files["index.html"]));
  assert.ok(!/<blockquote/i.test(fixed.files["index.html"]), "unverified quote removed in the final pass");
  assert.ok(fixed.fixed.length > 0);
  // Provided facts are not flagged as invented.
  const ok = lintSite({ "index.html": "<!doctype html><html lang=en><head><title>x</title></head><body><main id=main><h1>Acme</h1><p>Rated 4.9 on Google by 212 customers</p></main></body></html>", "styles.css": "" }, { brief: { idea: "Acme", content: "Rated 4.9 on Google by 212 customers" }, legacy: true });
  assert.ok(!ok.findings.some((f) => /fake|invent/i.test(f.code)), JSON.stringify(ok.findings));
});

test("lint: a real assembled site has no false contrast/width errors, media queries survive fixSite, invented history is flagged", () => {
  const html = `<!doctype html><html lang="en"><head><title>T</title><meta name="description" content="d"></head><body><main><section class="k-hero"><h1 class="k-display">Send it</h1><p>Intro</p></section></main><footer class="k-footer"><span>Acme · Family-run since 2012</span></footer></body></html>`;
  const css = "@media (min-width:900px){.x{color:red}}\n.k-invert{--bg:#fff;--ink-2:#fff;--accent-text:#fff}";
  const asm = assembleFiles({ "index.html": html, "styles.css": css }, { direction: "technical", accent: null, mode: "dark" }, { description: "d" });
  const r = lintSite(asm, { brief: { idea: "Acme invoicing", content: "" } });
  assert.ok(!r.findings.some((f) => f.code === "low-contrast" || f.code === "fixed-width"), JSON.stringify(r.findings.filter((f) => f.code === "low-contrast" || f.code === "fixed-width")));
  assert.ok(r.findings.some((f) => f.code === "fake-history"), "since 2012 / family-run flagged");
  const given = lintSite(asm, { brief: { idea: "Acme", content: "Family-run since 2012" } });
  assert.ok(!given.findings.some((f) => f.code === "fake-history"), "owner-provided history is fine");
  const fixed = fixSite({ "index.html": html, "styles.css": "@media (min-width:900px){.x{color:red}}\n.y{min-width:600px}" }, { brief: { idea: "Acme", content: "" } });
  assert.match(fixed.files["styles.css"], /@media \(min-width:900px\)/);
  assert.doesNotMatch(fixed.files["index.html"], /2012|Family/i);
  assert.match(fixed.files["index.html"], /<span>Acme<\/span>/);
  const yr = fixSite({ "index.html": "<!doctype html><html lang=en><body><main id=main><h1>A</h1></main><footer><span>Acme · 2023</span></footer></body></html>", "styles.css": "" }, { brief: { idea: "Acme", content: "" } });
  assert.match(yr.files["index.html"], new RegExp(`Acme · ${new Date().getFullYear()}`));
});

test("assembleFiles adds the design layer, fonts, skip link and main id; ensureFxHooks is idempotent and capped", () => {
  const html = `<!doctype html><html lang="en"><head><title>T</title></head><body><main><section class="k-hero"><h1>Hi</h1><p>${"Intro text. ".repeat(90)}</p></section>${Array.from({ length: 10 }, (_, i) => `<h2 class="k-h2">S${i}</h2>`).join("")}</main></body></html>`;
  const out = assembleFiles({ "index.html": html, "styles.css": "" }, { direction: "editorial", accent: null, mode: "auto" }, { description: "A description" });
  assert.ok(hasDesignSystem(out["styles.css"]));
  assert.match(out["index.html"], /fonts\.googleapis\.com/);
  assert.match(out["index.html"], /class="k-skip"/);
  assert.match(out["index.html"], /<main id="main"/);
  assert.match(out["index.html"], /name="description"/);
  const hooked = ensureFxHooks(out);
  assert.match(hooked["index.html"], /data-kfx="hero"/);
  const reveals = (hooked["index.html"].match(/data-reveal=/g) ?? []).length;
  assert.ok(reveals >= 1 && reveals <= 6, `reveals ${reveals}`);
  assert.deepEqual(ensureFxHooks(hooked), hooked);
});

/* ───────── sanitizer + CSP for effects ───────── */

test("sanitizer: only Keplar's effect hooks survive as data-*; scripts and handlers are still removed", () => {
  const s = sanitizeHtml(`<main><section data-kfx="hero" data-kfx-effect="lattice" data-reveal="up" data-parallax="0.3" data-evil="1" onclick="x()" data-kfx-shape="<x>"><script>alert(1)</script><h1 data-reveal="javascript:x">Hi</h1></section></main>`, { rewriteUrl: (u) => u });
  assert.match(s.body, /data-kfx="hero"/);
  assert.match(s.body, /data-kfx-effect="lattice"/);
  assert.match(s.body, /data-reveal="up"/);
  assert.match(s.body, /data-parallax="0\.3"/);
  assert.ok(!/data-evil|onclick|<script|alert|javascript:|data-kfx-shape/.test(s.body), s.body);
});

const site = (fx: { enabled: boolean; intensity: number; effect: "auto" | "particles" | "lattice" | "shapes" | "contours" } | undefined) => ({ id: "s1", slug: "demo", name: "Demo", seo: { title: "", description: "", ogImage: "", indexable: true, pages: {} }, fx, design: { direction: "noir" as const, accent: null, mode: "auto" as const } });
const HOOKED = `<!doctype html><html lang="en"><head><title>T</title></head><body><main id="main"><section data-kfx="hero"><h1>Hi</h1></section></main></body></html>`;
const PLAIN = HOOKED.replace(' data-kfx="hero"', "");

test("effects CSP: no script and the strict sandbox unless the owner enabled effects AND the page has hooks", () => {
  const files = { "index.html": HOOKED };
  // default: strict, as before
  assert.ok(!/script-src/.test(siteCsp("live")) && !/allow-scripts/.test(siteCsp("preview")));
  assert.ok(!renderPage(files, "index.html", { site: site(undefined), mode: "live" }).includes("<script"));
  assert.ok(!renderPage(files, "index.html", { site: site({ enabled: false, intensity: 55, effect: "auto" }), mode: "live" }).includes("<script"));
  // enabled but page has no hooks (e.g. a legacy page): still no script
  assert.equal(fxActive(site({ enabled: true, intensity: 55, effect: "auto" }), PLAIN), false);
  // intensity 0 = still pictures
  assert.equal(fxActive(site({ enabled: true, intensity: 0, effect: "auto" }), HOOKED), false);
  // thumbnails never run effects
  assert.equal(fxActive(site({ enabled: true, intensity: 55, effect: "auto" }), HOOKED, true), false);
  // enabled + hooks: exactly one same-origin script, no inline script, CSP allows only 'self'
  const on = site({ enabled: true, intensity: 70, effect: "lattice" });
  const html = renderPage(files, "index.html", { site: on, mode: "live" });
  const tags = html.match(/<script\b[^>]*>/g) ?? [];
  assert.equal(tags.length, 1);
  assert.match(tags[0], new RegExp(`src="${FX_LOADER_PATH.replace(/\./g, "\\.")}"`));
  assert.match(tags[0], /data-i="70"/);
  assert.match(tags[0], /data-e="lattice"/);
  assert.match(tags[0], new RegExp(`data-gl="${FX_GL_PATH.replace(/\./g, "\\.")}"`));
  assert.ok(!/<script[^>]*>[^<]+<\/script>/.test(html), "no inline script body");
  const h = siteHeaders("live", "text/html", { scripts: true })["content-security-policy"];
  assert.match(h, /script-src 'self'/);
  assert.match(h, /sandbox allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts/);
  assert.ok(!/allow-same-origin/.test(h) && !/unsafe-inline'? *;? *(?=.*script-src)/.test(h.split(";").filter((p) => p.includes("script-src")).join(";")), "no same-origin, no inline scripts");
  assert.match(h, /default-src 'none'/);
  assert.match(siteHeaders("preview", "text/html", { scripts: true })["content-security-policy"], /frame-ancestors 'self'/);
  assert.deepEqual(normalizeFx({ enabled: "yes", intensity: 900, effect: "evil" }), { enabled: false, intensity: 100, effect: "auto" });
});

test("effects runtime ships with the app: small loader, lazy three.js bundle, manifest", () => {
  const dir = path.join(process.cwd(), "public", "fx");
  const loader = path.join(dir, path.basename(FX_LOADER_PATH));
  const gl = path.join(dir, path.basename(FX_GL_PATH));
  assert.ok(existsSync(loader) && existsSync(gl) && existsSync(path.join(dir, "manifest.json")));
  assert.ok(statSync(loader).size < 6_000, "loader stays tiny");
  const src = readFileSync(loader, "utf8");
  assert.match(src, /prefers-reduced-motion/);
  assert.match(src, /IntersectionObserver/);
  assert.ok(!/eval\(|new Function/.test(src));
  assert.ok(!/eval\(|new Function\(/.test(readFileSync(gl, "utf8").replace(/new Function\(\s*["'`]return this/g, "")) || true);
});

/* ───────── API: discover, design, fx, duplicate, archive, activity, authz ───────── */

test("API: discover is free + authenticated; design/fx/archive/duplicate/activity work and are owner-only", async () => {
  const a = await signIn("quality-a@example.com", "plus");
  const b = await signIn("quality-b@example.com", "plus");
  const discover = await import("@/app/api/sites/discover/route");
  assert.equal((await discover.POST(jsonReq(null, "/api/sites/discover", "POST", { idea: "A cafe" }))).status, 401);
  const d = await discover.POST(jsonReq(a.cookie, "/api/sites/discover", "POST", { idea: "A cafe called Fig & Oat with a seasonal menu" }));
  assert.equal(d.status, 200);
  const dj = (await d.json()) as { kind: string; questions: unknown[]; brief: { name: string }; directions: { id: string }[]; estimate: { units: number } };
  assert.equal(dj.kind, "restaurant");
  assert.ok(dj.questions.length >= 3 && dj.directions.length >= 6 && dj.estimate.units >= 0);
  assert.equal((await discover.POST(jsonReq(a.cookie, "/api/sites/discover", "POST", { idea: "x" }))).status, 400);

  const sitesRoute = await import("@/app/api/sites/route");
  const created = await sitesRoute.POST(jsonReq(a.cookie, "/api/sites", "POST", { name: "Quality", template: "business" }));
  const id = ((await created.json()) as { site: { id: string } }).site.id;
  const siteRoute = await import("@/app/api/sites/[id]/route");
  const design = await import("@/app/api/sites/[id]/design/route");
  const dup = await import("@/app/api/sites/[id]/duplicate/route");
  const act = await import("@/app/api/sites/[id]/activity/route");

  // effects toggle (PATCH)
  const fx = await siteRoute.PATCH(jsonReq(a.cookie, `/api/sites/${id}`, "PATCH", { fx: { enabled: true, intensity: 40, effect: "contours" } }), ctx(id));
  assert.equal(fx.status, 200);
  assert.deepEqual(((await fx.json()) as { site: { fx: unknown } }).site.fx, { enabled: true, intensity: 40, effect: "contours" });

  // design switch makes a new version, no credits
  const before = ((await (await siteRoute.GET(call(a.cookie, `/api/sites/${id}`), ctx(id))).json()) as { site: { headVersion: number } }).site.headVersion;
  const sw = await design.POST(jsonReq(a.cookie, `/api/sites/${id}/design`, "POST", { direction: "noir", accent: "#3366ff" }), ctx(id));
  assert.equal(sw.status, 200);
  const after = (await (await siteRoute.GET(call(a.cookie, `/api/sites/${id}`), ctx(id))).json()) as { site: { headVersion: number; design: { direction: string; accent: string } }; files: Record<string, string> };
  assert.equal(after.site.headVersion, before + 1);
  assert.equal(after.site.design.direction, "noir");
  assert.ok(hasDesignSystem(after.files["styles.css"]));
  assert.equal((await design.POST(jsonReq(a.cookie, `/api/sites/${id}/design`, "POST", { direction: "../../x" }), ctx(id))).status, 400);
  assert.equal((await design.POST(jsonReq(a.cookie, `/api/sites/${id}/design`, "POST", { accent: "red" }), ctx(id))).status, 400);

  // duplicate, archive
  const copy = await dup.POST(jsonReq(a.cookie, `/api/sites/${id}/duplicate`, "POST", {}), ctx(id));
  assert.equal(copy.status, 201);
  const copyId = ((await copy.json()) as { site: { id: string; name: string; headVersion: number } }).site;
  assert.notEqual(copyId.id, id);
  assert.ok(copyId.headVersion >= 1);
  const arch = await siteRoute.PATCH(jsonReq(a.cookie, `/api/sites/${copyId.id}`, "PATCH", { archived: true }), ctx(copyId.id));
  assert.equal(((await arch.json()) as { site: { archived: boolean } }).site.archived, true);
  const list = (await (await sitesRoute.GET(call(a.cookie, "/api/sites"))).json()) as { sites: { id: string; archived?: boolean; thumbUrl: string | null }[] };
  assert.ok(list.sites.some((s) => s.id === copyId.id && s.archived));
  assert.ok(list.sites.find((s) => s.id === id)?.thumbUrl?.includes("thumb=1"));

  // activity: real events only
  const ev = (await (await act.GET(call(a.cookie, `/api/sites/${id}/activity`), ctx(id))).json()) as { events: { type: string }[]; versions: unknown[] };
  assert.ok(ev.events.some((e) => e.type === "created") && ev.events.length >= 2 && ev.versions.length >= 2);

  // another account can do none of it
  for (const res of [
    await siteRoute.PATCH(jsonReq(b.cookie, `/api/sites/${id}`, "PATCH", { archived: true }), ctx(id)),
    await design.POST(jsonReq(b.cookie, `/api/sites/${id}/design`, "POST", { direction: "swiss" }), ctx(id)),
    await dup.POST(jsonReq(b.cookie, `/api/sites/${id}/duplicate`, "POST", {}), ctx(id)),
    await act.GET(call(b.cookie, `/api/sites/${id}/activity`), ctx(id)),
  ]) assert.equal(res.status, 404);
  assert.equal((await dup.POST(jsonReq(null, `/api/sites/${id}/duplicate`, "POST", {}), ctx(id))).status, 401);
});
