import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, TOOLS_HUB, TOOL_RUN_LIMITS, toolBySlug, toolPath, toolPaths } from "../src/lib/free-tools/registry";
import { buildPrompt, validateInput } from "../src/lib/free-tools/prompts";
import { formatCitation, parseAuthors, plainReference } from "../src/lib/free-tools/cite";
import { buildPlan, parseTopics } from "../src/lib/free-tools/plan";
import { modelRows } from "../src/lib/free-tools/explorer";
import { CLUSTERS } from "../src/lib/seo/clusters";
import { hasTitle } from "../src/lib/seo/titles";
import { sitemapPaths } from "../src/app/sitemap";
import { lastmodFor } from "../src/lib/content/lastmod";
import { QUALITY } from "../src/lib/seo/quality";
import { POST } from "../src/app/api/tools/run/route";

test("free tools: ten tools with unique slugs, sound metadata, real related pages and a cluster that lists them", () => {
  assert.equal(TOOLS.length, 10);
  assert.equal(new Set(TOOLS.map((t) => t.slug)).size, 10);
  assert.equal(new Set(TOOLS.map((t) => t.metaTitle)).size, 10, "titles repeat");
  assert.equal(new Set(TOOLS.map((t) => t.metaDescription)).size, 10, "descriptions repeat");
  for (const t of TOOLS) {
    assert.ok(t.metaTitle.length + " · Keplar".length <= QUALITY.titleMax, `${t.slug} title ${t.metaTitle.length}`);
    assert.ok(t.metaDescription.length >= QUALITY.descriptionMin && t.metaDescription.length <= 160, `${t.slug} description ${t.metaDescription.length}`);
    assert.ok(t.steps.length >= 3 && t.output.length >= 3 && t.faq.length >= 3, `${t.slug} needs steps, output and FAQ`);
    for (const r of t.related) assert.ok(hasTitle(r), `${t.slug}: related ${r} is not a known page`);
    const c = CLUSTERS.find((x) => x.id === t.cluster)!;
    assert.ok(c.tools.includes(t.slug), `${c.id} does not list ${t.slug}`);
    assert.equal(new Set(t.fields.map((f) => f.id)).size, t.fields.length, `${t.slug}: duplicate field ids`);
    for (const f of t.fields) if (f.kind === "select") assert.ok(f.options?.length, `${t.slug}.${f.id} needs options`);
    for (const ex of t.examples) for (const k of Object.keys(ex.input)) assert.ok(t.fields.some((f) => f.id === k) || t.kind === "local", `${t.slug}: example field ${k}`);
    assert.match(t.updated, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const c of CLUSTERS) for (const slug of c.tools) assert.ok(toolBySlug(slug), `${c.id} lists unknown tool ${slug}`);
  const text = JSON.stringify(TOOLS).toLowerCase();
  for (const bad of ["100% accurate", "guaranteed", "trusted by", "thousands of", "customers love", "eliminates hallucination"]) assert.ok(!text.includes(bad), bad);
  assert.ok(!/\b\d+(\.\d+)?%/.test(text), "no percentages");
});

test("free tools: the hub and every tool are in the sitemap with a real lastmod", () => {
  for (const p of toolPaths()) {
    assert.ok(sitemapPaths.includes(p), p);
    assert.match(lastmodFor(p) ?? "", /^\d{4}-\d{2}-\d{2}$/, `${p} lastmod`);
  }
  assert.equal(lastmodFor(TOOLS_HUB), TOOLS.map((t) => t.updated).sort().at(-1));
  assert.equal(toolPath(TOOLS[0]), `${TOOLS_HUB}/${TOOLS[0].slug}`);
});

test("free tools: validation enforces required fields, lengths and select options; prompts fence the material", () => {
  const sum = toolBySlug("text-summarizer")!;
  assert.deepEqual(validateInput(sum, {}), { ok: false, error: "Text to summarize is required.", field: "text" });
  assert.equal(validateInput(sum, { text: "x".repeat(4801) }).ok, false);
  const ok = validateInput(sum, { text: "Hello ```world", length: "nope", focus: "costs", extra: "dropped" });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.input.length, "paragraph", "unknown select falls back to the first option");
    assert.equal(ok.input.extra, undefined);
    const p = buildPrompt(sum, ok.input);
    assert.ok(p.includes("Hello '''world") && !p.includes("Hello ```world"), "fences inside the material are neutralized");
    assert.ok(p.includes("## Summary") && p.includes("Focus on: costs"));
  }
  for (const t of TOOLS.filter((t) => t.kind === "model")) {
    const v = validateInput(t, t.examples[0].input);
    assert.ok(v.ok, `${t.slug}: ${v.ok ? "" : v.error}`);
    if (v.ok) {
      const p = buildPrompt(t, v.input);
      assert.ok(p.length > 200 && p.includes("do not invent"), `${t.slug} prompt`);
      assert.ok(p.includes("##"), `${t.slug} prompt names its sections`);
    }
  }
  assert.throws(() => buildPrompt(toolBySlug("citation-formatter")!, {}), /runs locally/);
  const plan = toolBySlug("learning-plan-generator")!;
  assert.equal(validateInput(plan, { topics: "a", exam: "2026-13-45", hours: "6" }).ok, false);
  assert.equal(validateInput(plan, { topics: "a", exam: "2026-12-01", hours: "six" }).ok, false);
});

