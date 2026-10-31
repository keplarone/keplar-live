"use client";

import { KeplarTurn } from "@/components/app-ui/KeplarTurn";
import { ANON_KEY } from "@/components/app-ui/state/scope";
import type { KeplarMessage, Ledger, Message, Thread } from "@/components/app-ui/state/types";
import type { ConsultedModel, KeplarAnswer } from "@/lib/orchestration/types";
import s from "./Showcase.module.css";

/**
 * /dev/orbit "Answers": the real KeplarTurn rendered from fixed mock answers (no models run here), so the Consensus answer layout can
 * be checked in a production build: agreement, disagreement, sources and citations, a table and code, a ranking, and streaming.
 */
const LEDGER: Ledger = { used: 10, total: null, plan: "plus", resetsAt: null, paused: false, signedIn: true, windows: null, synced: true };
const T0 = 1_761_900_000_000;

const panel = (id: string, name: string, provider: string, stance: string, excerpt?: string): ConsultedModel => ({ id, name, provider, slot: "panel", status: "responded", stance, excerpt });

const base = (over: Partial<KeplarAnswer>): KeplarAnswer => ({
  id: "a",
  markdown: "",
  consensus: { level: "consensus", score: 86, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "All three models took the same position." },
  models: [],
  sources: [],
  disagreements: [],
  verification: { mode: "cross-model", summary: "A verifier checked the draft against the panel's answers.", checks: [], notes: [] },
  reasoning: "The models agreed on the core recommendation; the answer keeps the one caveat they raised.",
  capabilities: ["Reasoning"],
  compute: { units: 3, level: "moderate" },
  durationMs: 8400,
  ...over,
});

const done = (id: string, answer: KeplarAnswer, extra: Partial<KeplarMessage> = {}): KeplarMessage => ({
  id,
  role: "keplar",
  replyTo: `u-${id}`,
  status: "done",
  mode: "consensus",
  stages: [
    { id: "understand", status: "done" },
    { id: "select", status: "done" },
    { id: "compare", status: "done" },
    { id: "verify", status: "done" },
    { id: "synthesize", status: "done" },
  ],
  capabilities: ["Reasoning"],
  models: answer.models.map((m) => ({ id: m.id, name: m.name, status: m.status === "responded" ? "responded" : "failed" })),
  modelCount: answer.models.length,
  draft: "",
  answer: { ...answer, id: `a-${id}` },
  startedAt: T0,
  finishedAt: T0 + answer.durationMs,
  ...extra,
});

const DISAGREE = done(
  "disagree",
  base({
    markdown: [
      "Use **PostgreSQL with JSONB columns** for the flexible fields and keep everything you filter or join on in ordinary typed columns. Four of the five models landed on this split.",
      "## Why this split works",
      "Typed columns keep indexes, constraints and query plans predictable, while JSONB absorbs the long tail of optional attributes without a migration for each one.",
      "- Index the JSONB paths you actually query with a GIN or expression index.",
      "- Validate the JSON shape in the application, or with a `CHECK` constraint for the critical keys.",
      "- Promote a key to a real column once more than a few queries depend on it.",
      "## When to choose differently",
      "> If almost every query filters on different ad-hoc attributes, a document store may still be simpler to operate.",
      "A separate entity–attribute–value table is the option all five models advised against: it makes ordinary queries slow and hard to read.",
    ].join("\n\n"),
    consensus: { level: "consensus", score: 82, agree: 4, disagree: 1, missing: 0, responded: 5, consulted: 5, summary: "Four of five models recommend typed columns plus JSONB; one prefers a document store.", majorityStance: "jsonb" },
    models: [
      panel("live:claude-sonnet-5", "Claude Sonnet 5", "Anthropic", "jsonb"),
      panel("live:gpt-6", "GPT-6", "OpenAI", "jsonb"),
      panel("live:gemini-3.8-pro", "Gemini 3.8 Pro", "Google", "jsonb"),
      panel("live:deepseek-v4", "DeepSeek V4", "DeepSeek", "jsonb"),
      panel("live:grok-5", "Grok 5", "xAI", "document store", "For data whose shape changes this often, **a document database such as MongoDB** is the more natural fit: every record can carry its own fields, and you avoid fighting the relational model.\n\nPostgres JSONB works, but you end up re-implementing schema-on-read inside SQL."),
    ],
    sources: [
      { kind: "web", title: "JSON Types — PostgreSQL 18 documentation", url: "https://www.postgresql.org/docs/current/datatype-json.html" },
      { kind: "model", title: "GIN indexes and jsonb_path_ops", url: "https://www.postgresql.org/docs/current/gin.html" },
      { kind: "web", title: "When to use JSONB in Postgres (and when not to)", url: "https://www.crunchydata.com/blog/when-to-use-jsonb" },
      { kind: "attachment", title: "schema-draft.sql" },
    ],
    disagreements: [
      { topic: "Storage model", positions: [{ stance: "jsonb", models: ["Claude", "ChatGPT", "Gemini", "DeepSeek"], summary: "Typed columns plus JSONB for flexible fields." }, { stance: "document store", models: ["Grok"], summary: "A document database fits a shape that changes often." }], resolution: "Kept the majority view; the document-store case is noted as an alternative for fully ad-hoc queries." },
    ],
  }),
);

