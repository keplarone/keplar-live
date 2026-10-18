import "./setup";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MERGED_SYSTEM_PROMPT } from "@/lib/orchestration/free-merged";
import { ModelSynthesizer, SYNTH_SYSTEM_PROMPT } from "@/lib/orchestration/live-synthesizer";
import { EvidenceWeightedComparator } from "@/lib/orchestration/comparator";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { LatencyBudget } from "@/lib/orchestration/latency";
import type { KeplarAnswer, ProviderResult } from "@/lib/orchestration/types";
import { faviconType, faviconUrl } from "@/lib/rich-answer/favicon";
import { richHint } from "@/lib/rich-answer/prompt";
import { agreementLine, buildRich, parseRich, streamView, takeRichFence } from "@/lib/rich-answer/parse";
import { RichAnswer, RichSkeleton } from "@/components/app-ui/rich/RichAnswer";
import { GET as faviconGET } from "@/app/api/favicon/route";

const RANKED = {
  blocks: [
    {
      type: "ranked",
      note: "This order is a judgment, and it changes.",
      items: [
        { rank: 1, name: "Alpha", maker: "Acme", why: "Strongest general answers in the responses.", tags: ["general"], score: "99" },
        { rank: 2, name: "Beta", maker: "Other", why: "Close behind on writing.", tags: ["writing"] },
        { rank: 3, name: "Gamma", maker: "Third", why: "Steady on the rest.", tags: [] },
      ],
    },
    { type: "callout", text: "Use Alpha unless you need Beta's writing." },
    { type: "sources", items: [{ title: "Acme", url: "https://acme.example/alpha" }] },
  ],
};

const material = "Alpha from Acme leads. Beta is close on writing. Gamma from Third is steady. A score of 99 showed up in one response. https://acme.example/alpha";

test("a valid keplar-ui fence is parsed and the prose is kept without the JSON", () => {
  const md = `Alpha leads the field.\n\n\`\`\`keplar-ui\n${JSON.stringify(RANKED)}\n\`\`\`\n`;
  const taken = takeRichFence(md);
  assert.equal(taken.pending, false);
  assert.match(taken.prose, /Alpha leads/);
  assert.doesNotMatch(taken.prose, /keplar-ui/);
  const rich = buildRich(taken.raw, { responses: [{ name: "M", text: material }], material, disagreed: false });
  assert.equal(rich?.blocks[0]?.type, "ranked");
  assert.equal(rich?.blocks[1]?.type, "callout");
  assert.equal(rich?.blocks[2]?.type, "sources");
});

test("a missing fence, broken JSON, or an unknown shape falls back to the prose", () => {
  assert.equal(takeRichFence("Just a paragraph.").raw, null);
  assert.equal(parseRich("not json"), null);
  assert.equal(parseRich('{"blocks":[{"type":"nope"}]}'), null);
  const taken = takeRichFence("The answer.\n\n```keplar-ui\n{not json\n```\n");
  assert.match(taken.prose, /The answer/);
  assert.equal(buildRich(taken.raw, { responses: [], disagreed: false }), undefined);
});

test("an unclosed fence is a skeleton, and the half-written JSON is not part of the prose", () => {
  const open = streamView("Intro line.\n\n```keplar-ui\n{\"blocks\"");
  assert.equal(open.pending, true);
  assert.equal(open.data, null);
  assert.equal(open.prose, "Intro line.");
  const partial = streamView("Intro line.\n```kep");
  assert.equal(partial.pending, true);
  assert.equal(partial.prose, "Intro line.");
  const ready = streamView(`Done.\n\n\`\`\`keplar-ui\n${JSON.stringify({ blocks: [{ type: "callout", text: "Takeaway." }] })}\n\`\`\``);
  assert.equal(ready.pending, false);
  assert.equal(ready.data?.blocks[0]?.type, "callout");
});

