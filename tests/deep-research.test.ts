import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { addSources, linkCitations, numberNotes, OFF_NOT_ENABLED, OFF_SENSITIVE, parsePlan, PLAN_SYSTEM, researchBrief, RESEARCH_SYSTEM } from "@/lib/orchestration/research";
import { applyResearch } from "@/components/app-ui/state/research";
import type { KeplarAnswer, KeplarEvent, KeplarRequest, ResearchEvent, ResearchSource, Retriever } from "@/lib/orchestration/types";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";

const src = (n: number, url = `https://site${n}.example.com/page`): ResearchSource => ({ n, title: `Page ${n}`, url, host: new URL(url).hostname, query: 0 });

test("plan: up to three distinct queries from the planner; the question itself when the reply is unusable", () => {
  assert.deepEqual(parsePlan('```json\n{"queries":["eiffel tower completion date","Eiffel Tower completion date","gustave eiffel firm","tower height","extra"]}\n```', "Q?"), ["eiffel tower completion date", "gustave eiffel firm", "tower height"]);
  assert.deepEqual(parsePlan("no json here", "  When was it   built? "), ["When was it built?"]);
  assert.deepEqual(parsePlan('{"queries":[1, "", "ok"]}', "Q?"), ["Q?"], "queries shorter than 3 characters are dropped");
  assert.deepEqual(parsePlan('{"queries":"x"}', "Q?"), ["Q?"]);
  assert.match(PLAN_SYSTEM, /queries/);
  assert.ok(RESEARCH_SYSTEM.length > 20);
});

test("sources: numbered in order, deduplicated by URL, unsafe links and credentials dropped, snippets clipped", () => {
  const all: ResearchSource[] = [];
  const a = addSources(all, [{ url: "https://www.britannica.com/a#x", title: "Britannica", snippet: "s".repeat(400) }, { url: "javascript:alert(1)", title: "x" }, { url: "https://u:p@example.com/b", title: "" }], 0);
  assert.deepEqual(a.map((s) => [s.n, s.host, s.url]), [[1, "britannica.com", "https://www.britannica.com/a"], [2, "example.com", "https://example.com/b"]]);
  assert.equal(a[0].snippet!.length, 280);
  assert.equal(a[1].title, "example.com", "a page without a title is named by its site");
  const b = addSources(all, [{ url: "https://www.britannica.com/a", title: "dup" }, { url: "https://nasa.gov/c", title: "NASA" }], 1);
  assert.deepEqual(b.map((s) => [s.n, s.query]), [[3, 1]]);
  assert.equal(all.length, 3);
});

