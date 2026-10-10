import { brand } from "./site";
/** Homepage narrative copy. Short and precise; one idea per scene. */
export const heroCopy = {
  title: "Stop trusting one AI.",
  lead: ["One question.", "Multiple intelligences.", "One answer."],
  body:
    "Keplar asks several AI models, shows where they agree and where they don't, and gives you one clear answer.",
  primary: "Ask Keplar anything",
  secondary: "See how it works",
};

/** Front-page orb hero. Every line is a plain description of what the product does; no measured claims. */
export const orbHeroCopy = {
  pill: "Several AI models. One answer you can weigh.",
  sub: "Keplar uses multiple AI models, compares their perspectives, and gives you one clear, synthesized answer.",
  chips: ["Multiple Models", "Compares Answers", "Finds Disagreements", "One Clear Result"],
  note: "Model names are examples of families Keplar can route to; which models answer depends on your plan, the question and availability. Names belong to their owners. Opens in the app; nothing is sent until you press Send.",
};

export const questionCopy = {
  label: "Question",
  prompt: "Should I buy a home this year or keep renting?",
  caption: "One question enters the system.",
};

export const distributionCopy = {
  label: "Distribution",
  title: `${brand.engineName} decides who to ask.`,
  body: "Not every model, every time. Only the intelligences this question needs, weighed by quality, reliability, latency, and cost.",
};

export const responsesCopy = {
  label: "Responses",
  title: "Each answers on its own.",
  body: "Different reasoning. Different evidence. Some responses align. Some don't.",
};

export const disagreementCopy = {
  label: "Disagreement",
  detected: "Disagreement detected.",
  agree: "5 agree.",
  dissent: "1 doesn't.",
  follow: "Keplar investigates why.",
  /** The counts are a storyboard, not a measurement. Keep this visible next to them. */
  note: "Illustration with a sample question. The counts are an example, not a live result.",
};

export const verificationCopy = {
  label: "Verification",
  title: "Evaluation, not voting.",
  body: "Keplar weighs the evidence and reasoning behind each response. Related evidence gathers, contradictions separate, noise falls away. The minority can be right.",
};

export const convergenceCopy = {
  label: "Convergence",
  title: "ONE ANSWER.",
  body: "Synthesized from what held up, with the agreement and disagreements shown.",
};

/** Scroll story that follows the hero. Kickers number the scenes; the steps restate the verification copy and make no measured claim. */
export const storyCopy = {
  kickers: ["Ask", "Route", "Respond", "Compare", "Verify", "Answer"],
  routeNote: "Names are examples. Which models answer depends on your plan, the question and availability. Names belong to their owners.",
  respondNote: "Illustration, not a live result.",
  verifySteps: ["Weigh the evidence", "Separate contradictions", "Let the noise fall away"],
  closing: {
    title: "One answer.",
    primary: "Ask Keplar anything",
    secondary: "How Keplar-One works",
  },
};
