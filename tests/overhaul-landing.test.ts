import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { CHAPTERS, ALL_FEATURES } from "../src/lib/features";
import { DEMO_DAILY_LIMIT, DEMO_BURST_PER_MIN, demoCheck, demoDay } from "../src/lib/demo-limits";
import { SHOWCASE, SHOWCASE_DISCLOSURE, showcaseBySlug } from "../src/lib/create/showcase/data";
import { renderShowcase } from "../src/lib/create/showcase/render";
import { surpriseBrief } from "../src/lib/create/surprise-brief";
import { applyRevision, isRevision, theaterFromTranscript } from "../src/lib/create/voice-live";
import { sitemapPaths } from "../src/app/sitemap";
import { primaryNav, footerNav } from "../src/lib/site";
import { RESERVED_SLUGS } from "../src/lib/site-builder/store";

const page = (route: string) => {
  // business.keplar.one is served by this same app: its "/" is the storefront at /biz (src/proxy.ts, src/lib/business-site.ts).
  const biz = /^https:\/\/business\.keplar\.one(\/[^#?]*)?/.exec(route);
  if (biz) return page(`/biz${biz[1] && biz[1] !== "/" ? biz[1] : ""}`.replace(/^\/biz$/, "/biz/"));
  const p = route.split("#")[0].split("?")[0];
  if (p === "/") return "src/app/(chat)/page.tsx";
  if (p === "/overview") return "src/app/(marketing)/overview/page.tsx";
  if (p === "/biz/") return existsSync("src/app/(business)/biz/page.tsx") ? "src/app/(business)/biz/page.tsx" : null;
  for (const base of [`src/app/(marketing)${p}/page.tsx`, `src/app${p}/page.tsx`]) if (existsSync(base)) return base;
  return null;
};

test("features: seven chapters in the landing order, unique ids, every live/beta feature links to a real page", () => {
  assert.deepEqual(CHAPTERS.map((c) => c.id), ["ask", "understand", "create", "together", "ship", "platform", "trust"]);
  assert.equal(new Set(ALL_FEATURES.map((f) => f.id)).size, ALL_FEATURES.length);
  for (const f of ALL_FEATURES) {
    assert.ok(f.line.length > 10 && f.line.length < 160, `${f.id}: one crisp line`);
    if (f.status !== "soon") assert.ok(page(f.href), `${f.id} -> ${f.href} has a page`);
  }
  for (const id of ["voice-create", "showcase", "surprise", "versions", "community", "collab", "critic", "publish", "domains", "api", "embed", "teams", "referrals", "security", "changelog", "roadmap"]) {
    assert.ok(ALL_FEATURES.some((f) => f.id === id), `${id} is listed`);
  }
});

test("features: no certification or invented proof anywhere in the registry or the overview", () => {
  const text = [JSON.stringify(CHAPTERS), readFileSync("src/components/marketing/CalmOverview.tsx", "utf8"), readFileSync("src/lib/features.ts", "utf8")].join(" ");
  assert.doesNotMatch(text, /SOC ?2|ISO ?27001|HIPAA|GDPR[- ]certified|trusted by|\d[\d,]* (users|customers|teams)\b|supercharge|unlock|seamless|revolutioni[sz]e|powered by AI/i);
  assert.match(readFileSync("src/lib/i18n/messages/common/en.ts", "utf8"), /credit: "Hassen and Hussain Keder"/);
  for (const f of readdirSync("src/lib/i18n/messages/common")) { const c = readFileSync(`src/lib/i18n/messages/common/${f}`, "utf8"); const credit = /"?credit"?: "([^"]*)"/.exec(c)?.[1] ?? ""; assert.match(credit, /Hassen/, f); assert.match(credit, /Hussain Keder/, f); assert.doesNotMatch(credit, /Keplar|\d/, f); }
});

test("overview is a calm page; the chat at / is the way in", () => {
  const overview = readFileSync("src/components/marketing/CalmOverview.tsx", "utf8");
  assert.match(overview, /Several models\. One answer\./);
  assert.match(overview, /href="\/"/);
  assert.doesNotMatch(overview, /SkyHome|MonolithHome|data-chapter|OpenAI|Anthropic|Claude|Gemini/);
  assert.match(readFileSync("src/lib/narrative.ts", "utf8"), /primary: "Ask Keplar anything"/);
  assert.match(readFileSync("src/app/(chat)/page.tsx", "utf8"), /ChatHome/);
  assert.match(readFileSync("src/lib/i18n/messages/marketing/en.ts", "utf8"), /closeCta: "Ask Keplar anything"/);
});

test("nav, footer and sitemap reach the new pages", () => {
  const nav = primaryNav.flatMap((l) => [l.href, ...(l.children ?? []).map((c) => c.href)]);
  const foot = footerNav.flatMap((g) => g.links.map((l) => l.href));
  for (const h of ["/features", "/showcase", "/roadmap", "/templates", "/developers", "/changelog"]) {
    assert.ok(nav.includes(h) || foot.includes(h), `${h} linked`);
    assert.ok(foot.includes(h), `${h} in footer`);
  }
  for (const h of ["/features", "/showcase", "/roadmap", ...SHOWCASE.map((i) => `/showcase/${i.slug}`)]) assert.ok(sitemapPaths.includes(h), `${h} in sitemap`);
  assert.ok(RESERVED_SLUGS.has("showcase"), "a user site cannot shadow /sites/showcase");
});

test("demo limits: daily cap, burst cap, new day resets", () => {
  const t0 = Date.parse("2026-10-06T12:00:00Z");
  let led: { day: string; used: number; recent: number[] } | null = null;
  for (let i = 0; i < DEMO_BURST_PER_MIN; i++) { const r = demoCheck(led, t0 + i); assert.ok(r.ok); led = r.ok ? r.next : led; }
  const burst = demoCheck(led, t0 + 10);
  assert.equal(burst.ok, false);
  assert.equal(!burst.ok && burst.reason, "burst");
  let t = t0 + 61_000;
  while (led!.used < DEMO_DAILY_LIMIT) { const r = demoCheck(led, t); assert.ok(r.ok); led = r.ok ? r.next : led; t += 61_000; }
  const day = demoCheck(led, t);
  assert.equal(!day.ok && day.reason, "daily");
  const tomorrow = demoCheck(led, t0 + 86_400_000);
  assert.ok(tomorrow.ok && tomorrow.left === DEMO_DAILY_LIMIT - 1);
  assert.equal(demoDay(new Date(t0)), "2026-10-06");
});

test("showcase: varied, labeled as demos, static HTML with no scripts", () => {
  assert.ok(SHOWCASE.length >= 6);
  assert.ok(new Set(SHOWCASE.map((i) => i.style)).size >= 6, "varied styles");
  assert.ok(new Set(SHOWCASE.map((i) => i.industry)).size >= 6, "varied industries");
  assert.ok(new Set(SHOWCASE.map((i) => i.complexity)).size === 3, "varied complexity");
  assert.match(SHOWCASE_DISCLOSURE, /Not customer sites/);
  for (const it of SHOWCASE) {
    assert.equal(showcaseBySlug(it.slug), it);
    const html = renderShowcase(it);
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("Not customer sites"), `${it.slug} carries the disclosure`);
    assert.doesNotMatch(html, /<script|\son[a-z]+=|javascript:/i);
    assert.doesNotMatch(html, /linear-gradient|radial-gradient|backdrop-filter|#8b5cf6|#7c3aed|#a855f7/i, `${it.slug}: no AI-glow tells`);
    assert.match(html, /<h1/);
    assert.match(html, /name="robots" content="noindex"/);
  }
});

test("surprise me and voice live: specific briefs, revisions replace the abandoned brief", () => {
  const seq = [0.1, 0.5, 0.9, 0.3, 0.7];
  let k = 0;
  const b = surpriseBrief(() => seq[k++ % seq.length]);
  assert.ok(b.prompt.length > 120 && b.label && b.style);
  assert.ok(isRevision("actually make it a bookshop"));
  const r = applyRevision("A menu for a wine bar with tastings, actually make it a bookshop with readings and staff picks");
  assert.equal(r.revised, true);
  assert.match(r.text, /bookshop/);
  assert.doesNotMatch(r.text, /wine bar/);
  const f = theaterFromTranscript("A booking app for a sailing school with courses and a weather board", { tick: 3 });
  assert.ok(f.files.length >= 3 && f.terminal.length >= 2);
  assert.match(f.previewHtml, /not the final build/i);
});
