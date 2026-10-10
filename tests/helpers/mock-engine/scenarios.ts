/**
 * Demo content for the mock providers. Each script describes what independent
 * models would say about a known prompt (their stance and claims) and how
 * Keplar would write the synthesized answer. Unknown prompts fall back to an
 * honest response that explains the plan instead of inventing an answer.
 *
 * Everything here is illustrative demo output and is labelled as such in the UI.
 * It contains no statistics, benchmarks, customer names or citations.
 */
import { brand } from "@/lib/site";
import type { ConsensusLevel, KeplarRequest, VerificationCheckKind, VerificationOutcome } from "@/lib/orchestration/types";

export type ScriptClaim = { text: string; supported: boolean };

/**
 * A scripted verifier finding. `stances` names the positions it concerns; the
 * check is shown only if a model holding one of them responded in this run.
 */
export type ScriptCheck = {
  kind: Exclude<VerificationCheckKind, "web">;
  stances: string[];
  finding: string;
  outcome: VerificationOutcome;
  resolution: string;
};

export type ScriptPosition = {
  label: string;
  summary: string;
  claims: ScriptClaim[];
};

export type AnswerContext = {
  level: ConsensusLevel;
  majority: string | null;
  positions: { stance: string; label: string; summary: string; count: number }[];
  req: KeplarRequest;
  modelCount: number;
  failed: number;
};

export type Script = {
  id: string;
  match: (prompt: string) => boolean;
  /** Stance per panel model, in panel order. `force` is the demo scenario override. */
  stances: (n: number, force?: "partial" | "none") => string[];
  positions: Record<string, ScriptPosition>;
  topic: string;
  answer: (ctx: AnswerContext) => string;
  reasoning: (ctx: AnswerContext) => string;
  resolution: (ctx: AnswerContext) => string;
  verificationNotes: string[];
  /** What the verifier found reviewing the draft against the responses. */
  checks: ScriptCheck[];
};

const fill = (n: number, pattern: string[]) => Array.from({ length: n }, (_, i) => pattern[i] ?? pattern[pattern.length - 1]);

/** 3/2 style split for a forced partial consensus, and a three-way split for none. */
function forced(n: number, force: "partial" | "none" | undefined, a: string, b: string, c: string): string[] | null {
  if (force === "partial") {
    const agree = Math.max(1, Math.ceil(n * 0.6));
    return Array.from({ length: n }, (_, i) => (i < agree ? a : b));
  }
  if (force === "none") return Array.from({ length: n }, (_, i) => [a, b, c][i % 3]);
  return null;
}

const splitNote = (ctx: AnswerContext) =>
  ctx.positions.map((p) => `- **${p.label}** (${p.count} of ${ctx.modelCount - ctx.failed}). ${p.summary}`).join("\n");

/* ───────────────────────── Japan expansion (strategy) ───────────────────────── */