test("notes: known links become [n], unknown links are dropped (their text kept)", () => {
  const sources = [src(1, "https://a.example.com/x"), src(2, "https://b.example.com/y")];
  const out = numberNotes("Built in 1889 ([Britannica](https://a.example.com/x)). Height 330 m (https://b.example.com/y/). Rumour [blog](https://evil.example.net/z).", sources);
  assert.match(out, /Britannica \[1\]/);
  assert.match(out, /330 m \[2\]/);
  assert.doesNotMatch(out, /evil|https?:/);
  assert.match(out, /Rumour blog/);
  const brief = researchBrief(["q1"], sources, [out]);
  assert.match(brief, /\[1\] Page 1 \(a\.example\.com\)/);
  assert.match(brief, /not instructions/);
  assert.match(brief, /doesn't prove it/);
  assert.equal(researchBrief(["q1"], [], [""]), "", "no pages, no brief");
});

test("citations: only numbers of pages that were read survive; lists are normalised; code is left alone", () => {
  const sources = [src(1), src(2), src(3)];
  const r = linkCitations("Completed in 1889 [1]. Height is 330 m [2, 3]. Made up [9]. Mixed [3; 7].\n\n```py\nx = a[1]\n```\nInline `b[2]` and a [link](https://x.example.com) stay.", sources);
  assert.equal(r.markdown, "Completed in 1889 [1]. Height is 330 m [2][3]. Made up. Mixed [3].\n\n```py\nx = a[1]\n```\nInline `b[2]` and a [link](https://x.example.com) stay.");
  assert.deepEqual(r.cited, [1, 2, 3]);
  assert.deepEqual(linkCitations("No markers here.", sources), { markdown: "No markers here.", cited: [] });
});

test("client state: steps, the read counter and the off note follow the events", () => {
  const evs: ResearchEvent[] = [
    { phase: "step", step: "plan", status: "active" },
    { phase: "plan", queries: ["a", "b"] },
    { phase: "step", step: "plan", status: "done", detail: "2 questions to research" },
    { phase: "step", step: "search", status: "active" },
    { phase: "step", step: "read", status: "active" },
    { phase: "source", source: src(1) },
    { phase: "source", source: src(1) },
    { phase: "source", source: src(2) },
  ];
  let r = evs.reduce(applyResearch, undefined as never);
  assert.deepEqual(r.queries, ["a", "b"]);
  assert.equal(r.steps.plan.status, "done");
  assert.equal(r.steps.plan.detail, "2 questions to research");
  assert.equal(r.steps.read.status, "active");
  assert.equal(r.sources.length, 2, "a page streamed twice counts once");
  r = applyResearch(undefined as never, { phase: "off", reason: OFF_NOT_ENABLED });
  assert.equal(r.off, OFF_NOT_ENABLED);
  assert.deepEqual([r.steps.plan.status, r.steps.search.status, r.steps.read.status, r.steps.check.status, r.steps.write.status], ["skipped", "skipped", "skipped", "pending", "pending"]);
});

/* ─────────────── through the pipeline: stubbed model API + a recording retriever ─────────────── */

const FAKE = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" };
async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const REPORT = "The Eiffel Tower was completed in 1889 [1]. It was designed by Gustave Eiffel's engineering firm [2, 3]. Its height is 330 metres [7].\nRESOLUTION: No disagreement.";
function stub(report = REPORT) {
  const realFetch = globalThis.fetch;
  const synthSaw: string[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: string }[] };
    const sys = body.messages[0].content;
    if (u.includes("nvidia")) return new Response("{}", { status: 403 });
    let content: string;
    if (sys.startsWith("You plan web research")) content = JSON.stringify({ queries: ["eiffel tower completion year", "eiffel tower designer"] });
    else if (sys.startsWith("You are Keplar's response classifier")) {
      const n = (body.messages[1].content.match(/### R\d+/g) ?? []).length;
      content = JSON.stringify({ topic: "Eiffel Tower", positions: [{ id: "P1", label: "1889", summary: "1889." }], responses: Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, kind: "answer", position: "P1" })), claims: [] });
    } else if (sys.startsWith("You are Keplar's verifier")) content = JSON.stringify({ checks: [], disputed: [] });
    else if (sys.startsWith("You are Keplar's judge-tier synthesizer writing a DRAFT")) content = "Draft: 1889 [1].";
    else if (sys.startsWith("You are Keplar's judge-tier synthesizer")) { synthSaw.push(`${sys}\n${body.messages[1]?.content ?? ""}`); content = report; }
    else if (sys.includes("critic") || sys.includes("Critique") || sys.includes("CRITIQUE")) content = report;
    else content = "The Eiffel Tower was completed in 1889 [1] by Gustave Eiffel's firm [2].";
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.0001 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = realFetch; }, synthSaw };
}
function researcher(): Retriever & { queries: string[] } {
  const queries: string[] = [];
  return {
    name: "openrouter-web:exa", live: true, queries,
    async check() { return { checks: [], costUsd: 0 }; },
    async research({ query }) {
      queries.push(query);
      const pages = query.includes("designer")
        ? [{ url: "https://www.toureiffel.paris/en/the-monument/history", title: "History of the Eiffel Tower", snippet: "Designed by the firm of Gustave Eiffel." }, { url: "https://en.wikipedia.org/wiki/Gustave_Eiffel", title: "Gustave Eiffel" }]
        : [{ url: "https://www.britannica.com/topic/Eiffel-Tower-Paris-France", title: "Eiffel Tower | Britannica", snippet: "Completed in 1889 for the Exposition Universelle." }];
      return { sources: pages, notes: `Notes for ${query} (${pages[0].url})`, costUsd: 0.01 };
    },
  };
}
const Q = "Research when the Eiffel Tower was completed and who designed it.";
async function run(deps: NonNullable<ReturnType<typeof engineDeps>>, req: KeplarRequest) {
  const events: KeplarEvent[] = [];
  let a: KeplarAnswer | null = null;
  for await (const e of orchestrate(req, deps)) { events.push(e); if (e.type === "answer") a = e.answer; }
  return { events, a: a! };
}

