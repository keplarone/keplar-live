/**
 * Everything /simulation shows is written here by hand. No model is called and nothing is measured, so there are no speeds,
 * scores, percentages or real model names; the factual claims are ordinary, checkable facts. Counts such as "3 of 4 agree" are
 * part of the script, labelled as such on the page.
 */
export const QUESTION = "I made rice for dinner. Is it okay to leave the leftovers out overnight?";

export type Lane = { name: string; leans: "fine" | "refrigerate"; text: string; mark: string };
export const LANES: Lane[] = [
  { name: "Model A", leans: "fine", text: "It's fine if you keep it covered, rice is a dry food.", mark: "fine if you keep it covered" },
  { name: "Model B", leans: "refrigerate", text: "No. Cooked rice should be refrigerated within about two hours.", mark: "refrigerated within about two hours" },
  { name: "Model C", leans: "refrigerate", text: "Better not. Leftover rice can grow bacteria whose toxins survive reheating. Cool it fast and refrigerate it.", mark: "Cool it fast and refrigerate it" },
  { name: "Model D", leans: "refrigerate", text: "I'd throw it out after a night on the counter. Two hours is the usual limit.", mark: "Two hours is the usual limit" },
];

export const ROUTING = "A food-safety question. Keplar asks four models that explain risk well, and plans to check the disputed point.";
export const SPLIT = { agree: 3, total: 4, summary: "Model A says covering it is enough. The other three say it must be refrigerated within about two hours." };
export const CHECKS = [
  "Find the disputed claim: \u201Ccovered is fine\u201D",
  "Compare with food-safety guidance for cooked, perishable food",
  "Guidance: do not leave it at room temperature for more than about two hours",
  "Covering it does not change that",
];
export const FINAL = {
  title: "Don't leave it out overnight.",
  body: "Cooked rice should go in the fridge within about two hours. Left out longer, bacteria can grow and some toxins survive reheating. If it sat out overnight, throw it away.",
  agreed: "Three of four models agreed, and the check supported them.",
  differed: "One model said covering it was enough. The check did not support that.",
};

/* Create sub-demo: an idea becomes a site. */
export const CREATE_IDEA = "A site for Mill Lane Bakehouse, a neighborhood bakery. Opening hours, and a way to reserve a loaf.";
export const CREATE_UNDERSTOOD = [
  { k: "Audience", v: "Neighbors who want fresh bread and a quick way to reserve" },
  { k: "Style", v: "Warm, editorial, big type, one accent" },
  { k: "Sections", v: "Hero, today's loaves, hours and map, reserve a loaf" },
];
export const CREATE_CHOICES = ["Warm and editorial", "Clean and minimal", "Bold and playful"];
export const CREATE_BLOCKS = [
  { name: "Hero", note: "Mill Lane Bakehouse. Bread baked before sunrise." },
  { name: "Today's loaves", note: "Sourdough, rye, seeded batard" },
  { name: "Hours and map", note: "Tue to Sun, 7 to 3" },
  { name: "Reserve a loaf", note: "Pick a loaf and a pickup time" },
];
export const CREATE_CHECKLIST = [
  { ask: "Opening hours", built: "Hours and map section" },
  { ask: "A way to reserve a loaf", built: "Reserve a loaf form" },
  { ask: "Neighborhood feel", built: "Warm editorial style, local copy" },
];

/* Agent sub-demo: the agent proposes, you approve. */
export const AGENT_TASK = "Every Friday, email my flour supplier the weekend order.";
export const AGENT_DRAFT = {
  to: "orders@example-mill.test",
  subject: "Weekend order, Mill Lane Bakehouse",
  body: "Hi, please send 40 kg bread flour and 10 kg rye for Saturday pickup. Thank you.",
};

export const CHAPTERS = [
  { id: "intro", label: "Start" },
  { id: "ask", label: "Ask" },
  { id: "route", label: "Route" },
  { id: "answer", label: "Answers" },
  { id: "split", label: "Disagree" },
  { id: "verify", label: "Verify" },
  { id: "final", label: "Answer" },
  { id: "create", label: "Create" },
  { id: "agent", label: "Agent" },
  { id: "end", label: "Try it" },
] as const;
export type ChapterId = (typeof CHAPTERS)[number]["id"];