const japan: Script = {
  id: "japan",
  match: (p) => /japan/i.test(p) && /expan|enter|launch|market/i.test(p),
  stances: (n, force) => forced(n, force, "stage", "wait", "full") ?? fill(n, [...Array(Math.max(0, n - 1)).fill("stage"), n > 1 ? "wait" : "stage"]),
  positions: {
    stage: {
      label: "Expand, staged",
      summary: "Enter next year through a partner-led pilot, then decide on a local entity.",
      claims: [
        { text: "Strategic fit is strong for a product already selling to similar customers elsewhere.", supported: true },
        { text: "A partner-led pilot limits upfront fixed cost.", supported: true },
        { text: "Enterprise sales cycles in the market tend to be long, so early signal matters.", supported: true },
      ],
    },
    wait: {
      label: "Wait a year",
      summary: "Localization cost could exceed early revenue; revisit when the product is localized.",
      claims: [
        { text: "Localization is a prerequisite for most enterprise buyers.", supported: true },
        { text: "Hiring a local team takes under three months.", supported: false },
      ],
    },
    full: {
      label: "Full launch",
      summary: "Open a local entity and team immediately to move faster than competitors.",
      claims: [{ text: "Speed of entry outweighs the fixed cost of a local entity.", supported: false }],
    },
  },
  topic: "Timing",
  answer: (ctx) => {
    if (ctx.level === "none") {
      return `**No consensus on timing.** The models agree Japan is a credible market for you, but they split on when and how to enter, and weighing their evidence and reasoning didn't settle it.

${splitNote(ctx)}

### What would settle it
- A realistic localization estimate for your product. If it is large, waiting is the stronger case.
- Whether an existing customer is asking you to support Japan. Inbound demand favours entering now.
- Your runway. A local entity is a fixed cost that is hard to reverse.

Treat this as a decision to make with your own numbers, not one to delegate.`;
    }
    const lead =
      ctx.level === "partial"
        ? `**Probably yes, but the case is closer than it looks.** A staged entry is the leading position, but a substantial minority argues for waiting, and their localization concern held up when Keplar weighed the evidence and reasoning.`
        : `**Yes, but stage it.** Start with a partner-led pilot in the second half of next year rather than opening a local entity immediately.`;
    return `${lead}

The models agree on the opportunity and the strategic fit. They differ on timing: localization and longer enterprise sales cycles could make a full launch expensive before demand is proven. A pilot tests those costs directly and keeps the option to scale the following year.

### Recommended sequence

| Phase | Timing | What it tests | Move on when |
|---|---|---|---|
| Partner pilot | Second half of next year | Demand and sales-cycle length | Pilots convert to paid contracts |
| Localization | Alongside the pilot | The real cost of localizing | Cost is within plan |
| Local entity | The following year | Scale economics | Pipeline justifies local headcount |

### What would change this answer
- If your product needs significant localization before any sale, waiting a year becomes the stronger option.
- If an existing customer is asking you to support Japan, move the pilot earlier.

### Before you decide
Confirm company registration, tax, and data-residency obligations with local counsel. This is a starting point for your decision, not legal or financial advice.`;
  },
  reasoning: (ctx) =>
    ctx.level === "none"
      ? "The models agreed on market fit but not on timing. The evidence for each timing position was comparable, so Keplar presents the positions instead of choosing one."
      : "Agreement on demand and fit. Disagreement on timing. The evidence favoured keeping the upside while testing the cost assumptions behind the dissent, which is why the recommendation is staged.",
  resolution: (ctx) =>
    ctx.level === "none"
      ? "Unresolved. Each position rests on assumptions only your own numbers can test."
      : "The dissent was not discarded. Its localization concern was well reasoned and shaped the answer: a staged pilot instead of a full launch. Its hiring-timeline claim was weakly supported and left out.",
  checks: [
    {
      kind: "unsupported",
      stances: ["wait"],
      finding: "One response said a local team can be hired in under three months. None of the other responses supported that, and it sits oddly with the same response's case for waiting.",
      outcome: "removed",
      resolution: "Left out. The answer treats the time to build a local team as unknown and something the pilot should find out.",
    },
    {
      kind: "contradiction",
      stances: ["stage"],
      finding: "The draft said the pilot needs no localization. The staged-entry responses said localized sales and support material is needed before a pilot starts.",
      outcome: "revised",
      resolution: "The answer now says the pilot needs localized sales and support material, but not a fully localized product.",
    },
    {
      kind: "reasoning",
      stances: ["full"],
      finding: "The full-launch case assumes entering first wins the market, but gives no reason that holds when enterprise sales cycles are long.",
      outcome: "kept-as-dissent",
      resolution: "Shown as a minority position, without the speed-of-entry claim.",
    },
    {
      kind: "unsupported",
      stances: ["wait"],
      finding: "The point that most enterprise buyers expect a localized product came from the minority. The majority didn't address it, and nothing in their reasoning contradicts it.",
      outcome: "held",
      resolution: "Kept. It is why the answer recommends a partner-led pilot rather than a full launch.",
    },
  ],
  verificationNotes: [
    "Regulatory statements are framed as items to confirm, not as facts.",
  ],
};

/* ───────────────────────────── Debounce hook (code) ───────────────────────────── */