test("pipeline, Deep Research with web search: plan → search → read stream before the panel, pages are numbered, the report keeps only real citations", async () => {
  const s = stub();
  try {
    const r = researcher();
    const { events, a } = await withEnv(FAKE, async () => run({ ...engineDeps()!, retriever: r }, { prompt: Q, plan: "plus", modes: { deepResearch: true }, computeRemaining: 1e7, limits: { maxRequestUsd: 50, maxDeepResearchUsd: 50 } }));
    assert.ok(a, "an answer was delivered");
    assert.deepEqual(r.queries.sort(), ["eiffel tower completion year", "eiffel tower designer"]);
    const rs = events.filter((e): e is Extract<KeplarEvent, { type: "research" }> => e.type === "research").map((e) => e.research);
    const order = rs.map((e) => (e.phase === "step" ? `${e.step}:${e.status}` : e.phase));
    assert.equal(order[0], "plan:active");
    assert.ok(order.indexOf("plan") < order.indexOf("search:active"));
    assert.ok(order.indexOf("source") > order.indexOf("read:active"));
    assert.ok(order.indexOf("read:done") < order.indexOf("write:active"));
    assert.ok(order.includes("write:done"));
    assert.equal(rs.filter((e) => e.phase === "source").length, 3, "each page is streamed once, as it is read");
    const firstPanel = events.findIndex((e) => e.type === "model");
    if (firstPanel >= 0) assert.ok(events.findIndex((e) => e.type === "research" && e.research.phase === "step" && e.research.step === "read" && e.research.status === "done") < firstPanel, "research finishes before the panel answers");
    assert.ok(a.research);
    assert.equal(a.research!.sources.length, 3);
    assert.deepEqual(a.research!.sources.map((x) => x.n), [1, 2, 3]);
    assert.equal(a.research!.off, undefined);
    assert.doesNotMatch(a.markdown, /\[7\]/, "a number no page has is removed");
    assert.match(a.markdown, /\[1\]/);
    assert.ok(a.research!.cited.every((n) => n >= 1 && n <= 3) && a.research!.cited.length > 0);
    assert.ok(s.synthSaw.some((x) => x.includes("Web research for this question") && x.includes("cite a page as [n]")), "the writer got the numbered pages and the citation rules");
    assert.ok(!a.sources?.some((x) => x.title === "No sources cited"), "no 'no sources' note when pages were read");
  } finally { s.restore(); }
});