test("citations: APA, MLA, Chicago and Harvard follow their rules for the common cases", () => {
  assert.deepEqual(parseAuthors("Bostrom, Nick\nWorld Health Organization"), [{ last: "Bostrom", first: "Nick" }, { org: "World Health Organization" }]);
  const book = { type: "book" as const, authors: "Bostrom, Nick", title: "Superintelligence: Paths, dangers, strategies", year: "2014", publisher: "Oxford University Press", page: "22" };
  assert.equal(formatCitation(book, "apa").reference, "Bostrom, N. (2014). *Superintelligence: Paths, dangers, strategies*. Oxford University Press.");
  assert.equal(formatCitation(book, "apa").inText, "(Bostrom, 2014, p. 22)");
  assert.equal(formatCitation(book, "mla").reference, "Bostrom, Nick. *Superintelligence: Paths, dangers, strategies*. Oxford University Press, 2014.");
  assert.equal(formatCitation(book, "mla").inText, "(Bostrom 22)");
  assert.equal(formatCitation(book, "chicago").reference, "Bostrom, Nick. 2014. *Superintelligence: Paths, dangers, strategies*. Oxford University Press.");
  assert.equal(formatCitation(book, "chicago").inText, "(Bostrom 2014, 22)");
  assert.equal(formatCitation(book, "harvard").reference, "Bostrom, N. (2014) *Superintelligence: Paths, dangers, strategies*. Oxford University Press.");
  assert.equal(formatCitation(book, "harvard").inText, "(Bostrom, 2014, p. 22)");
  const article = { type: "article" as const, authors: "Smith, Jane Ann\nLee, Bo", title: "Why models disagree", year: "2025", container: "Journal of AI Studies", volume: "12", issue: "3", pages: "45-67", doi: "10.1000/abc" };
  assert.equal(formatCitation(article, "apa").reference, "Smith, J. A., & Lee, B. (2025). Why models disagree. *Journal of AI Studies*, *12*(3), 45–67. https://doi.org/10.1000/abc");
  assert.equal(formatCitation(article, "apa").inText, "(Smith & Lee, 2025)");
  assert.equal(formatCitation(article, "mla").reference, "Smith, Jane Ann, and Bo Lee. \"Why models disagree.\" *Journal of AI Studies*, vol. 12, no. 3, 2025, pp. 45–67. https://doi.org/10.1000/abc.");
  assert.equal(formatCitation(article, "chicago").reference, "Smith, Jane Ann, and Bo Lee. 2025. \"Why models disagree.\" *Journal of AI Studies* 12 (3): 45–67. https://doi.org/10.1000/abc.");
  assert.equal(formatCitation(article, "harvard").reference, "Smith, J.A. and Lee, B. (2025) 'Why models disagree', *Journal of AI Studies*, 12(3), pp. 45–67. doi:10.1000/abc.");
  const web = { type: "web" as const, authors: "", title: "What is Model Council", year: "2026", container: "Perplexity Help Center", url: "https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council", published: "2026-09-04", accessed: "2026-10-12" };
  assert.equal(formatCitation(web, "mla").reference, "\"What is Model Council.\" *Perplexity Help Center*, 4 Sept. 2026, www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council. Accessed 12 Oct. 2026.");
  assert.equal(formatCitation(web, "apa").reference, "Perplexity Help Center. (2026, September 4). *What is Model Council*. https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council");
  assert.equal(formatCitation(web, "apa").inText, "(Perplexity Help Center, 2026)");
  assert.equal(formatCitation(web, "harvard").reference, "Perplexity Help Center (2026) *What is Model Council*. Available at: https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council (Accessed: 12 October 2026).");
  const noYear = formatCitation({ ...book, year: "" }, "apa");
  assert.ok(noYear.missing.includes("year") && noYear.inText.startsWith("(Bostrom, n.d."));
  assert.equal(plainReference(formatCitation(book, "apa")), "Bostrom, N. (2014). Superintelligence: Paths, dangers, strategies. Oxford University Press.");
});

