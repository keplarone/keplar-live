import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { collection } from "@/lib/create/platform/store";
import { isDue, isoWeek, periodOf, runJob, setGrowthControls, type GrowthJob, type RunRow } from "@/lib/growth/ops/runner";
import { buildSnapshot, retentionBetween, billedMonthly } from "@/lib/growth/ops/revenue";
import { activeCounts, weeklyCohorts } from "@/lib/growth/ops/retention";
import { disallowed, issuesFor, readPage, runSeoAudit, sampleFor, type Fetcher } from "@/lib/growth/ops/seo-audit";
import { checkTargets, contentHash, nextRow, readableText, type PageFetch } from "@/lib/growth/ops/watch";
import { analyzeAnswer, runVisibility, GEO_PROMPTS, type Engine } from "@/lib/growth/ops/visibility";
import { approvalBlocker, createDraft, parseDraft, transition } from "@/lib/growth/ops/content";
import { PLATFORMS, planFor, recordSubmission, watchTargets } from "@/lib/growth/ops/leaderboards";
import { buildReport } from "@/lib/growth/ops/reports";
import { GROWTH_JOBS } from "@/lib/growth/ops/jobs";

const uniq = () => Math.random().toString(36).slice(2, 8);
const job = (over: Partial<GrowthJob> = {}): GrowthJob => ({ id: `t-${uniq()}`, label: "T", cadence: "daily", description: "", timeoutMs: 2000, run: async () => ({ summary: "done" }), ...over });
const noSleep = async () => {};

/* ─────────────── runner ─────────────── */

test("periods and due days: ISO weeks, Mondays for weekly jobs, the 1st for monthly", () => {
  assert.equal(isoWeek(new Date("2026-10-19T08:00:00Z")), "2026-W43");
  assert.equal(isoWeek(new Date("2027-01-01T08:00:00Z")), "2026-W53");
  assert.equal(periodOf("monthly", new Date("2026-10-19T08:00:00Z")), "2026-10");
  assert.ok(isDue("weekly", new Date("2026-10-19T08:00:00Z")), "2026-10-19 is a Monday");
  assert.ok(!isDue("weekly", new Date("2026-10-20T08:00:00Z")));
  assert.ok(isDue("monthly", new Date("2026-11-01T08:00:00Z")) && !isDue("monthly", new Date("2026-11-02T08:00:00Z")));
});

test("runner: a job runs once per period, even when called in parallel; the run is logged", async () => {
  let n = 0;
  const j = job({ run: async () => { n++; await new Promise((r) => setTimeout(r, 20)); return { summary: "ok", costUsd: 0.01 }; } });
  const now = new Date("2026-10-19T08:19:00Z");
  const out = await Promise.all([runJob(j, { now }), runJob(j, { now }), runJob(j, { now })]);
  assert.equal(n, 1, "ran once");
  assert.equal(out.filter((o) => o.status === "ok").length, 1);
  assert.equal(out.filter((o) => o.status === "already-ran").length, 2);
  const row = await collection<RunRow>("growth_job_runs").get("system", `${j.id}:2026-10-19`);
  assert.equal(row?.status, "ok");
  assert.equal(row?.costUsd, 0.01);
  assert.equal((await runJob(j, { now: new Date("2026-10-20T08:19:00Z") })).status, "ok", "the next day runs again");
});

test("runner: paused (all or one job), missing configuration and not-due days skip without claiming the period", async () => {
  const now = new Date("2026-10-21T08:19:00Z");
  const j = job();
  await setGrowthControls({ pausedJobs: [j.id] }, "t");
  assert.match((await runJob(j, { now })).summary, /paused/);
  await setGrowthControls({ pausedJobs: [], paused: true }, "t");
  assert.match((await runJob(j, { now })).summary, /paused/);
  await setGrowthControls({ paused: false }, "t");
  assert.match((await runJob(job({ requires: () => "No key." }), { now })).summary, /No key/);
  assert.equal((await runJob(job({ cadence: "weekly" }), { now })).summary, "Not due today.", "a Wednesday");
  assert.equal((await runJob(job({ cadence: "weekly" }), { now, force: true })).status, "ok", "Run now ignores the weekday");
  assert.equal((await runJob(j, { now })).status, "ok", "after the pause is lifted the period still runs");
});

