import "./setup";
import { signIn, jsonReq, call } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETE, GET, PATCH, POST } from "../src/app/api/templates/route";
import { POST as remixPost } from "../src/app/api/templates/[slug]/remix/route";
import { GET as sitemapGet } from "../src/app/templates-sitemap.xml/route";
import { currentWorkspace } from "../src/lib/create/platform/workspace";
import { addCredit, findPrivate, remixBrief, scrubForRemix, TEMPLATE_LIMITS, validCommunitySlug } from "../src/lib/templates/remix";
import { listGallery, openTemplate, templates } from "../src/lib/templates/store";
import { addVersion, createSite, headFiles, leads, normalizeFiles, saveLead, sites, versions } from "../src/lib/site-builder/store";
import { scanFiles } from "../src/lib/site-builder/safety";
import { lintSite } from "../src/lib/site-builder/lint";
import { buildTemplate, TEMPLATES } from "../src/lib/site-builder/templates";
import { purgeSite, softDeleteSite } from "../src/lib/site-builder/deletion";

const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fig &amp; Oat</title></head><body><header class="site"><a href="index.html">Fig</a></header><main>${body}</main><footer class="site">Made with care</footer></body></html>`;
const CLEAN = page("<h1>Slow bread, warm room</h1><p>We bake every morning and open the doors at seven.</p><div data-k-feature=\"form\" data-k-id=\"contact\" data-k-fields=\"name,email,message\"></div>");
const body = (r: Response) => r.json() as Promise<Record<string, unknown>>;

async function mkSite(cookie: string, name: string, files?: Record<string, string>) {
  const ws = await currentWorkspace(call(cookie, "/api/templates"));
  const made = await createSite(ws, { name, template: "business" });
  if (files) await addVersion(ws, made, normalizeFiles({ "index.html": files["index.html"], "styles.css": files["styles.css"] ?? "body{margin:0}" }, ws.plan).files, { kind: "edit", summary: "test", prompt: "", model: null, units: 0 });
  return made.id;
}
const share = (cookie: string, siteId: string, over: Record<string, unknown> = {}) =>
  POST(jsonReq(cookie, "/api/templates", "POST", { siteId, title: "Bakery starter", description: "A warm one-page bakery site with a contact form and opening hours.", category: "restaurant", consent: true, ...over }));

test("findPrivate: contact details, mailto/tel links, secrets and members-only pages are named; ordinary pages pass", () => {
  assert.deepEqual(findPrivate({ "index.html": CLEAN }), []);
  assert.ok(findPrivate({ "index.html": page("<p>Write to jane@bakery.com</p>") }).includes("an email address"));
  assert.ok(findPrivate({ "index.html": page('<a href="mailto:jane@bakery.com">Mail</a>') }).includes("an email address"));
  assert.ok(findPrivate({ "index.html": page('<a href="tel:+14155550134">Call</a>') }).includes("a phone number"));
  // Embed targets (calendar, chat, map) are cleared from the snapshot by scrubForRemix, so they do not block sharing.
  assert.deepEqual(findPrivate({ "index.html": page('<div data-k-feature="embeds" data-k-id="c" data-k-kind="chat" data-k-phone="+14155550134"></div>') }), []);
  assert.ok(findPrivate({ "index.html": page('<div data-k-feature="members" data-k-id="area" data-k-gate="page"></div>') }).some((x) => /members-only/.test(x)));
  assert.ok(findPrivate({ "index.html": CLEAN }, ["call 415-555-0134"]).includes("a phone number"));
});

test("scrubForRemix: owner images, mailto/tel and embed targets are cleared; the rest is kept; input is not mutated", () => {
  const src = {
    "index.html": page('<img src="https://keplar.one/i/abcdef123456" alt="loaf"><img src="hero.svg" alt=""><a href="mailto:a@b.co">m</a><a href="tel:+1555">t</a><div data-k-feature="embeds" data-k-id="c" data-k-kind="calendar" data-k-src="https://calendly.com/owner/30min" data-k-title="Book"></div><div data-k-feature="form" data-k-id="contact"></div>'),
    "styles.css": ".h{background:url(/i/abcdef123456) center}.k{color:red}",
  };
  const copy = JSON.stringify(src);
  const out = scrubForRemix(src);
  assert.equal(JSON.stringify(src), copy);
  assert.ok(!/\/i\/abcdef/.test(out["index.html"] + out["styles.css"]));
  assert.ok(out["index.html"].includes('src="hero.svg"'));
  assert.ok(!/mailto:|tel:/.test(out["index.html"]));
  assert.ok(!out["index.html"].includes("calendly") && out["index.html"].includes('data-k-title="Book"'));
  assert.ok(out["index.html"].includes('data-k-feature="form"'));
  assert.ok(out["styles.css"].includes(".k{color:red}"));
});

test("addCredit: only the home page, escaped, before the footer closes; remixBrief keeps structure and drops private fields", () => {
  const out = addCredit({ "index.html": CLEAN, "about.html": CLEAN }, { title: 'A "B" <i>', by: "Sam & Co", url: "https://keplar.one/templates/x-abc123" });
  assert.ok(out["index.html"].includes("Based on the “A &quot;B&quot; &lt;i&gt;” template by Sam &amp; Co"));
  assert.ok(out["index.html"].indexOf("k-credit") < out["index.html"].indexOf("</footer>"));
  assert.equal(out["about.html"], CLEAN);
  const b = remixBrief({ name: "Owner Bakery", kind: "restaurant", tone: ["warm"], pages: ["Home"], sections: [], accent: null, mode: "auto", direction: "editorial", motion: "subtle", idea: "my secret idea", content: "private notes", references: "https://x.test", brandNotes: "n", mood: { colors: [], links: ["https://x.test"], notes: "n" }, product: { title: "p" } } as never, { name: "Mine", title: "T", description: "D" }) as unknown as Record<string, unknown>;
  assert.equal(b.name, "Mine");
  for (const k of ["mood", "product"]) assert.equal(k in b, false, k);
  assert.ok(!JSON.stringify(b).includes("secret") && !JSON.stringify(b).includes("private notes") && !JSON.stringify(b).includes("x.test"));
});

test("per-plan limits grow with the plan; slugs validate", () => {
  const ids = ["free", "lite", "plus", "pro", "business"] as const;
  for (let i = 1; i < ids.length; i++) {
    assert.ok(TEMPLATE_LIMITS[ids[i]].shared >= TEMPLATE_LIMITS[ids[i - 1]].shared);
    assert.ok(TEMPLATE_LIMITS[ids[i]].remixesPerDay > TEMPLATE_LIMITS[ids[i - 1]].remixesPerDay);
  }
  assert.equal(validCommunitySlug("bakery-starter-abc123"), true);
  assert.equal(validCommunitySlug("../x"), false);
});

test("first-party starters are verified: they build, normalize on the Free plan, lint clean, pass the safety scan and hold no personal data", async () => {
  for (const t of TEMPLATES.filter((x) => x.id !== "blank")) {
    const files = buildTemplate(t.id, "Your site name");
    const { files: norm } = normalizeFiles(files, "free");
    assert.deepEqual(findPrivate(norm), [], t.id);
    assert.equal(lintSite(norm, { legacy: true }).findings.filter((f) => f.severity === "error").length, 0, `${t.id} lint`);
    assert.notEqual((await scanFiles(norm)).verdict, "block", t.id);
  }
  const gallery = await listGallery();
  const starters = gallery.filter((g) => g.kind === "starter");
  assert.equal(starters.length, 4);
  assert.ok(starters.every((g) => g.slug.startsWith("starter-") && g.credit === null));
  assert.equal(gallery.find((g) => g.slug === "starter-blank"), undefined);
  const opened = await openTemplate("starter-business");
  assert.ok(opened && opened.files["index.html"]);
  assert.equal(await openTemplate("starter-nope"), null);
  assert.equal(await openTemplate("../etc/passwd"), null);
});

test("share: needs sign-in, consent, a built site without personal data; owner-only; per-plan cap; withdraw", async () => {
  const anon = await POST(jsonReq(null, "/api/templates", "POST", { siteId: "x", consent: true }));
  assert.equal(anon.status, 401);
  const owner = await signIn("tpl-owner@example.com", "free");
  const siteId = await mkSite(owner.cookie, "Fig and Oat", { "index.html": CLEAN });
  assert.equal((await share(owner.cookie, siteId, { consent: false })).status, 400);
  assert.equal((await share(owner.cookie, siteId, { title: "x" })).status, 400);
  assert.equal((await share(owner.cookie, siteId, { category: "nope" })).status, 400);
  assert.equal((await share(owner.cookie, "sit_missing")).status, 404);
  const other = await signIn("tpl-other@example.com", "free");
  assert.equal((await share(other.cookie, siteId)).status, 404); // not theirs

  const ws0 = await currentWorkspace(call(owner.cookie, "/api/templates"));
  const dirtyVersion = (await sites().get(ws0.id, siteId))!;
  await addVersion(ws0, dirtyVersion, normalizeFiles({ "index.html": page("<h1>Hello</h1><p>Call 415-555-0134 or jane@bakery.com</p>") }, ws0.plan).files, { kind: "edit", summary: "dirty", prompt: "", model: null, units: 0 });
  const refused = await share(owner.cookie, siteId);
  assert.equal(refused.status, 422);
  assert.match(String((await body(refused)).error), /email address|phone number/);

  await addVersion(ws0, (await sites().get(ws0.id, siteId))!, normalizeFiles({ "index.html": CLEAN }, ws0.plan).files, { kind: "edit", summary: "clean", prompt: "", model: null, units: 0 });
  const ok = await share(owner.cookie, siteId, { credit: "Fig & Oat" });
  assert.equal(ok.status, 201);
  const made = await body(ok);
  assert.equal(made.status, "live");
  assert.match(String(made.url), /\/templates\/bakery-starter-[a-z0-9]{6}$/);
  assert.equal((await share(owner.cookie, siteId)).status, 409); // already shared

  const mine = await body(await GET(call(owner.cookie, "/api/templates")));
  assert.equal((mine.templates as unknown[]).length, 1);
  assert.deepEqual(mine.limits, { shared: 1, used: 1, remixesPerDay: 3 });

  const slug = String(made.slug);
  assert.equal((await DELETE(jsonReq(other.cookie, "/api/templates", "DELETE", { slug }))).status, 404);
  assert.ok(await openTemplate(slug));
  assert.equal((await DELETE(jsonReq(owner.cookie, "/api/templates", "DELETE", { slug }))).status, 200);
  assert.equal(await openTemplate(slug), null);
});

test("per-plan share cap: a Pro account can list ten, the eleventh is refused with an upgrade hint; sharing the same site twice is a 409", async () => {
  const u = await signIn("tpl-cap@example.com", "pro");
  const ids: string[] = [];
  for (let i = 0; i < 11; i++) ids.push(await mkSite(u.cookie, `Cap ${i}`, { "index.html": CLEAN }));
  for (const id of ids.slice(0, 10)) assert.equal((await share(u.cookie, id)).status, 201);
  assert.equal((await share(u.cookie, ids[0])).status, 409);
  const over = await share(u.cookie, ids[10]);
  assert.equal(over.status, 402);
  assert.match(String((await body(over)).error), /10 templates at a time/);
});

test("remix copies markup only: no leads, no owner images, no contact targets; attribution is optional; the source is untouched", async () => {
  const owner = await signIn("tpl-src@example.com", "plus");
  const src = await mkSite(owner.cookie, "Source bakery", {
    "index.html": page('<h1>Slow bread, warm room</h1><p>We bake every morning and open the doors at seven.</p><img src="https://keplar.one/i/zzzzzz999999" alt="loaf"><div data-k-feature="embeds" data-k-id="c" data-k-kind="calendar" data-k-src="https://calendly.com/owner/30min"></div><div data-k-feature="form" data-k-id="contact" data-k-fields="name,email,message"></div>'),
  });
  const wsOwner = await currentWorkspace(call(owner.cookie, "/api/templates"));
  const srcRow = (await sites().get(wsOwner.id, src))!;
  await saveLead(srcRow, "plus", { page: "index.html", fields: { name: "Dana Visitor", email: "dana.visitor@mail.test", message: "secret order" } });
  const pr = await body(await share(owner.cookie, src, { title: "Slow bread bakery", credit: "Source Bakery Co" }));
  const slug = String(pr.slug);
  const row = (await templates().findSystemBy("slug", slug))!;
  assert.ok(!JSON.stringify(row).includes("dana.visitor") && !JSON.stringify(row).includes("calendly") && !JSON.stringify(row).includes("zzzzzz999999"));

  const remixer = await signIn("tpl-remixer@example.com", "free");
  assert.equal((await remixPost(jsonReq(null, `/api/templates/${slug}/remix`, "POST", {}), { params: Promise.resolve({ slug }) })).status, 401);
  assert.equal((await remixPost(jsonReq(remixer.cookie, "/api/templates/nope/remix", "POST", {}), { params: Promise.resolve({ slug: "nope" }) })).status, 404);
  const res = await remixPost(jsonReq(remixer.cookie, `/api/templates/${slug}/remix`, "POST", { name: "My bakery" }), { params: Promise.resolve({ slug }) });
  assert.equal(res.status, 201, await res.clone().text());
  const out = await body(res);
  assert.equal(out.credited, false);
  const wsR = await currentWorkspace(call(remixer.cookie, "/api/templates"));
  const mine = (await sites().list(wsR.id)).find((s) => s.id === (out.site as { id: string }).id)!;
  assert.equal(mine.name, "My bakery");
  assert.equal(mine.workspaceId, wsR.id);
  assert.equal(mine.leadCount, 0);
  assert.deepEqual(mine.remixedFrom, { slug, title: "Slow bread bakery", credited: false });
  assert.equal((await leads().list(wsR.id)).length, 0);
  const files = await headFiles(mine);
  const all = Object.values(files).join("\n");
  assert.ok(all.includes("Slow bread, warm room"));
  assert.ok(!all.includes("zzzzzz999999") && !all.includes("calendly") && !all.includes("Source Bakery Co") && !all.includes("k-credit"));
  assert.ok(all.includes('data-k-feature="form"')); // the form placeholder is kept; it is wired to the NEW site's own inbox at render time
  assert.equal((await versions().list(wsR.id, (v) => v.siteId === mine.id)).length, 1);
  assert.equal((await templates().findSystemBy("slug", slug))!.remixes, 1);
  // The owner's site and its lead are untouched.
  assert.equal((await sites().get(wsOwner.id, src))!.leadCount, 1);
  assert.equal((await leads().list(wsOwner.id)).length, 1);

  // Free allows one site: a second remix is refused with the plan message, and the daily cap (3) then applies.
  const second = await remixPost(jsonReq(remixer.cookie, `/api/templates/${slug}/remix`, "POST", { credit: true }), { params: Promise.resolve({ slug }) });
  assert.equal(second.status, 402);
  const third = await remixPost(jsonReq(remixer.cookie, `/api/templates/${slug}/remix`, "POST", {}), { params: Promise.resolve({ slug }) });
  assert.equal(third.status, 402);
  const fourth = await remixPost(jsonReq(remixer.cookie, `/api/templates/${slug}/remix`, "POST", {}), { params: Promise.resolve({ slug }) });
  assert.equal(fourth.status, 429);
  assert.match(String((await body(fourth)).error), /3 remixes a day/);

  // Credit is the remixer's choice.
  const p2 = await signIn("tpl-remixer2@example.com", "plus");
  const credited = await body(await remixPost(jsonReq(p2.cookie, `/api/templates/${slug}/remix`, "POST", { credit: true }), { params: Promise.resolve({ slug }) }));
  assert.equal(credited.credited, true);
  const ws2 = await currentWorkspace(call(p2.cookie, "/api/templates"));
  const s2 = (await sites().get(ws2.id, (credited.site as { id: string }).id))!;
  const f2 = (await headFiles(s2))["index.html"];
  assert.ok(f2.includes("Based on the “Slow bread bakery” template by Source Bakery Co") && f2.includes(`/templates/${slug}`));

  // Starters remix too.
  const st = await body(await remixPost(jsonReq(p2.cookie, "/api/templates/starter-portfolio/remix", "POST", { name: "Maya" }), { params: Promise.resolve({ slug: "starter-portfolio" }) }));
  assert.equal((st.site as { name: string }).name, "Maya");

  // Gallery + sitemap list it; hiding (admin) and deleting the source remove it.
  assert.ok((await listGallery()).some((g) => g.slug === slug && g.remixes === 2 && g.credit === "Source Bakery Co"));
  const map = await (await sitemapGet()).text();
  assert.ok(map.includes(`/templates/${slug}`) && map.includes("/templates/starter-business") && !map.includes("sit_"));
  assert.equal((await PATCH(jsonReq(owner.cookie, "/api/templates", "PATCH", { slug, status: "hidden" }))).status, 403); // owner is not an admin
  process.env.KEPLAR_ADMIN_EMAILS = "tpl-admin@example.com";
  const admin = await signIn("tpl-admin@example.com", "business");
  const adminWs = await currentWorkspace(call(admin.cookie, "/api/templates"));
  assert.equal(adminWs.admin, true);
  {
    assert.equal((await PATCH(jsonReq(admin.cookie, "/api/templates", "PATCH", { slug, status: "hidden" }))).status, 200);
    assert.equal(await openTemplate(slug), null);
    assert.equal((await remixPost(jsonReq(p2.cookie, `/api/templates/${slug}/remix`, "POST", {}), { params: Promise.resolve({ slug }) })).status, 404);
    assert.equal((await PATCH(jsonReq(admin.cookie, "/api/templates", "PATCH", { slug, status: "live" }))).status, 200);
    assert.ok(await openTemplate(slug));
  }
  delete process.env.KEPLAR_ADMIN_EMAILS;
  await softDeleteSite(wsOwner, srcRow);
  assert.equal(await openTemplate(slug), null, "a deleted source hides its template at once");
  const gone = (await sites().get(wsOwner.id, src))!;
  await purgeSite(gone);
  assert.equal(await templates().findSystemBy("slug", slug), null, "purging the site removes the snapshot");
});

test("gallery surfaces are wired: sitemap in robots, privacy page describes templates, preview route never indexes", async () => {
  const { readFileSync } = await import("node:fs");
  assert.ok(readFileSync("src/app/robots.ts", "utf8").includes("sitemapUrls()"));
  assert.ok((await import("../src/lib/seo/sitemaps")).sitemapUrls().some((u) => u.endsWith("/templates-sitemap.xml")));
  const { privacy } = await import("../src/components/legal/content/privacy");
  const txt = JSON.stringify(privacy);
  assert.match(txt, /Templates \(beta\)/);
  assert.match(txt, /never includes form messages, contacts, bookings, orders, members/);
  const { GET: preview } = await import("../src/app/sites/template/[slug]/[[...path]]/route");
  const ok = await preview(new Request("https://keplar.one/sites/template/starter-business"), { params: Promise.resolve({ slug: "starter-business" }) });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-security-policy") ?? "", /sandbox/);
  assert.match(ok.headers.get("x-robots-tag") ?? "", /noindex/);
  const html = await ok.text();
  assert.match(html, /noindex/);
  assert.ok(!/<script/i.test(html));
  const missing = await preview(new Request("https://keplar.one/sites/template/nope"), { params: Promise.resolve({ slug: "nope" }) });
  assert.equal(missing.status, 404);
  const rep = await preview(new Request("https://keplar.one/sites/template/starter-business/_report"), { params: Promise.resolve({ slug: "starter-business", path: ["_report"] }) });
  assert.equal(rep.status, 303);
  assert.match(rep.headers.get("location") ?? "", /\/templates\/starter-business#report$/);
});