const TABLE = done(
  "table",
  base({
    markdown: [
      "For a 50 GB dataset that is mostly read, **the r7g.xlarge is the best value**: it has the memory to keep the working set cached at about half the price of the larger instance.",
      "## Options compared",
      ["| Instance | vCPU | Memory | Price / month | p95 latency |", "| --- | --- | --- | --- | --- |", "| r7g.large | 2 | 16 GB | $96 | 41 ms |", "| r7g.xlarge | 4 | 32 GB | $192 | 12 ms |", "| r7g.2xlarge | 8 | 64 GB | $384 | 9 ms |"].join("\n"),
      "## Set it up",
      "```bash\naws rds modify-db-instance \\\n  --db-instance-identifier app-prod \\\n  --db-instance-class db.r7g.xlarge \\\n  --apply-immediately\n```",
      "Watch `FreeableMemory` for a week afterwards; if it stays above 6 GB you have headroom.",
    ].join("\n\n"),
    models: [panel("live:claude-sonnet-5", "Claude Sonnet 5", "Anthropic", "xlarge"), panel("live:gpt-6", "GPT-6", "OpenAI", "xlarge"), panel("live:gemini-3.8-pro", "Gemini 3.8 Pro", "Google", "xlarge")],
    consensus: { level: "consensus", score: 91, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "All three models recommend the xlarge instance.", majorityStance: "xlarge" },
  }),
);

const RESEARCH_SOURCES = [
  { n: 1, title: "Global EV Outlook 2026", url: "https://www.iea.org/reports/global-ev-outlook-2026", host: "iea.org", query: 0, snippet: "Electric car sales passed 20 million in 2025." },
  { n: 2, title: "Battery pack prices fall to a record low", url: "https://about.bnef.com/blog/battery-pack-prices-2025", host: "about.bnef.com", query: 0 },
  { n: 3, title: "EV charging infrastructure in Europe", url: "https://www.acea.auto/fact/charging-points-2025", host: "acea.auto", query: 1 },
];
const RESEARCH = done(
  "research",
  base({
    markdown: [
      "Electric cars passed **20 million sales in 2025**, roughly one in four new cars sold worldwide [1]. Falling battery prices did most of the work [2].",
      "## What is driving it",
      "- Pack prices fell below $100 per kWh for the first time [2].",
      "- Public charging points in Europe grew by a third in a year [3].",
    ].join("\n\n"),
    research: { queries: ["ev sales 2025", "battery pack price 2025"], sources: RESEARCH_SOURCES, cited: [1, 2, 3] },
    models: [
      panel("live:claude-sonnet-5", "Claude Sonnet 5", "Anthropic", "20 million"),
      panel("live:gemini-3.8-pro", "Gemini 3.8 Pro", "Google", "20 million"),
      panel("live:gpt-6", "GPT-6", "OpenAI", "20 million"),
      panel("live:grok-5", "Grok 5", "xAI", "17 million", "Around **17 million** electric cars were sold in 2025, if you count only battery-electric models and leave plug-in hybrids out."),
      panel("live:deepseek-v4", "DeepSeek V4", "DeepSeek", "18 million", "Sales reached roughly 18 million; the higher figures include commercial vans."),
    ],
    consensus: { level: "partial", score: 64, agree: 3, disagree: 2, missing: 0, responded: 5, consulted: 5, summary: "Three of five models agree on the 2025 figure; two count fewer by excluding hybrids or vans.", majorityStance: "20 million" },
  }),
);