test("runner: a thrown error is retried once; a second failure is logged, alerts, and releases the period for a later retry", async () => {
  let calls = 0;
  const flaky = job({ run: async () => { calls++; if (calls === 1) throw new Error("transient"); return { summary: "ok" }; } });
  assert.equal((await runJob(flaky, { now: new Date("2026-10-19T08:00:00Z"), sleep: noSleep })).status, "ok");
  assert.equal(calls, 2);
  let tries = 0;
  const broken = job({ run: async () => { tries++; throw new Error("down"); } });
  const now = new Date("2026-10-19T08:00:00Z");
  const r = await runJob(broken, { now, sleep: noSleep });
  assert.equal(r.status, "failed");
  assert.equal(tries, 2);
  const fails = await collection<RunRow>("growth_job_runs").list("system", (x) => x.job === broken.id && x.status === "failed");
  assert.equal(fails.length, 1);
  assert.equal((await runJob(broken, { now, sleep: noSleep })).status, "failed", "the period was released, so it runs again");
});

test("runner: the timeout aborts the job's signal and is not retried in the same call", async () => {
  let aborted = false, calls = 0;
  const slow = job({ timeoutMs: 30, run: ({ signal }) => { calls++; return new Promise((_, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); })); } });
  const r = await runJob(slow, { now: new Date("2026-10-19T09:00:00Z"), sleep: noSleep });
  assert.equal(r.status, "failed");
  assert.match(r.summary, /timed out/);
  assert.ok(aborted);
  assert.equal(calls, 1);
});

test("jobs: ids are unique, every job has a timeout, the money-spending job is gated by a budget", () => {
  assert.equal(new Set(GROWTH_JOBS.map((j) => j.id)).size, GROWTH_JOBS.length);
  assert.ok(GROWTH_JOBS.every((j) => j.timeoutMs > 0 && j.timeoutMs <= 280_000), "fits in the cron's 300 s");
  const geo = GROWTH_JOBS.find((j) => j.id === "ai-visibility")!;
  const prev = process.env.KEPLAR_GEO_WEEKLY_USD;
  delete process.env.KEPLAR_GEO_WEEKLY_USD;
  assert.ok(geo.requires!(), "skipped without a budget (or a key)");
  if (prev !== undefined) process.env.KEPLAR_GEO_WEEKLY_USD = prev;
  assert.equal(GROWTH_JOBS.at(-1)!.id, "monthly-report", "reports run last");
});

/* ─────────────── revenue ─────────────── */

const ws = (id: string, plan: string, status = "active", extra: Record<string, unknown> = {}) => ({ id, plan, billing: { status, periodEnd: null, cancelAtPeriodEnd: false, lookupKey: null, ...extra } }) as never;

test("revenue: snapshot counts only live paid accounts at the billed price; accounts are hashed", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  const s = buildSnapshot([ws("a", "plus"), ws("b", "pro"), ws("c", "free"), ws("d", "plus", "canceled"), ws("e", "lite", "active", { periodEnd: "2026-10-01T00:00:00Z" }), ws("f", "plus", "active", { cancelAtPeriodEnd: true })], now, (id) => `h_${id}`);
  assert.deepEqual(Object.keys(s.customers).sort(), ["h_a", "h_b", "h_f"]);
  assert.equal(s.mrrUsd, 44.99 * 2 + 99.99);
  assert.equal(s.byPlan.plus.customers, 2);
  assert.equal(s.cancelScheduled, 1);
  assert.equal(billedMonthly(ws("x", "business", "active", { lookupKey: "nope" }), now.getTime()), 0, "an unknown Business tier is not guessed");
});

