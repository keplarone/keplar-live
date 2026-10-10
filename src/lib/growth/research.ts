/**
 * The ten questions of the asynchronous customer-research form (/feedback?kind=research) and the short forms.
 * Shared by the page, the API validation and docs/growth/RESEARCH-KIT.md. Plain text answers only; nothing is scored automatically.
 */
export const FEEDBACK_KINDS = ["research", "idea", "problem", "cancel", "general"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const KIND_LABEL: Record<FeedbackKind, string> = {
  research: "Help us understand how you make decisions (10 short questions)",
  idea: "Suggest something",
  problem: "Report a problem",
  cancel: "Why are you leaving? (optional, never blocks canceling)",
  general: "Something else",
};

export const RESEARCH_QUESTIONS: { key: string; q: string; hint: string }[] = [
  { key: "q1", q: "What is the last technical or product decision you made where you were not sure?", hint: "One or two sentences. Leave out secrets, customer data and anything private." },
  { key: "q2", q: "Before you decided, what did you do?", hint: "For example: asked an AI chatbot, searched, read docs, asked a person. Which tools?" },
  { key: "q3", q: "Did you ask more than one AI model the same question? If so, why, and what did you do when they disagreed?", hint: "If you never do this, say so and why." },
  { key: "q4", q: "How long did that take, and what was the most annoying part?", hint: "A rough number of minutes is fine." },
  { key: "q5", q: "Have you ever acted on an AI answer that turned out to be wrong? What happened?", hint: "What it cost you (time, money, a bug in production), in your own words." },
  { key: "q6", q: "How often does a decision like this come up?", hint: "Roughly per week or per month." },
  { key: "q7", q: "What do you pay for AI tools today, if anything?", hint: "Optional. A rough monthly range is enough." },
  { key: "q8", q: "If you tried Keplar on a real question, what would the answer need for you to trust it enough to act on it?", hint: "What would you check first?" },
  { key: "q9", q: "What would make you not come back to a tool like this?", hint: "Speed, cost, accuracy, privacy, clutter, anything." },
  { key: "q10", q: "If you could change one thing about how you get second opinions today, what would it be?", hint: "The one thing." },
];

export const ROLES = ["Independent developer", "Founder (technical)", "Founder (non-technical)", "Student", "Researcher", "Small business owner", "Creator", "Other"] as const;

export const LIMITS = { message: 3000, answer: 800, email: 200, role: 40, page: 60 } as const;