const debounce: Script = {
  id: "debounce",
  match: (p) => /debounce/i.test(p),
  stances: (n, force) => forced(n, force, "value-hook", "callback-hook", "lodash") ?? fill(n, ["value-hook"]),
  positions: {
    "value-hook": {
      label: "Debounce the value",
      summary: "A hook that returns a debounced copy of a value, cleared on change and unmount.",
      claims: [
        { text: "The timeout must be cleared in the effect cleanup to avoid stale updates.", supported: true },
        { text: "Generic typing keeps the hook reusable for any value.", supported: true },
      ],
    },
    "callback-hook": {
      label: "Debounce the callback",
      summary: "A hook that returns a stable debounced function, better for event handlers.",
      claims: [{ text: "A ref keeps the latest callback without resetting the timer.", supported: true }],
    },
    lodash: {
      label: "Use a library",
      summary: "Import a battle-tested debounce utility instead of writing one.",
      claims: [{ text: "Adding a dependency is always preferable to 15 lines of code.", supported: false }],
    },
  },
  topic: "Approach",
  answer: (ctx) => `${ctx.level === "consensus" || ctx.level === "single" ? "Here's a small, typed hook that debounces a value. It clears its timer on every change and on unmount, so it never sets state after the component is gone." : "The models split between debouncing the **value** and debouncing the **callback**. Both are correct; which one you want depends on the call site. The value version is below."}

\`\`\`tsx
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
\`\`\`

Use it where a value changes quickly and something expensive depends on it:

\`\`\`tsx
const [query, setQuery] = useState("");
const debouncedQuery = useDebouncedValue(query, 300);

useEffect(() => {
  if (debouncedQuery) search(debouncedQuery);
}, [debouncedQuery]);
\`\`\`

**When to debounce the callback instead.** If you're debouncing an event handler (resize, scroll, autosave), return a stable function and keep the latest callback in a ref, so re-renders don't reset the timer.`,
  reasoning: () => "All responding models produced the same core pattern. Keplar weighed each response's reasoning about the cleanup path under rapid changes and unmount; no gaps found.",
  resolution: () => "Both hook shapes are valid. The answer leads with the value hook and explains when the callback version is the better fit.",
  checks: [
    {
      kind: "contradiction",
      stances: ["value-hook"],
      finding: "One response cleared the timer only on unmount. The draft and the other responses clear it on every value change as well.",
      outcome: "revised",
      resolution: "The code clears the timer in the effect cleanup, which runs on every change and on unmount.",
    },
    {
      kind: "reasoning",
      stances: ["lodash"],
      finding: "\u201cAlways add a dependency instead of 15 lines\u201d doesn't follow. It ignores bundle size and how small the hook is.",
      outcome: "removed",
      resolution: "Left out. A library is mentioned as an option, not as a rule.",
    },
    {
      kind: "unsupported",
      stances: ["callback-hook"],
      finding: "Debouncing the callback instead of the value was raised by one model. The others didn't dispute it; they answered a slightly different question.",
      outcome: "kept-as-dissent",
      resolution: "Mentioned after the code as the better fit for event handlers.",
    },
  ],
  verificationNotes: ["The responses agree the generic signature is valid under strict TypeScript."],
};

/* ─────────────────────────── Database comparison (table) ─────────────────────────── */