test("revenue: churn, contraction, expansion, gross and net revenue retention between two snapshots", () => {
  const a = { date: "2026-09-19", customers: { a: { plan: "plus", mrrUsd: 45 }, b: { plan: "pro", mrrUsd: 100 }, c: { plan: "plus", mrrUsd: 45 }, d: { plan: "lite", mrrUsd: 20 } } };
  const b = { date: "2026-10-19", customers: { a: { plan: "pro", mrrUsd: 100 }, b: { plan: "plus", mrrUsd: 45 }, c: { plan: "plus", mrrUsd: 45 }, e: { plan: "plus", mrrUsd: 45 } } };
  const r = retentionBetween(a, b);
  assert.equal(r.startCustomers, 4);
  assert.equal(r.churnedCustomers, 1);
  assert.equal(r.customerChurnRate, 0.25);
  assert.equal(r.startMrrUsd, 210);
  assert.equal(r.churnedMrrUsd, 20);
  assert.equal(r.contractionMrrUsd, 55);
  assert.equal(r.expansionMrrUsd, 55);
  assert.equal(r.newMrrUsd, 45, "new customers are not retention");
  assert.equal(r.grossRevenueRetention, Math.round(((210 - 20 - 55) / 210) * 10_000) / 10_000);
  assert.equal(r.netRevenueRetention, Math.round(((210 - 20) / 210) * 10_000) / 10_000);
  assert.deepEqual([r.upgrades, r.downgrades], [1, 1]);
  assert.equal(retentionBetween({ date: "x", customers: {} }, b).netRevenueRetention, null, "no base, no ratio");
});

/* ─────────────── retention ─────────────── */

test("usage: DAU/WAU/MAU from distinct browsers; weekly cohorts with unfinished weeks as null", () => {
  const now = new Date("2026-10-19T12:00:00Z"); // Monday
  const ask = (vid: string, at: string) => ({ vid, at, event: "ask_started" });
  const rows = [
    ask("a", "2026-10-05T10:00:00Z"), ask("a", "2026-10-13T10:00:00Z"), ask("a", "2026-10-19T10:00:00Z"),
    ask("b", "2026-10-06T10:00:00Z"),
    ask("c", "2026-10-14T10:00:00Z"), ask("c", "2026-10-19T11:00:00Z"),
    { vid: "d", at: "2026-10-19T09:00:00Z", event: "ask_done" },
  ];
  assert.deepEqual(activeCounts(rows, now), { dau: 2, wau: 2, mau: 3, stickiness: Math.round((2 / 3) * 1000) / 1000 });
  const c = weeklyCohorts(rows, now, 3);
  assert.deepEqual(c.map((x) => [x.week, x.size]), [["2026-W41", 2], ["2026-W42", 1]]);
  assert.deepEqual(c[0].retained, [1, 0.5, 0.5, null], "W41: both asked in week 0, a in weeks 1 and 2, week 3 not yet");
  assert.deepEqual(c[1].retained, [1, 1, null, null]);
});

/* ─────────────── SEO audit ─────────────── */

const page = (o: { title?: string; desc?: string; canonical?: string; robots?: string; h1?: number; ld?: string[] } = {}) =>
  `<html><head>${o.title !== undefined ? `<title>${o.title}</title>` : ""}${o.desc !== undefined ? `<meta name="description" content="${o.desc}">` : ""}${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ""}${o.robots ? `<meta name="robots" content="${o.robots}">` : ""}${(o.ld ?? []).map((l) => `<script type="application/ld+json">${l}</script>`).join("")}</head><body>${"<h1>x</h1>".repeat(o.h1 ?? 1)}</body></html>`;

test("seo: page facts and issues (status, noindex, missing tags, canonical elsewhere, bad JSON-LD, duplicate titles, redirect chains)", () => {
  const good = readPage("https://k.one/a", 200, [], page({ title: "A good page title", desc: "A description that is long enough to be useful for search results.", canonical: "https://k.one/a", ld: ['{"@type":"WebPage"}'] }));
  assert.deepEqual(issuesFor([good]), []);
  const bad = readPage("https://k.one/b", 200, ["https://k.one/b2", "https://k.one/b3"], page({ title: "A good page title", robots: "noindex, follow", canonical: "https://k.one/other", h1: 2, ld: ["{oops"] }));
  const codes = issuesFor([good, bad]).filter((i) => i.url === "https://k.one/b").map((i) => i.code).sort();
  assert.deepEqual(codes, ["canonical-elsewhere", "description-missing", "h1-multiple", "jsonld-invalid", "noindex-in-sitemap", "redirect-chain", "title-duplicate"]);
  assert.deepEqual(issuesFor([readPage("https://k.one/c", 404, [], "")]).map((i) => i.code), ["status"]);
});

