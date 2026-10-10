import { brand } from "./site";
/**
 * Content for the homepage product demo. This is an illustrative example of the
 * Keplar answer format (labeled as such in the UI), not a claim about real
 * results, customers, or benchmarks.
 */

export type DemoStepId =
  | "understand"
  | "select"
  | "compare"
  | "disagree"
  | "verify"
  | "synthesize";

export const demoQuestion = "Should I buy a home this year or keep renting?";

export const demoSteps: { id: DemoStepId; label: string; done: string; ms: number }[] = [
  { id: "understand", label: "Understanding request…", done: "Understood request", ms: 1000 },
  { id: "select", label: "Selecting intelligence…", done: "Selected 6 intelligences", ms: 1500 },
  { id: "compare", label: "Comparing…", done: "Compared 6 responses", ms: 1400 },
  { id: "disagree", label: "Disagreement detected", done: "1 disagreement investigated", ms: 1200 },
  { id: "verify", label: "Verifying…", done: "Weighed evidence and reasoning", ms: 1200 },
  { id: "synthesize", label: "Synthesizing…", done: "Synthesized one answer", ms: 1000 },
];

export const demoIntelligences = ["Research", "Reasoning", "Personal Finance", "Housing", "Tax", "Risk"];

/** Thread titles shown in the demo window. */
export const demoThreadTitle = "Rent or buy";
export const demoRecent = ["Biology test prep", "Lisbon trip"];

export const demoAnswer = {
  consensus: 87,
  agree: 5,
  disagree: 1,
  summary:
    "Keep renting for now, unless you expect to stay put for many years. Buying makes more sense once your timeline and savings line up.",
  body:
    "The analyses agree that the answer depends less on the market than on your situation: how long you'll stay, how much you'll have saved beyond the down payment, and how steady your income is. Renting keeps you flexible while you build that cushion. This is general information, not financial advice.",
  sections: [
    {
      id: "consensus",
      title: "Consensus",
      meta: "87% · 5 agree, 1 disagrees",
      body:
        "Five intelligences recommended renting for now. One recommended buying this year. Consensus reflects agreement after verification, weighted by the strength of evidence. It is not a vote count, and it can be wrong.",
    },
    {
      id: "models",
      title: "Models consulted",
      meta: `6 selected by ${brand.engineName}`,
      body:
        `Research, Reasoning, Personal Finance, Housing, Tax, Risk. ${brand.engineName} chose these for a big personal money decision, balancing quality, reliability, latency, and cost. Other available intelligences were not needed.`,
    },
    {
      id: "sources",
      title: "Sources",
      meta: "Your notes and cited sources",
      body:
        "Your attached budget, plus the public housing and tax guidance the intelligences cited. These are the sources the models cite. Keplar lists them; it hasn't checked them.",
    },
    {
      id: "disagreements",
      title: "Disagreements",
      meta: "1 · timing",
      body:
        "Housing recommended buying this year, arguing that rent builds no equity. Keplar did not discard it. The point held up for long stays, so it shaped the answer: buy once you know you'll stay.",
    },
    {
      id: "verification",
      title: "Verification",
      meta: "Evidence weighed",
      body:
        "The evidence and reasoning behind each response were weighed before synthesis. One claim about where prices are headed had no support in the reasoning and was left out.",
    },
    {
      id: "reasoning",
      title: "Reasoning summary",
      meta: "How the answer was formed",
      body:
        "Agreement that timing depends on your situation. Disagreement on whether to act now. The evidence favored keeping flexibility while testing the dissent's point against how long you plan to stay.",
    },
  ],
} as const;

export const appSidebar = ["New chat", "Search", "Create", "Agents", "Projects"];
export const composerTools = ["Attach", "Web", "Deep Research", "Create", "Agent"];
