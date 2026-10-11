/**
 * Keplar Business research and reasoning templates (shared by the browser and tests; no server imports). Each turns the
 * person's input into a request for Keplar's engine with a business-specific structure the report must follow.
 */

export const RESEARCH_TEMPLATES = [
  { id: "competitors", label: "Competitor analysis", hint: "Company or product, and the market", placeholder: "Notion vs Coda vs Confluence for 50-person product teams",
    structure: "Structure the report as: Summary; Competitor overview (a table of each competitor with positioning, target customer, pricing and notable strengths and weaknesses); Feature and pricing comparison; Where each is winning and why; Gaps and openings for us; Recommended moves; Open questions." },
  { id: "market", label: "Market intelligence", hint: "Market or category", placeholder: "AI note-taking apps for healthcare in the US",
    structure: "Structure the report as: Summary; Market definition and segments; Size and growth (state each figure with its source and year; if sources disagree, show the range and say why); Customers and buying behaviour; Key players; Trends and drivers; Risks and barriers; Opportunities; Open questions." },
  { id: "company", label: "Company research", hint: "Company name and website", placeholder: "Linear (linear.app)",
    structure: "Structure the report as: Summary; What the company does and for whom; Products and pricing; Business model and traction (only figures that are publicly reported, with sources); Team and funding; Recent news; Strengths, weaknesses and risks; What this means for us." },
  { id: "industry", label: "Industry report", hint: "Industry and region", placeholder: "Independent coffee roasters in the UK",
    structure: "Structure the report as: Executive summary; Industry overview; Value chain; Economics (margins, costs, pricing where publicly reported); Regulation; Major players; Trends to watch in the next 2-3 years; Implications and recommendations." },
  { id: "custom", label: "Custom research", hint: "Any business question", placeholder: "Should we price per seat or per usage for an API product?",
    structure: "Structure the report with a short summary first, clear headed sections, a comparison table where it helps, and a final section of recommendations and open questions." },
] as const;
export type ResearchTemplateId = (typeof RESEARCH_TEMPLATES)[number]["id"];

export const REASON_FRAMEWORKS = [
  { id: "decision", label: "Decision analysis", placeholder: "Should we open a second warehouse in Texas next year?" },
  { id: "financial", label: "Financial model", placeholder: "Model 24 months of cash for our plan: 3 hires in Q1, $40k MRR growing 6% a month" },
  { id: "scenarios", label: "Scenario comparison", placeholder: "Compare raising prices 10%, adding an annual plan, or a cheaper starter tier" },
  { id: "risk", label: "Risk analysis", placeholder: "What could go wrong moving our billing from Stripe to Paddle?" },
  { id: "architecture", label: "Technical architecture", placeholder: "Postgres vs DynamoDB for our multi-tenant SaaS at 50k customers" },
  { id: "strategy", label: "Strategic plan", placeholder: "A 12-month plan to move upmarket to mid-size companies" },
] as const;
export type ReasonFrameworkId = (typeof REASON_FRAMEWORKS)[number]["id"];

const REASON_SECTIONS: Record<ReasonFrameworkId, string> = {
  decision: "Options (each with expected outcome, cost and effort), a weighted comparison table of the options against the criteria that matter here, and a decision tree in a text outline where the choice depends on uncertain events",
  financial: "the model itself as tables (monthly or quarterly rows, every input labelled), the formulas used in plain words, the base case plus an optimistic and a pessimistic case, and the key break-even or runway figures",
  scenarios: "each scenario's mechanics and expected results side by side in a table, sensitivity to the most important variables, and which scenario wins under which conditions",
  risk: "a risk register table (risk, likelihood, impact, early warning sign, mitigation, owner), the top three risks explained, and what would change the assessment",
  architecture: "the options compared on scale, reliability, cost, team skills and migration effort in a table, failure modes, and a recommended architecture with a short diagram in text",
  strategy: "goals and constraints, the strategic options considered, the chosen path as phased milestones with measures of success, and the resources it needs",
};

/** The request for Keplar's reasoning engine: the person's question plus the sections every decision report must include. */
export function reasonPrompt(framework: ReasonFrameworkId, question: string, docNames: string[]): string {
  return [
    `Business decision (${REASON_FRAMEWORKS.find((f) => f.id === framework)?.label ?? "Analysis"}): ${question.trim()}`,
    docNames.length ? `Use the attached documents (${docNames.join(", ")}) as evidence and cite them by name where you rely on them.` : "",
    `Write a decision report with these sections, in order: Summary (the answer in two or three sentences); Assumptions (numbered, each marked as given, sourced or estimated); ${REASON_SECTIONS[framework]}; Evidence (what the conclusions rest on, and how strong it is); Risks and uncertainty (what is unknown, how confident you are and why); Recommendation; Next actions (a short numbered list with owners where obvious).`,
    "Show every calculation with its inputs. Never invent data: when a number is not given or sourced, say it is an estimate and why. Prefer tables for comparisons.",
  ].filter(Boolean).join("\n\n");
}

/** The request for Deep Research: the topic and the template's report structure. */
export function researchPrompt(template: ResearchTemplateId, topic: string, extra: string): string {
  const t = RESEARCH_TEMPLATES.find((x) => x.id === template) ?? RESEARCH_TEMPLATES[RESEARCH_TEMPLATES.length - 1]!;
  return [
    `${t.label}: ${topic.trim()}`,
    extra.trim() ? `Context from the person: ${extra.trim()}` : "",
    `${t.structure} Cite sources inline. Separate what sources say from your own inference, and flag anything that is out of date or contested.`,
  ].filter(Boolean).join("\n\n");
}

/** A short title for a saved report from the person's input. */
export function titleFrom(input: string): string {
  const s = input.replace(/\s+/g, " ").trim();
  return s.length > 90 ? `${s.slice(0, 87).replace(/\s+\S*$/, "")}…` : s;
}