const RANKED = done(
  "ranked",
  base({
    markdown: "For long-distance comfort on a mid-range budget, **the Sony WH-1000XM6 is the pick**; the Bose is the most comfortable for long flights.",
    rich: {
      blocks: [
        {
          type: "ranked",
          title: "Best noise-canceling headphones",
          note: "Ranked by noise canceling, comfort and battery, as the models weighed them.",
          items: [
            { rank: 1, name: "Sony WH-1000XM6", maker: "Sony", why: "The strongest noise canceling and a 30-hour battery.", tags: ["ANC", "30 h"], score: "9.2" },
            { rank: 2, name: "Bose QuietComfort Ultra", maker: "Bose", why: "The most comfortable over a long flight.", tags: ["Comfort"] },
            { rank: 3, name: "Apple AirPods Max 2", maker: "Apple", why: "Best if you live in Apple's ecosystem.", tags: ["iOS"] },
          ],
        },
        { type: "steps", title: "Before you buy", items: [{ title: "Try the fit", body: "Clamp force varies more than specs suggest." }, { title: "Check codec support", body: "LDAC matters only on Android." }] },
      ],
    },
    models: [panel("live:claude-sonnet-5", "Claude Sonnet 5", "Anthropic", "sony"), panel("live:gpt-6", "GPT-6", "OpenAI", "sony"), panel("live:mistral-large-3", "Mistral Large 3", "Mistral", "sony")],
    consensus: { level: "consensus", score: 88, agree: 3, disagree: 0, missing: 0, responded: 3, consulted: 3, summary: "All three models rank the Sony first.", majorityStance: "sony" },
  }),
);

const STREAMING: KeplarMessage = {
  id: "stream",
  role: "keplar",
  replyTo: "u-stream",
  status: "running",
  mode: "consensus",
  stages: [
    { id: "understand", status: "done" },
    { id: "select", status: "done" },
    { id: "compare", status: "done" },
    { id: "synthesize", status: "active" },
  ],
  capabilities: ["Reasoning"],
  models: [
    { id: "live:claude-sonnet-5", name: "Claude Sonnet 5", status: "responded" },
    { id: "live:gpt-6", name: "GPT-6", status: "responded" },
    { id: "live:gemini-3.8-pro", name: "Gemini 3.8 Pro", status: "responded" },
  ],
  modelCount: 3,
  draft: "The short answer: **yes, refinance** if the new rate is at least 0.75 points lower and you plan to stay five more years.\n\n## The break-even point\n\nDivide the closing costs by the monthly saving to see how many months it takes to",
  startedAt: T0,
};

const CASES: { id: string; title: string; msg: KeplarMessage }[] = [
  { id: "disagree", title: "Consensus with a dissent and sources", msg: DISAGREE },
  { id: "table", title: "Table and code", msg: TABLE },
  { id: "research", title: "Deep Research with citations", msg: RESEARCH },
  { id: "ranked", title: "Ranking and steps", msg: RANKED },
  { id: "stream", title: "Streaming", msg: STREAMING },
];

const QUESTIONS: Record<string, string> = {
  disagree: "How should I store product attributes that vary a lot between categories?",
  table: "Which RDS instance should I use for a 50 GB read-heavy database?",
  research: "How fast are electric car sales growing?",
  ranked: "What are the best noise-canceling headphones?",
};
const DEMO_THREAD = "orbit-answers-demo";

/** Dev only: put the finished mock answers in this browser's signed-out chats and open the app on them (the real thread, shell and canvas). */
function openInApp() {
  const messages: Message[] = CASES.filter((c) => c.msg.status === "done").flatMap((c, i): Message[] => [
    { id: `u-${c.id}`, role: "user", text: QUESTIONS[c.id] ?? c.title, attachments: [], modes: { web: false, deepResearch: c.id === "research", create: false, agent: false }, createdAt: T0 + i * 60_000 },
    c.msg,
  ]);
  const thread: Thread = { id: DEMO_THREAD, title: "Orbit answers (demo)", projectId: null, createdAt: T0, updatedAt: Date.now(), messages };
  try {
    const saved = JSON.parse(localStorage.getItem(ANON_KEY) ?? "{}") as { threads?: Thread[] };
    const threads = [thread, ...(saved.threads ?? []).filter((x) => x.id !== DEMO_THREAD)];
    localStorage.setItem(ANON_KEY, JSON.stringify({ ...saved, threads, activeThreadId: DEMO_THREAD }));
    window.location.assign("/");
  } catch {
    /* storage unavailable */
  }
}

export function AnswersShowcase() {
  const noop = () => undefined;
  return (
    <section className={s.section} aria-labelledby="o-answers" data-answers-showcase="">
      <h2 id="o-answers" className={s.h2}>Answers</h2>
      <p className={s.note}>The Consensus answer layout, rendered by the real KeplarTurn from fixed mock answers.</p>
      <div className={s.row}>
        <button type="button" className={s.devLink} onClick={openInApp} data-open-answers-in-app="">Open these answers in the app</button>
      </div>
      <div className={s.answers}>
        {CASES.map((c) => (
          <div key={c.id} className={s.answerCase} data-case={c.id}>
            <h3 className={s.h3}>{c.title}</h3>
            <KeplarTurn message={c.msg} onRetry={noop} onSignal={noop} onAsk={noop} ledger={LEDGER} isLast={c.id !== "table"} />
          </div>
        ))}
      </div>
    </section>
  );
}