test("study plan: every topic is learned then reviewed, hard topics get more time, the last days are a full review", () => {
  assert.deepEqual(parseTopics("Cells\n*Photosynthesis\n\ncells\n  * Evolution "), [{ name: "Cells", hard: false }, { name: "Photosynthesis", hard: true }, { name: "Evolution", hard: true }]);
  const plan = buildPlan({ topics: "Cell structure\n*Photosynthesis\nGenetics\n*Evolution", exam: "2026-11-09", hoursPerWeek: 6, daysPerWeek: 6, today: "2026-10-19" });
  assert.ok(plan.ok, plan.ok ? "" : plan.error);
  if (!plan.ok) return;
  assert.equal(plan.minutesPerDay, 60);
  assert.ok(plan.days.length >= 15 && plan.days.length <= 18, `${plan.days.length} days`);
  assert.ok(plan.days.every((d) => d.date < "2026-11-09"), "nothing on or after the exam");
  const items = plan.days.flatMap((d) => d.items.map((it) => ({ ...it, date: d.date })));
  for (const t of ["Cell structure", "Photosynthesis", "Genetics", "Evolution"]) {
    const learn = items.filter((i) => i.topic === t && i.kind === "learn");
    const review = items.filter((i) => i.topic === t && i.kind === "review");
    const final = items.filter((i) => i.topic === t && i.kind === "final");
    assert.ok(learn.length >= 1, `${t} learned`);
    assert.ok(review.length >= 1, `${t} reviewed`);
    assert.ok(final.length >= 1, `${t} in the final review`);
    assert.ok(review.every((r) => r.date > learn.at(-1)!.date), `${t} reviews come after first study`);
  }
  const minutes = (t: string) => items.filter((i) => i.topic === t && i.kind === "learn").reduce((n, i) => n + i.minutes, 0);
  assert.ok(minutes("Photosynthesis") > minutes("Genetics"), "hard topics get more first-study time");
  const last = plan.days.at(-1)!;
  assert.ok(last.items.every((i) => i.kind === "final"), "the last day is final review");
  assert.equal(last.items[0].hard, true, "hard topics first in the final review");
  assert.equal(buildPlan({ topics: "", exam: "2026-11-09", hoursPerWeek: 6, daysPerWeek: 6, today: "2026-10-19" }).ok, false);
  assert.equal(buildPlan({ topics: "a", exam: "2026-10-19", hoursPerWeek: 6, daysPerWeek: 6, today: "2026-10-19" }).ok, false);
  const rushed = buildPlan({ topics: Array.from({ length: 30 }, (_, i) => `T${i}`).join("\n"), exam: "2026-10-23", hoursPerWeek: 2, daysPerWeek: 7, today: "2026-10-19" });
  assert.ok(rushed.ok && rushed.warnings.length >= 1, "a plan that cannot fit warns");
});

test("model explorer: rows come from both rosters with the fields the table shows and no prices", () => {
  const rows = modelRows();
  assert.ok(rows.length >= 10);
  assert.ok(rows.some((r) => r.lane === "free") && rows.some((r) => r.lane === "paid"));
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const r of rows) {
    assert.ok(r.name && r.provider && r.role && r.contextLabel, JSON.stringify(r));
    assert.ok(!("inputPer1M" in r) && !("outputPer1M" in r), "no prices in the explorer");
  }
});

test("tools endpoint: rejects bad JSON, unknown and local tools, and invalid input before any model is called", async () => {
  const post = (body: unknown) => POST(new Request("http://localhost/api/tools/run", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post({ tool: "nope", input: {} })).status, 404);
  const local = await post({ tool: "citation-formatter", input: {} });
  assert.equal(local.status, 400);
  assert.equal((await local.json()).code, "local_tool");
  const invalid = await post({ tool: "text-summarizer", input: {} });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "Text to summarize is required.", code: "invalid_input", field: "text" });
  assert.ok(TOOL_RUN_LIMITS.perMinute < TOOL_RUN_LIMITS.perDay);
});