const databases: Script = {
  id: "databases",
  match: (p) => /(postgres|dynamo|mongo)/i.test(p),
  stances: (n, force) => forced(n, force, "postgres", "dynamodb", "mongodb") ?? fill(n, [...Array(Math.max(0, n - 1)).fill("postgres"), n > 1 ? "dynamodb" : "postgres"]),
  positions: {
    postgres: {
      label: "Postgres by default",
      summary: "Relational model, row-level security for tenant isolation, and the most query flexibility.",
      claims: [
        { text: "Row-level security can enforce tenant isolation in the database.", supported: true },
        { text: "Relational constraints catch cross-tenant data bugs early.", supported: true },
      ],
    },
    dynamodb: {
      label: "DynamoDB at very high scale",
      summary: "Predictable performance for key-value access patterns if they are known up front.",
      claims: [
        { text: "Access patterns must be designed before the schema.", supported: true },
        { text: "It is cheaper than Postgres for every workload.", supported: false },
      ],
    },
    mongodb: {
      label: "MongoDB for flexible documents",
      summary: "Useful when tenant data shapes vary widely.",
      claims: [{ text: "Schema flexibility helps when tenant data varies.", supported: true }],
    },
  },
  topic: "Default choice",
  answer: (ctx) => `${ctx.level === "none" ? "**No single recommendation.** The right choice depends on access patterns you haven't specified yet." : "**Start with Postgres** unless you already know your access patterns and expect very high, uniform key-value traffic."}

| | Postgres | DynamoDB | MongoDB |
|---|---|---|---|
| Tenant isolation | Row-level security, schema per tenant, or database per tenant | Partition key per tenant; isolation enforced in application code and IAM | Field-level tenant key; isolation enforced in application code |
| Query flexibility | Highest: joins, ad-hoc queries, reporting | Lowest: design queries before the schema | Medium: flexible documents, aggregation pipeline |
| Scaling model | Vertical first, then read replicas and partitioning | Horizontal, managed | Horizontal via sharding |
| Operational load | Moderate (managed options reduce it) | Low | Moderate |
| Best fit | Most B2B SaaS, especially with reporting | Known, high-volume key-value access | Varied document shapes per tenant |

### Why Postgres is the default
Most multi-tenant products need reporting, admin views and occasional ad-hoc queries. Postgres handles all three, and row-level security lets the database enforce isolation rather than every query remembering a \`WHERE tenant_id = …\`.

### The dissent
${ctx.level === "consensus" ? "One model argued for DynamoDB. Its point about designing access patterns first is right for very high-scale workloads. Its cost claim didn't hold up and was removed." : splitNote(ctx)}`,
  reasoning: () => "The models agree on the trade-offs; they weigh them differently. Postgres wins on flexibility for the typical case; DynamoDB wins only when access patterns are fixed and traffic is very high.",
  resolution: (ctx) => (ctx.level === "consensus" ? "Kept as a conditional recommendation for very high, known-pattern workloads." : "Left open: depends on access patterns."),
  checks: [
    {
      kind: "unsupported",
      stances: ["dynamodb"],
      finding: "One response said DynamoDB is cheaper than Postgres for every workload. The others didn't support it, and their reasoning about access patterns cuts against it.",
      outcome: "removed",
      resolution: "Left out. Cost is described as depending on access patterns and traffic shape.",
    },
    {
      kind: "reasoning",
      stances: ["postgres"],
      finding: "The draft implied row-level security alone guarantees tenant isolation. The responses say it also depends on setting the tenant on every connection.",
      outcome: "revised",
      resolution: "The answer now says row-level security isolates tenants only if every connection sets the tenant context.",
    },
    {
      kind: "contradiction",
      stances: ["mongodb", "postgres"],
      finding: "Schema flexibility and strict relational constraints were both presented as advantages for the same tenant data.",
      outcome: "revised",
      resolution: "The table shows them as a trade-off: flexibility under MongoDB, constraints under Postgres.",
    },
  ],
  verificationNotes: ["No vendor prices or benchmark figures are quoted in the answer."],
};

/* ───────────────────────────── Remote work (no consensus) ───────────────────────────── */

const remote: Script = {
  id: "remote",
  match: (p) => /remote/i.test(p) && /(20[3-9]\d|future|default|still)/i.test(p),
  stances: (n, force) => {
    if (force === "partial") return forced(n, force, "hybrid", "office", "remote")!;
    return Array.from({ length: n }, (_, i) => ["hybrid", "office", "hybrid", "office", "remote", "remote"][i] ?? "hybrid");
  },
  positions: {
    hybrid: {
      label: "Hybrid becomes the default",
      summary: "Most companies settle on a few office days, with fully remote as a minority.",
      claims: [{ text: "Hybrid arrangements balance recruiting reach and in-person collaboration.", supported: true }],
    },
    office: {
      label: "Office-first returns",
      summary: "Large employers keep pulling toward office-first, and smaller firms follow.",
      claims: [{ text: "Several large employers have tightened office attendance policies.", supported: true }],
    },
    remote: {
      label: "Remote stays the default",
      summary: "Tooling and hiring economics keep remote-first dominant for software teams.",
      claims: [{ text: "Remote hiring widens the candidate pool.", supported: true }],
    },
  },
  topic: "The default work model in 2030",
  answer: (ctx) =>
    ctx.level === "none"
      ? `**No consensus.** This is a forecast, and the models genuinely disagree. Each position is supported by current evidence; none of it can settle what happens in 2030.

${splitNote(ctx)}

### How to use this
If you're making a decision that depends on this (office lease, hiring plan), plan for the scenario that would hurt most if you guessed wrong, and revisit yearly.`
      : `**Hybrid is the leading view, but it's contested.**

${splitNote(ctx)}

Forecasts this far out are low-confidence by nature. Plan for more than one outcome.`,
  reasoning: () => "Positions were comparably supported. Keplar did not break the tie by majority, because a vote on a forecast is not evidence.",
  resolution: () => "Unresolved by design: the question is a forecast and the evidence supports several futures.",
  checks: [
    {
      kind: "reasoning",
      stances: ["office"],
      finding: "The office-first case generalizes from large employers to the whole industry without saying why smaller firms would follow.",
      outcome: "kept-as-dissent",
      resolution: "Shown as one of the positions, with that gap noted.",
    },
    {
      kind: "unsupported",
      stances: ["remote"],
      finding: "A wider candidate pool doesn't by itself make remote the default. Other models accepted the premise but not the conclusion.",
      outcome: "revised",
      resolution: "The answer keeps the premise and drops the conclusion.",
    },
    {
      kind: "contradiction",
      stances: ["hybrid"],
      finding: "The draft called hybrid \u201cthe likely default\u201d, which overstates a panel that split.",
      outcome: "revised",
      resolution: "Reworded as the most common position among the models, not a prediction.",
    },
  ],
  verificationNotes: ["All claims were framed as trends, not predictions.", "No statistics were included: none were supported by evidence in the responses."],
};

