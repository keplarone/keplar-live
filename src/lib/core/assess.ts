/**
 * Adaptive routing: how hard is this question, what kind of work does it need, and how deep should Core go?
 * Pure and fast (regex + counts, well under a millisecond), so the fast path never waits on it.
 */
import { HeuristicClassifier, isMultiStep } from "@/lib/orchestration/classifier";
import type { Classification, KeplarRequest } from "@/lib/orchestration/types";
import type { Depth, ResolvedDepth } from "./types";

export type Domain = "math" | "code" | "science" | "finance" | "law" | "health" | "writing" | "factual" | "planning" | "general";

export type Assessment = {
  /** 0 (trivial) to 1 (very hard). */
  difficulty: number;
  domains: Domain[];
  needs: { math: boolean; code: boolean; web: boolean; multiStep: boolean; longContext: boolean };
  depth: ResolvedDepth;
  asked: Depth;
  escalated: boolean;
  reason: string;
  classification: Classification;
};

const RX = {
  // Stems take their usual endings ("compounded", "percentage", "averaged"): a bare \b after the stem missed them.
  mathOp: /\b(solve|equations?|integrals?|derivatives?|probabilit(y|ies)|expected value|how many|how much|total|percent(age)?s?|ratios?|rates?|averag(e|ed|es)|mean|median|compound(ed|ing)?|interest|minimum|maximum|optimi[sz]e|prove|proof|theorem|combinations?|permutations?|factorial|primes?|modulo|remainder|area|volume|perimeter|speed|distance|annual(ly)?|monthly|per year|per month)\b|\d\s*%/i,
  code: /\b(code|function|implement|algorithm|bug|debug|refactor|typescript|javascript|python|rust|sql|regex|api|class|unit tests?|complexity|big-?o|recursion|compile|stack trace)\b|```/i,
  science: /\b(physics|chemistry|biology|molecule|quantum|energy|force|reaction|cell|gene|evolution|thermodynamic|entropy)\b/i,
  finance: /\b(revenue|margin|valuation|cash flow|npv|irr|roi|budget|invest|loan|mortgage|tax|pricing|profit)\b/i,
  law: /\b(law|legal|contract|liability|regulation|compliance|gdpr|court|statute)\b/i,
  health: /\b(symptom|diagnos|dose|medication|treatment|disease|health|nutrition)\b/i,
  writing: /\b(write|draft|rewrite|essay|email|story|poem|edit|tone)\b/i,
  planning: /\b(plan|roadmap|schedule|strategy|steps to|how do i|how should i|migrate|launch)\b/i,
  hard: /\b(prove|proof|derive|step[- ]by[- ]step|trade-?offs?|root cause|architecture|optimi[sz]e|algorithm|time complexity|distributed|concurrency|race condition|deadlock|design an?|how would you|edge cases?|invariant|counterexample|first principles|rigorous|puzzle|riddle|logic)\b/i,
  web: /\b(latest|today|this week|current|news|recent|price of|stock|2026|2027)\b/i,
};

const numbers = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).length;
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const classifier = new HeuristicClassifier();

/** Paths Core never takes over: they have their own engines (small talk, Create, agents, Deep Research, Debate, vision). */
export function coreApplies(req: KeplarRequest): boolean {
  const m = req.modes ?? {};
  if (m.create || m.agent || m.deepResearch || m.debate) return false;
  if (req.understanding?.intent === "playful") return false;
  return true;
}

export function assess(req: KeplarRequest, asked: Depth = "auto"): Assessment {
  const p = req.prompt.trim();
  const c = classifier.classify(req);
  const n = wordCount(p);
  const nums = numbers(p);
  const historyChars = (req.history ?? []).reduce((a, h) => a + h.text.length, 0);
  const docChars = (req.docs ?? []).reduce((a, d) => a + d.text.length, 0);
  const needs = {
    math: (nums >= 2 && RX.mathOp.test(p)) || c.errorProne === "exact" || /\b(prove|integral|derivative|equation)\b/i.test(p),
    code: c.kind === "code" || RX.code.test(p),
    web: Boolean(req.modes?.web) || RX.web.test(p),
    multiStep: n >= 8 && isMultiStep(p),
    longContext: historyChars > 24_000 || docChars > 30_000,
  };
  const domains: Domain[] = [];
  if (needs.math) domains.push("math");
  if (needs.code) domains.push("code");
  for (const d of ["science", "finance", "law", "health", "writing", "planning"] as const) if (RX[d].test(p)) domains.push(d);
  if (c.kind === "factual" && !domains.length) domains.push("factual");
  if (!domains.length) domains.push("general");

  let d = 0;
  d += c.complexity === "complex" ? 0.4 : c.complexity === "moderate" ? 0.2 : 0;
  // Each distinct hard signal counts ("design" + "distributed" is harder than either alone), up to three.
  const hardHits = new Set((p.match(new RegExp(RX.hard.source, "gi")) ?? []).map((h) => h.toLowerCase())).size;
  d += Math.min(hardHits, 3) * 0.1 + (hardHits ? 0.1 : 0);
  // A proof is checked work by definition.
  if (/\b(prove|proof|derive)\b/i.test(p)) d += 0.15;
  if (needs.multiStep) d += 0.15;
  // Arithmetic with real quantities (money over time, percentages, word problems) gets its numbers computed and checked.
  if (needs.math && nums >= 2) d += 0.15;
  if (needs.math && nums >= 3) d += 0.05;
  // Money over time (compounding, loans, mortgages, APR) is multi-step arithmetic models often get wrong: compute it.
  const moneyOverTime = needs.math && nums >= 2 && /\b(compound(ed|ing)?|loan|mortgage|apr|amorti[sz]|invest(ed|ing|ment)?|annuit(y|ies)|refinanc)/i.test(p);
  if (needs.code && /\b(implement|write|build|design|fix|debug)\b/i.test(p)) d += 0.1;
  if (needs.longContext) d += 0.1;
  if (n > 80) d += 0.1;
  if (domains.length >= 3) d += 0.05;
  if (c.kind === "factual" && n <= 14 && !needs.math) d = Math.min(d, 0.15);
  if (moneyOverTime) d = Math.max(d, 0.55);
  if (req.media?.images?.length) d = Math.min(d, 0.5); // vision questions keep the vision panel; Core can't see the pixels
  // Round before the threshold: 0.2 + 0.15 + 0.05 + 0.15 is 0.5499999… in floating point and silently missed 0.55.
  d = Math.round(Math.max(0, Math.min(1, d)) * 100) / 100;

  let depth: ResolvedDepth;
  let reason: string;
  if (asked !== "auto") {
    depth = asked;
    reason = asked === "quick" ? "You picked Quick: one pass, no extra steps." : asked === "thorough" ? "You picked Thorough: Keplar plans, works through the steps and checks its answer." : "You picked Exhaustive: Keplar keeps planning, checking and revising until the answer passes its checks or the plan's limit is reached.";
  } else if (d >= 0.55) {
    depth = "thorough";
    reason = needs.math ? "This needs exact working, so Keplar plans the steps and runs the math to check it." : needs.code ? "This is a real coding task, so Keplar plans it, writes the code and tests what it can." : needs.multiStep ? "This has several parts, so Keplar plans them and checks each one." : "This is a hard question, so Keplar plans the work and checks its answer before showing it.";
  } else {
    depth = "quick";
    reason = "A clear question: answered directly.";
  }
  return { difficulty: Math.round(d * 100) / 100, domains, needs, depth, asked, escalated: false, reason, classification: c };
}

/** Reads the depth the composer sent (routing.depth). Anything unknown is "auto". */
export function depthOf(v: unknown): Depth {
  return v === "quick" || v === "thorough" || v === "exhaustive" ? v : "auto";
}