test("seo: robots rules for * only; sample rotates over the whole sitemap", () => {
  assert.deepEqual(disallowed("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /api/\nDisallow: /dev/*\nAllow: /\n"), ["/api/", "/dev/"]);
  const urls = Array.from({ length: 100 }, (_, i) => `https://k.one/p${String(i).padStart(3, "0")}`);
  const seen = new Set<string>();
  for (let d = 0; d < 3; d++) sampleFor(urls, d, 40).forEach((u) => seen.add(u));
  assert.equal(seen.size, 100, "every URL is checked within 3 days");
});

test("seo: a full audit against a fake site follows sitemap indexes and flags blocked sitemap URLs", async () => {
  const site: Record<string, { status: number; body?: string; location?: string }> = {
    "https://k.one/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private\n" },
    "https://k.one/sitemap.xml": { status: 200, body: "<sitemapindex><sitemap><loc>https://k.one/pages-sitemap.xml</loc></sitemap></sitemapindex>" },
    "https://k.one/pages-sitemap.xml": { status: 200, body: "<urlset><url><loc>https://k.one/a</loc></url><url><loc>https://k.one/private/x</loc></url><url><loc>https://k.one/old</loc></url></urlset>" },
    "https://k.one/a": { status: 200, body: page({ title: "Alpha page", desc: "A description that is long enough to be useful for search results.", canonical: "https://k.one/a" }) },
    "https://k.one/old": { status: 301, location: "/a" },
    "https://k.one/private/x": { status: 200, body: page({ title: "Private", desc: "A description that is long enough to be useful for search results.", canonical: "https://k.one/private/x" }) },
  };
  const f: Fetcher = async (url) => { const r = site[url] ?? { status: 404 }; return { status: r.status, location: r.location ?? null, text: async () => r.body ?? "" }; };
  const r = await runSeoAudit("https://k.one", { now: new Date("2026-10-19T00:00:00Z"), signal: new AbortController().signal, fetcher: f });
  assert.equal(r.sitemapUrls, 3);
  assert.equal(r.checked, 3);
  assert.ok(r.issues.some((i) => i.code === "sitemap-blocked-by-robots" && i.url === "https://k.one/private/x"));
  assert.ok(r.issues.some((i) => i.code === "redirect" && i.url === "https://k.one/old"));
  assert.ok(r.issues.some((i) => i.code === "title-duplicate"), "/old redirects to /a: same title");
});

/* ─────────────── page watch ─────────────── */

test("watch: readable text and a hash that ignores dates and build ids; a change is flagged for review", () => {
  const t = readableText("<html><script>var x=1</script><style>.a{}</style><p>Plus is $20&nbsp;a month</p></html>");
  assert.equal(t, "Plus is $20 a month");
  assert.equal(contentHash("Updated 2026-10-19 build 9f8e7d6c5b4a3f2e"), contentHash("Updated 2026-10-26 build 0a1b2c3d4e5f6a7b"));
  assert.notEqual(contentHash("Plus is $20 a month"), contentHash("Plus is $25 a month"));
  const target = { id: "c:x:pricing", group: "competitor" as const, owner: "X", kind: "pricing", url: "https://x.example/pricing" };
  const first = nextRow(null, target, "2026-10-12T00:00:00Z", { status: 200, text: "Plus is $20" });
  assert.equal(first.changedAt, null, "the first read is a baseline, not a change");
  const same = nextRow(first, target, "2026-10-19T00:00:00Z", { status: 200, text: "Plus is $20" });
  assert.equal(same.changedAt, null);
  const changed = nextRow(same, target, "2026-10-26T00:00:00Z", { status: 200, text: "Plus is $25" });
  assert.equal(changed.changedAt, "2026-10-26T00:00:00Z");
  assert.equal(changed.history.length, 2);
  const failed = nextRow(changed, target, "2026-11-02T00:00:00Z", { status: 503 });
  assert.equal(failed.hash, changed.hash, "a failed read keeps the last good hash");
});