/* ─────────────────────────────── Simple facts ─────────────────────────────── */

const simpleFacts: { match: RegExp; answer: string }[] = [
  {
    match: /time ?zones?.*japan|japan.*time ?zones?/i,
    answer: "Japan has **one time zone**, Japan Standard Time (JST), which is UTC+9. It doesn't observe daylight saving time.",
  },
  { match: /capital of australia/i, answer: "The capital of Australia is **Canberra**." },
];

export function simpleAnswer(prompt: string): string | null {
  return simpleFacts.find((f) => f.match.test(prompt))?.answer ?? null;
}

/* ─────────────────────────────── Fallback ─────────────────────────────── */

const fallback: Script = {
  id: "fallback",
  match: () => true,
  stances: (n, force) => forced(n, force, "a", "b", "c") ?? fill(n, ["a"]),
  positions: {
    a: { label: "Primary reading", summary: "Answers the request as written.", claims: [{ text: "The request is answerable as stated.", supported: true }] },
    b: { label: "Alternative reading", summary: "Interprets an ambiguous part of the request differently.", claims: [{ text: "The request has a second plausible reading.", supported: true }] },
    c: { label: "Needs more context", summary: "Asks for missing details before committing to an answer.", claims: [{ text: "Key constraints are missing from the request.", supported: true }] },
  },
  topic: "Interpretation",
  answer: (ctx) => `This is the Keplar demo, so no live models were called and there's no real answer to show for this question yet. Here is what ${brand.engineName} would do with it.

**Plan.** ${ctx.modelCount > 1 ? `Ask ${ctx.modelCount} independent models from different families, compare their answers claim by claim, weigh the evidence and reasoning behind each response, and synthesize one answer.` : "Ask one fast model, because the request is short and well-defined."} Open **Models consulted** below to see which models were selected and why.

${ctx.level === "none" || ctx.level === "partial" ? `**Consensus (simulated).** ${ctx.level === "none" ? "The panel split three ways" : "The panel mostly agreed"}, so the answer would lay out the positions instead of hiding the disagreement:\n\n${splitNote(ctx)}\n\n` : ""}Try one of the example prompts on the empty thread to see full demo answers with tables, code and disagreements.`,
  reasoning: (ctx) => `Routing reflects the classification of your request (${ctx.modelCount > 1 ? "multi-model consensus" : "single model"}). Answer content is placeholder demo output.`,
  resolution: () => "Simulated disagreement. In the live product the positions would come from the models' own answers.",
  checks: [
    {
      kind: "unsupported",
      stances: ["b", "c"],
      finding: "Demo: some models read the request differently or asked for missing details, and the others didn't address that.",
      outcome: "kept-as-dissent",
      resolution: "Demo: laid out as a separate position instead of being dropped.",
    },
  ],
  verificationNotes: ["Demo run: the evaluation of evidence and reasoning is simulated."],
};

export const scripts: Script[] = [japan, debounce, databases, remote];

export function pickScript(prompt: string): Script {
  return scripts.find((s) => s.match(prompt)) ?? fallback;
}

export const examplePrompts = [
  { label: "Should our company expand into Japan next year?", hint: "Strategy · several models" },
  { label: "Compare Postgres, DynamoDB and MongoDB for a multi-tenant SaaS.", hint: "Analysis · table" },
  { label: "Write a debounce hook in TypeScript.", hint: "Code" },
  { label: "Will remote work still be the default for tech companies in 2030?", hint: "Forecast · contested" },
  { label: "How many time zones does Japan have?", hint: "Simple · one model" },
];