test("scores, stats, citations, years, and as-of dates that are not in the responses are dropped", () => {
  const raw = JSON.stringify({
    blocks: [
      { type: "ranked", note: "As of 4 March 1999.", items: [{ rank: 1, name: "Alpha", maker: "InventedCo", why: "Because.", tags: ["madeup"], score: "42" }] },
      { type: "stats", items: [{ label: "Parameters", value: "7T" }, { label: "Mentioned", value: "99" }] },
      { type: "sources", items: [{ title: "Real", url: "https://acme.example/alpha" }, { title: "Fake", url: "https://fake.example/nope" }] },
      { type: "timeline", items: [{ when: "1999", title: "Invented" }, { when: "2024", title: "Mentioned year" }] },
      { type: "callout", text: "Worth using as of January 1999." },
    ],
  });
  const one = "Alpha from Acme leads. A score of 99 showed up in one response. https://acme.example/alpha in 2024";
  const rich = buildRich(raw, { responses: [{ name: "M", text: one }], material: one, disagreed: false });
  assert.equal(rich?.blocks.find((b) => b.type === "ranked"), undefined, "one named item is not a ranking card");
  const kept = buildRich(
    JSON.stringify({
      blocks: [
        {
          type: "ranked",
          note: "As of 4 March 1999.",
          items: [
            { rank: 1, name: "Alpha", maker: "InventedCo", why: "Because.", tags: ["madeup"], score: "42" },
            { rank: 2, name: "Beta", maker: "Other", why: "Close on writing.", tags: [], score: "99" },
            { rank: 3, name: "Gamma", maker: "Third", why: "Steady.", tags: [], score: "7" },
          ],
        },
      ],
    }),
    { responses: [{ name: "M", text: material + " in 2024" }], material: material + " in 2024", disagreed: false },
  );
  const ranked = kept?.blocks.find((b) => b.type === "ranked");
  assert.equal(ranked?.type, "ranked");
  if (ranked?.type === "ranked") {
    assert.equal(ranked.items[0]?.score, undefined);
    assert.equal(ranked.items[0]?.maker, undefined);
    assert.deepEqual(ranked.items[0]?.tags, []);
    assert.equal(ranked.items.find((i) => i.name === "Beta")?.score, "99");
    assert.match(ranked.note, /judgment/);
    assert.doesNotMatch(ranked.note, /1999/);
  }
  const stats = rich?.blocks.find((b) => b.type === "stats");
  if (stats?.type === "stats") assert.deepEqual(stats.items.map((i) => i.value), ["99"]);
  const sources = rich?.blocks.find((b) => b.type === "sources");
  if (sources?.type === "sources") assert.deepEqual(sources.items.map((i) => i.domain), ["acme.example"]);
  const timeline = rich?.blocks.find((b) => b.type === "timeline");
  if (timeline?.type === "timeline") assert.deepEqual(timeline.items.map((i) => i.when), ["2024"]);
  const callout = rich?.blocks.find((b) => b.type === "callout");
  if (callout?.type === "callout") assert.doesNotMatch(callout.text, /1999/);
});

test("a ranking marker quotes the real responses, and only when those sentences differ", () => {
  const raw = JSON.stringify({
    blocks: [{ type: "ranked", items: [{ rank: 1, name: "Alpha", why: "Leads.", split: [{ model: "Invented", said: "This quote was not said." }] }] }],
  });
  const responses = [
    { name: "North", text: "Alpha is the strongest general system in this set. Beta is narrower on writing. Gamma is a distant third." },
    { name: "South", text: "Alpha is overrated for writing. Beta is the one I would pick. Gamma is a distant third." },
  ];
  const split = buildRich(raw, { responses, disagreed: true });
  const item = split?.blocks[0]?.type === "ranked" ? split.blocks[0].items[0] : undefined;
  assert.deepEqual(item?.split?.map((v) => v.model), ["North", "South"]);
  assert.match(item?.split?.[0]?.said ?? "", /strongest general system/);
  assert.doesNotMatch(JSON.stringify(item?.split), /Invented/);

  const same = buildRich(raw, {
    responses: [
      { name: "North", text: "Alpha is the strongest general system in this set." },
      { name: "South", text: "Alpha is the strongest general system in this set." },
    ],
    disagreed: true,
  });
  const sameItem = same?.blocks[0]?.type === "ranked" ? same.blocks[0].items[0] : undefined;
  assert.equal(sameItem?.split, undefined);

  const agreed = buildRich(raw, { responses, disagreed: false });
  const agreedItem = agreed?.blocks[0]?.type === "ranked" ? agreed.blocks[0].items[0] : undefined;
  assert.equal(agreedItem?.split, undefined);
});

test("agreement text is the comparator's own summary, and unscored answers invent nothing", () => {
  assert.equal(agreementLine({ level: "partial", agree: 2, disagree: 1, summary: "2 agree, 1 disagrees" }), "2 agree, 1 disagrees");
  assert.equal(agreementLine({ level: "unscored", agree: 0, disagree: 0, summary: "Responses received; agreement not scored yet." }), "");
  assert.equal(agreementLine({ level: "single", agree: 0, disagree: 0, summary: "One model answered." }), "");
});