test("watch: robots.txt is honoured (a disallowed page is never fetched), one robots read per site", async () => {
  const fetched: string[] = [];
  const f: PageFetch = async (url) => { fetched.push(url); return url.endsWith("/robots.txt") ? { status: 200, text: "User-agent: *\nDisallow: /pricing\n" } : { status: 200, text: "<p>Release notes</p>" }; };
  const id = uniq();
  const r = await checkTargets([
    { id: `w:${id}:1`, group: "competitor", owner: "X", kind: "pricing", url: "https://x.example/pricing" },
    { id: `w:${id}:2`, group: "competitor", owner: "X", kind: "changelog", url: "https://x.example/changelog" },
  ], { signal: new AbortController().signal, now: new Date(), fetchPage: f });
  assert.deepEqual(fetched, ["https://x.example/robots.txt", "https://x.example/changelog"]);
  assert.equal(r.disallowed, 1);
  assert.equal(r.checked, 2);
});

/* ─────────────── AI visibility ─────────────── */

test("visibility: mentions, keplar.one citations and competitors are read from the answer", () => {
  const r = analyzeAnswer("Popular picks: ChatGPT, Claude and Perplexity. Keplar One asks several models at once.", ["https://keplar.one/compare", "https://www.perplexity.ai/", "not a url"]);
  assert.deepEqual([r.mentioned, r.cited, r.citations], [true, true, 3]);
  assert.deepEqual(r.citedUrls, ["https://keplar.one/compare"]);
  assert.deepEqual(r.competitors, ["ChatGPT", "Claude", "Perplexity"]);
  assert.equal(analyzeAnswer("Kepler's laws of planetary motion.", []).mentioned, false, "Kepler is not Keplar");
});

test("visibility: stops before the budget, never asks the same prompt twice in a week", async () => {
  let asked = 0;
  const engine: Engine = { name: "fake", perQueryUsd: 0.01, ask: async () => { asked++; return { text: "Keplar One", citations: [], costUsd: 0.01 }; } };
  const week = `2099-W${uniq()}`;
  const r = await runVisibility({ week, signal: new AbortController().signal, budgetUsd: 0.05, engine, now: new Date() });
  assert.ok(r.stoppedForBudget);
  assert.equal(asked, 4, "worst case reserved before each query: 0.02 each, stops before crossing $0.05");
  const again = await runVisibility({ week, signal: new AbortController().signal, budgetUsd: 1, engine, now: new Date() });
  assert.equal(again.asked, GEO_PROMPTS.length - 4, "only the prompts not yet asked this week");
});

/* ─────────────── content ─────────────── */