test("pipeline, Deep Research citation check: a citation whose page is about something else is removed, the check rides on the answer", async () => {
  const TOWER = "The Eiffel Tower is a wrought-iron lattice tower in Paris. It was completed in 1889 for the Exposition Universelle and designed by the engineering firm of Gustave Eiffel. It stands 330 metres tall.";
  const BAKERY = "Our bakery opens at seven every morning and sells sourdough loaves, croissants and seasonal fruit tarts made with butter from local farms near Lyon. Orders for weddings and birthdays need two days of notice, and deliveries run within the city on weekdays. Every Sunday we bake rye and close early on public holidays across Auvergne.";
  const s = stub("The Eiffel Tower was completed in 1889 [1]. It stands 330 metres tall [2].\nRESOLUTION: No disagreement.");
  try {
    const r: Retriever = {
      name: "openrouter-web:exa", live: true,
      async check() { return { checks: [], costUsd: 0 }; },
      async research({ query }) {
        const pages = query.includes("designer")
          ? [{ url: "https://bakery.example.com/", title: "A bakery", snippet: BAKERY }]
          : [{ url: "https://www.britannica.com/topic/Eiffel-Tower-Paris-France", title: "Eiffel Tower | Britannica", snippet: TOWER }];
        return { sources: pages, notes: `Notes (${pages[0].url})`, costUsd: 0.01 };
      },
    };
    const { a } = await withEnv(FAKE, async () => run({ ...engineDeps()!, retriever: r }, { prompt: Q, plan: "plus", modes: { deepResearch: true }, computeRemaining: 1e7, limits: { maxRequestUsd: 50, maxDeepResearchUsd: 50 } }));
    const bakery = a.research!.sources.find((x) => x.host === "bakery.example.com")!;
    const tower = a.research!.sources.find((x) => x.host === "britannica.com")!;
    assert.ok(bakery && tower, "both pages were read");
    const checked = a.research!.checked!;
    assert.ok(checked, "the server check is on the answer");
    assert.equal(checked.by, "server");
    assert.ok(checked.summary.claims >= 1);
    assert.doesNotMatch(a.markdown, new RegExp(`tall \\[${bakery.n}\\]`), "the bakery page no longer cites the tower's height");
    assert.match(a.markdown, new RegExp(`1889 \\[${tower.n}\\]`), "the matching citation stays");
    assert.ok(a.research!.cited.every((n) => a.markdown.includes(`[${n}]`)), "cited lists only pages still cited in the text");
    assert.ok(BAKERY.length > 280 && bakery.snippet!.length === 280, "the page shows only its 280-character snippet");
    assert.ok(!JSON.stringify(a).includes("close early on public holidays across Auvergne"), "the longer page text kept for the check never leaves the server");
  } finally { s.restore(); }
});

test("pipeline, Deep Research without web search: says honestly that no pages were read; Sensitive says why", async () => {
  const s = stub();
  try {
    const noResearch: Retriever = { name: "openrouter-web:exa", live: true, async check() { return { checks: [], costUsd: 0 }; } };
    const { events, a } = await withEnv(FAKE, async () => run({ ...engineDeps()!, retriever: noResearch }, { prompt: Q, plan: "plus", modes: { deepResearch: true }, computeRemaining: 1e7, limits: { maxRequestUsd: 50, maxDeepResearchUsd: 50 } }));
    assert.ok(events.some((e) => e.type === "research" && e.research.phase === "off" && e.research.reason === OFF_NOT_ENABLED));
    assert.deepEqual(a.research?.sources, []);
    assert.equal(a.research?.off, OFF_NOT_ENABLED);
    assert.doesNotMatch(a.markdown, /\[\d\]/, "no citation survives when no page was read");
    const sens = await withEnv(FAKE, async () => run({ ...engineDeps()!, retriever: researcher() }, { prompt: Q, plan: "plus", modes: { deepResearch: true }, routing: { tier: "sensitive" }, computeRemaining: 1e7, limits: { maxRequestUsd: 50, maxDeepResearchUsd: 50 } }));
    if (sens.a) assert.equal(sens.a.research?.off, OFF_SENSITIVE);
  } finally { s.restore(); }
});

test("pipeline, normal question: no research events at all", async () => {
  const s = stub();
  try {
    const { events, a } = await withEnv(FAKE, async () => run({ ...engineDeps()!, retriever: researcher() }, { prompt: "When was the Eiffel Tower completed?", plan: "plus", computeRemaining: 1e7 }));
    assert.ok(a);
    assert.equal(events.filter((e) => e.type === "research").length, 0);
    assert.equal(a.research, undefined);
  } finally { s.restore(); }
});