test("the structured block is part of the existing synthesis prompt, including the Free combined review", () => {
  assert.match(SYNTH_SYSTEM_PROMPT, /keplar-ui/);
  assert.match(SYNTH_SYSTEM_PROMPT, /Never invent a score, benchmark, citation, URL/);
  assert.match(SYNTH_SYSTEM_PROMPT, /Do not put agreement counts/);
  assert.ok(MERGED_SYSTEM_PROMPT.includes(SYNTH_SYSTEM_PROMPT.slice(0, 80)));
  assert.match(MERGED_SYSTEM_PROMPT, /keplar-ui/);
});

test("parsing a block does not add a model call, and the stored markdown stays plain", async () => {
  const [m1, m2] = freeRoster;
  let calls = 0;
  const registry = { generate: async () => { calls++; return { ok: false }; } } as never;
  const fence = JSON.stringify({
    blocks: [
      { type: "ranked", note: "This order is a judgment, and it changes.", items: [{ rank: 1, name: "Alpha", maker: "Acme", why: "It led both replies." }] },
      { type: "callout", text: "Start with Alpha." },
    ],
  });
  const results: ProviderResult[] = [m1, m2].map((m) => ({ ok: true, modelId: m.id, stance: "alpha", claims: [], text: "Alpha from Acme led both replies. Beta from Other is close on writing. Gamma from Third is the careful one.", latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }));
  const comparison = new EvidenceWeightedComparator().compare(results);
  const s = new ModelSynthesizer(registry, m1, new LatencyBudget(60_000).start());
  s.noExtraCalls = true;
  s.prewritten = { text: `Alpha from Acme is the one to start with. Beta from Other is close on writing. Gamma from Third is the careful one.\n\n\`\`\`keplar-ui\n${fence}\n\`\`\`\nRESOLUTION: No disagreement.`, by: m1.id };
  const deltas: string[] = [];
  const plan = { mode: "consensus", panel: [m1, m2].map((model) => ({ model, slot: "panel", covers: "Reasoning", reason: "" })), verifier: null, judge: null, estimate: { breakdown: [] }, rationale: "" } as never;
  const verification = { mode: "cross-model", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] } as never;
  const classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 1, estimatedOutputTokens: 1, needsWeb: false, rationale: "" } as never;
  const out = (await s.synthesize({ req: { prompt: "what are the greatest ai", plan: "free" }, classification, plan, results, comparison, verification, preferredModelId: m1.id, onDelta: (t: string) => deltas.push(t), signal: undefined } as never)) as unknown as KeplarAnswer;
  assert.equal(s.keptReply, false, "the combined reply is the answer, even when the models agreed");
  assert.equal(calls, 0);
  assert.match(out.markdown, /start with/);
  assert.doesNotMatch(out.markdown, /keplar-ui/);
  assert.equal(out.rich?.blocks[0]?.type, "ranked");
  assert.equal(out.rich?.blocks[1]?.type, "callout");
  const streamed = deltas.join("");
  assert.match(streamed, /```keplar-ui/);
  assert.doesNotMatch(streamed, /"ranked"/);
});

test("the rich view renders a ranking, a disagreement quote, a takeaway, sources, and the real agreement line", () => {
  const html = renderToStaticMarkup(createElement(RichAnswer, {
    consensus: { level: "partial", agree: 2, disagree: 1, summary: "2 agree, 1 disagrees" },
    data: {
      blocks: [
        {
          type: "ranked",
          note: "This order is a judgment, and it changes.",
          items: [
            { rank: 1, name: "Alpha", maker: "Acme", why: "It led the replies.", tags: ["general"], split: [{ model: "North", said: "Alpha is the strongest." }, { model: "South", said: "Alpha is overrated." }] },
            { rank: 2, name: "Beta", maker: "Other", why: "Close on writing.", tags: [] },
            { rank: 3, name: "Gamma", maker: "Third", why: "Steady.", tags: [] },
          ],
        },
        { type: "callout", text: "Start with Alpha." },
        { type: "sources", items: [{ title: "Acme", url: "https://acme.example/alpha", domain: "acme.example" }] },
        { type: "compare", columns: ["A", "B"], rows: [{ label: "Price", cells: ["1", "2"] }] },
        { type: "timeline", items: [{ when: "1969", title: "First link", body: "Two machines." }] },
        { type: "steps", items: [{ title: "Mix", body: "Stir the starter." }] },
        { type: "proscons", pros: ["Cheap"], cons: ["Slow"] },
        { type: "cards", items: [{ title: "One", body: "A card." }] },
        { type: "stats", items: [{ label: "Year", value: "1969" }] },
      ],
    },
  }));
  assert.match(html, /2 agree, 1 disagrees/);
  assert.match(html, /<ol/);
  assert.match(html, /Alpha/);
  assert.match(html, /Acme/);
  assert.match(html, /It led the replies/);
  assert.match(html, /Differed/);
  assert.match(html, /Alpha is the strongest/);
  assert.match(html, /Start with Alpha/);
  assert.match(html, /acme\.example/);
  assert.match(html, /<table/);
  assert.match(html, /First link/);
  assert.match(html, /Stir the starter/);
  assert.match(html, /Cheap/);
  assert.match(html, /Slow/);
  assert.match(html, /<dl/);
  assert.doesNotMatch(html, /99 of 100|agreed by \d/);
});

test("a one-item ranking is not shown, and a short block is filled from names in the answer", () => {
  const lonely = renderToStaticMarkup(createElement(RichAnswer, {
    data: { blocks: [{ type: "ranked", note: "This order is a judgment, and it changes.", items: [{ rank: 1, name: "Alpha", why: "Leads.", tags: [] }, { rank: 2, name: "Beta", why: "Close.", tags: [] }] }] },
  }));
  assert.equal(lonely, "");
  const prose = "GPT-4 from OpenAI is the broad default. Gemini from Google is close on images. Claude from Anthropic writes carefully. Llama from Meta is the open one. Grok is fast in conversation. Mistral is the compact one.";
  const rich = buildRich(
    JSON.stringify({ blocks: [{ type: "ranked", note: "This order is a judgment, and it changes.", items: [{ rank: 1, name: "GPT-4", maker: "OpenAI", why: "The broad default." }] }, { type: "callout", text: "Start with GPT-4." }] }),
    { responses: [{ name: "M", text: prose }], material: prose, disagreed: false },
  );
  const ranked = rich?.blocks.find((b) => b.type === "ranked");
  assert.equal(ranked?.type, "ranked");
  if (ranked?.type !== "ranked") return;
  assert.ok(ranked.items.length >= 5 && ranked.items.length <= 8);
  assert.deepEqual(ranked.items.map((i) => i.name), ["GPT-4", "Gemini", "Claude", "Llama", "Grok", "Mistral"]);
  assert.equal(ranked.items[0]?.maker, "OpenAI");
  assert.equal(ranked.items.find((i) => i.name === "Gemini")?.maker, "Google");
  assert.equal(ranked.items.some((i) => i.name === "OpenAI" || i.name === "Google" || i.name === "Meta"), false);
  for (const it of ranked.items) assert.ok(prose.includes(it.name) && prose.toLowerCase().includes(it.why.replace(/…$/, "").toLowerCase().slice(0, 24)));
  assert.equal(rich?.blocks.some((b) => b.type === "callout"), true);
  const thin = buildRich(
    JSON.stringify({ blocks: [{ type: "ranked", note: "This order is a judgment, and it changes.", items: [{ rank: 1, name: "Alpha", why: "Leads the field today." }] }, { type: "callout", text: "Use Alpha." }] }),
    { responses: [{ name: "M", text: "Alpha leads the field today." }], disagreed: false },
  );
  assert.equal(thin?.blocks.find((b) => b.type === "ranked"), undefined);
  assert.equal(thin?.blocks[0]?.type, "callout");
  const answer = "GPT-4 from OpenAI is the broad default. Gemini from Google is close on images. Claude from Anthropic writes carefully.";
  const aside = "DeepSeek from DeepSeek is cheap to run. Qwen from Alibaba is strong on long text. Phi from Microsoft is the small one.";
  const scoped = buildRich(
    JSON.stringify({ blocks: [{ type: "ranked", note: "This order is a judgment, and it changes.", items: [{ rank: 1, name: "GPT-4", maker: "OpenAI", why: "The broad default." }] }] }),
    { responses: [{ name: "M", text: `${answer} ${aside}` }], material: `${answer}\n${aside}`, answer, disagreed: false },
  );
  const scopedRank = scoped?.blocks.find((b) => b.type === "ranked");
  assert.equal(scopedRank?.type, "ranked");
  if (scopedRank?.type === "ranked") assert.deepEqual(scopedRank.items.map((i) => i.name), ["GPT-4", "Gemini", "Claude"]);
});

test("an answer with no block renders nothing extra, and a half-written block is a skeleton", () => {
  const html = renderToStaticMarkup(createElement(RichAnswer, { data: { blocks: [] } }));
  assert.equal(html, "");
  const sk = renderToStaticMarkup(createElement(RichSkeleton));
  assert.match(sk, /data-rich-skeleton/);
  assert.match(sk, /Preparing the structured part of the answer/);
});

test("the rich stylesheet stays graphite and white, and motion is transform and opacity only", () => {
  const css = readFileSync("src/components/app-ui/rich/RichAnswer.module.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation:\s*none/);
  assert.match(css, /translateY/);
  assert.match(css, /max-width:\s*480px/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.doesNotMatch(css, /gradient|blur\(|purple|violet|pink|glow|box-shadow|backdrop-filter|#[0-9a-f]{3,8}/i);
});

test("a ranking, comparison, timeline, or how-to asks the same call for one block; a fact does not", () => {
  assert.match(richHint("what are the greatest ai in the world"), /"type":"ranked"/);
  assert.match(richHint("what are the greatest ai in the world"), /judgment/);
  assert.match(richHint("what are the greatest ai in the world"), /5 to 8/);
  assert.match(richHint("what are the greatest ai in the world"), /current generation/);
  assert.match(richHint("compare iPhone 17 vs Pixel 10"), /"type":"compare"/);
  assert.match(richHint("history of the internet"), /"type":"timeline"/);
  assert.match(richHint("how do I make sourdough"), /"type":"steps"/);
  assert.equal(richHint("What is the capital of Australia?"), "");
  assert.equal(richHint("hi"), "");
  const orch = readFileSync("src/lib/orchestration/orchestrator.ts", "utf8");
  assert.match(orch, /richHint\(req\.prompt\)/);
  assert.match(readFileSync("src/lib/orchestration/free-merged.ts", "utf8"), /richHint\(req\.prompt\)/);
});

test("one model can carry the block in its own reply, with no extra call", async () => {
  const [m1] = freeRoster;
  let calls = 0;
  const registry = { generate: async () => { calls++; return { ok: false }; } } as never;
  const fence = JSON.stringify({
    blocks: [
      { type: "ranked", note: "This order is a judgment, and it changes.", items: [{ rank: 1, name: "Alpha", maker: "Acme", why: "It led the reply." }] },
      { type: "callout", text: "Start with Alpha." },
    ],
  });
  const text = `Alpha from Acme leads the general answers. Beta from Other is close on writing. Gamma from Third is the careful one.\n\n\`\`\`keplar-ui\n${fence}\n\`\`\``;
  const results: ProviderResult[] = [{ ok: true, modelId: m1.id, stance: "alpha", claims: [], text, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }];
  const comparison = new EvidenceWeightedComparator().compare(results);
  const s = new ModelSynthesizer(registry, m1, new LatencyBudget(60_000).start());
  const plan = { mode: "single", panel: [{ model: m1, slot: "panel", covers: "Reasoning", reason: "" }], verifier: null, judge: null, estimate: { breakdown: [] }, rationale: "" } as never;
  const verification = { mode: "not-needed", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] } as never;
  const classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 1, estimatedOutputTokens: 1, needsWeb: false, rationale: "" } as never;
  const out = (await s.synthesize({ req: { prompt: "what are the greatest ai in the world", plan: "free" }, classification, plan, results, comparison, verification, onDelta: () => {}, signal: undefined } as never)) as unknown as KeplarAnswer;
  assert.equal(calls, 0);
  assert.match(out.markdown, /Alpha from Acme/);
  assert.doesNotMatch(out.markdown, /keplar-ui/);
  assert.equal(out.rich?.blocks[0]?.type, "ranked");
});

test("favicon hosts are real domains, and only image bytes are served", async () => {
  assert.equal(faviconUrl("acme.example"), "https://acme.example/favicon.ico");
  assert.equal(faviconUrl("localhost"), null);
  assert.equal(faviconUrl("evil.internal"), null);
  assert.equal(faviconUrl("127.0.0.1"), null);
  assert.equal(faviconUrl("not a host"), null);
  assert.equal(faviconType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0])), "image/png");
  assert.equal(faviconType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script></script></svg>")), null);
  const blocked = await faviconGET(new Request("https://keplar.one/api/favicon?domain=127.0.0.1"));
  assert.equal(blocked.status, 400);
});