test("content: drafts are validated; approval needs a reviewer other than the author and a source on every claim", async () => {
  assert.throws(() => parseDraft({ channel: "myspace", title: "t", body: "b" }), /channel/);
  const d = parseDraft({ channel: "blog", title: " T ", body: "B", claims: [{ text: "Keplar asks 3 models", source: "javascript:alert(1)" }, { text: "" }] });
  assert.deepEqual(d.claims, [{ text: "Keplar asks 3 models", source: null }]);
  assert.match(approvalBlocker({ status: "in_review", claims: d.claims, author: "a@x" }, "b@x")!, /no source/);
  assert.match(approvalBlocker({ status: "in_review", claims: [], author: "a@x" }, "a@x")!, /author/);
  const item = await createDraft({ channel: "x", title: "Launch", body: "Text", claims: [{ text: "Fact", source: "https://keplar.one/docs" }] }, "a@x");
  await assert.rejects(() => transition(item.id, "approved", "b@x"), /Can't move from draft/);
  await transition(item.id, "in_review", "a@x");
  await assert.rejects(() => transition(item.id, "approved", "a@x"), /author/);
  const ok = await transition(item.id, "approved", "b@x");
  assert.equal(ok.approvedBy, "b@x");
  await assert.rejects(() => transition(item.id, "published", "b@x"), /URL/);
  const pub = await transition(item.id, "published", "b@x", { publishedUrl: "https://x.com/keplar/status/1" });
  assert.equal(pub.history.map((h) => h.to).join(">"), "draft>in_review>approved>published");
});

/* ─────────────── leaderboards ─────────────── */

test("leaderboards: model-only boards are not applicable, traffic rankings are automatic, the rest are owner tasks with blockers", () => {
  assert.ok(PLATFORMS.length >= 10);
  const plan = (id: string) => planFor(PLATFORMS.find((p) => p.id === id)!);
  assert.equal(plan("artificial-analysis").route, "not-applicable");
  assert.equal(plan("arena").route, "not-applicable");
  assert.equal(plan("similarweb").route, "automatic");
  const g2 = plan("g2-ai-chatbots");
  assert.equal(g2.route, "owner-task");
  assert.ok(g2.blockers.includes("account"));
  assert.ok(plan("futurepedia").blockers.includes("payment"));
  assert.ok(PLATFORMS.every((p) => p.sources.length > 0), "every platform cites where its facts came from");
  const targets = watchTargets();
  assert.ok(targets.some((t) => t.group === "competitor") && targets.some((t) => t.group === "leaderboard"));
  assert.ok(!targets.some((t) => t.id.startsWith("l:arena")), "not-applicable boards aren't watched");
  assert.equal(new Set(targets.map((t) => t.id)).size, targets.length);
});

test("submissions: one row per platform, no double submission, rejection needs the reason, listing needs the URL", async () => {
  await assert.rejects(() => recordSubmission("arena", "submitted", "a@x"), /doesn't list apps/);
  await recordSubmission("saashub", "submitted", "a@x");
  await assert.rejects(() => recordSubmission("saashub", "submitted", "a@x"), /Already submitted/);
  await assert.rejects(() => recordSubmission("saashub", "rejected", "a@x"), /why/);
  await assert.rejects(() => recordSubmission("saashub", "listed", "a@x"), /URL/);
  const s = await recordSubmission("saashub", "listed", "a@x", { listingUrl: "https://www.saashub.com/keplar-one" });
  assert.equal(s.listingUrl, "https://www.saashub.com/keplar-one");
});

/* ─────────────── reports ─────────────── */

test("reports: facts carry their source, unavailable data is null (never a guess), changes are computed against the previous report", () => {
  const base = { mrrNow: { mrrUsd: 100, customers: 2 }, retention: null, active: { dau: 1, wau: 5, mau: 9 }, seo: null, watchChanged: [], geo: null, jobs: { ok: 3, failed: 0, skipped: 1 }, previous: null };
  const w1 = buildReport("weekly", "2026-W42", new Date("2026-10-12T00:00:00Z"), base);
  assert.ok(w1.facts.every((f) => f.source));
  assert.equal(w1.facts.find((f) => f.label.startsWith("Net revenue"))!.value, null);
  assert.ok(w1.attention.some((a) => /visibility wasn't measured/.test(a)));
  const w2 = buildReport("weekly", "2026-W43", new Date("2026-10-19T00:00:00Z"), { ...base, mrrNow: { mrrUsd: 145, customers: 3 }, previous: w1 });
  const mrrChange = w2.changes.find((c) => c.label.startsWith("MRR"));
  assert.equal(mrrChange?.value, "+45");
  assert.equal(mrrChange?.source, "computed");
});

test("html handling: end tags with whitespace still end the element; entities are decoded once", () => {
  assert.equal(readableText("<p>Price</p><script>var secret = 1</script ><style>.a{}</style\n><noscript>x</noscript foo><p>$20</p>"), "Price $20");
  const p = readPage("https://k.one/x", 200, [], '<title>Tom &amp;lt;b&amp;gt; &amp; Jerry</title><script type="application/ld+json">{"a":1}</script ><h1>x</h1>');
  assert.equal(p.title, "Tom &lt;b&gt; & Jerry", "&amp;lt; is the text &lt;, not a tag");
  assert.equal(p.jsonLdBlocks, 1);
  assert.equal(p.jsonLdInvalid, 0);
});
