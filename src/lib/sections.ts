/** Copy for the homepage sections after the narrative and the marketing pages. */
import { brand, BUSINESS_HOST } from "./site";

export type PipelineStage = {
  id: "prompt" | "classify" | "route" | "compare" | "verify" | "synthesize" | "answer";
  name: string;
  short: string;
  detail: string;
  example: string;
};

export const keplarOneCopy = {
  label: brand.engineName,
  title: "The intelligence behind the intelligences.",
  lede: `${brand.engineName} is the layer above the models. It decides which multiple AI models a question actually needs, compares what they say, checks what holds up, and writes one answer.`,
  hint: "Select a stage",
};

export const pipeline: PipelineStage[] = [
  {
    id: "prompt",
    name: "Prompt",
    short: "Your question, as asked.",
    detail: "Text, files, links, or a follow-up in an existing thread. Nothing is rewritten before it is understood.",
    example: "“Should I buy a home this year or keep renting?”",
  },
  {
    id: "classify",
    name: "Classify",
    short: "What kind of task, and how hard.",
    detail: "The task type and its complexity decide everything downstream: a quick fact needs one careful answer, a big decision needs several perspectives and evidence.",
    example: "Big personal decision · high complexity · needs finance, housing, and tax reasoning.",
  },
  {
    id: "route",
    name: "Route",
    short: "Only the models this question needs.",
    detail: "Not every model, every time. Each candidate is weighed by quality, reliability, latency, and cost, and only the useful ones are asked.",
    example: "6 intelligences selected. Others were available and not needed.",
  },
  {
    id: "compare",
    name: "Compare",
    short: "Where they agree, and where they don't.",
    detail: "Answers run in parallel and are compared claim by claim. Agreement is noted; disagreement is flagged, never smoothed over.",
    example: "5 recommend renting for now. 1 recommends buying this year.",
  },
  {
    id: "verify",
    name: "Verify",
    short: "Evidence over votes.",
    detail: "Keplar weighs the evidence and reasoning behind each response. A majority is not treated as truth: the minority can be right, and consensus can be wrong.",
    example: "The dissent's point about long stays held up. One unsupported claim was removed.",
  },
  {
    id: "synthesize",
    name: "Synthesize",
    short: "One answer from what held up.",
    detail: "The final answer is written from the claims that held up when the models cross-examined each other, including the parts of the dissent that survived. Uncertainty stays visible.",
    example: "“Rent for now. Buy once you know you'll stay.”",
  },
  {
    id: "answer",
    name: "Answer",
    short: "With its work shown.",
    detail: "One Keplar Answer, with consensus, models consulted, sources, disagreements, verification, and a reasoning summary, all one click away.",
    example: "Consensus 87% · 5 agree, 1 disagrees.",
  },
];

export const creationCopy = {
  label: "Creation",
  title: "From answers to outcomes.",
  lede: "The same intelligence that answers can build: a personal site, an app idea, images, a short video, code, or a study guide, organized into one project.",
  artifacts: [
    { id: "website", name: "Website", meta: "Personal site · 4 sections" },
    { id: "app", name: "App", meta: "Habit tracker · 6 screens" },
    { id: "image", name: "Image", meta: "Birthday invitation" },
    { id: "video", name: "Video", meta: "Trip recap · 0:32" },
    { id: "code", name: "Code", meta: "budget.ts · 142 lines" },
    { id: "research", name: "Research", meta: "Study guide · 12 pages" },
  ],
  workspace: "Personal projects",
};

/** Everyday, personal uses. Honest caveats inline (health, money, fact-checking). */
export type UseCase = { id: string; name: string; text: string; example: string; caveat?: string };

export const everydayCopy = {
  label: "For you",
  title: "For the questions in your life.",
  lede: `Homework, a health worry, a big purchase, a trip. Ask once, and ${brand.name} shows you where the models agree and where you should look twice.`,
  cta: "See everyday uses",
};

export const useCases: UseCase[] = [
  {
    id: "study",
    name: "Studying and homework",
    text: "Get a concept explained a few ways, then one clear version. Where the models disagree, you know what to check with your teacher or textbook.",
    example: "Why did the Roman Republic fall?",
  },
  {
    id: "health",
    name: "Health questions",
    text: "Make sense of a diagnosis, a medication leaflet, or what to ask at your next appointment, with any disagreement between models shown.",
    example: "What should I ask my doctor about a new prescription?",
    caveat: "Not medical advice. For your care, talk to a clinician.",
  },
  {
    id: "money",
    name: "Money and big purchases",
    text: "Rent or buy, lease or finance, which laptop. See the trade-offs the models agree on, and the one view that doesn't fit the rest.",
    example: "Should I lease or buy my next car?",
    caveat: "Not financial advice.",
  },
  {
    id: "travel",
    name: "Travel planning",
    text: "Itineraries, budgets, when to go, what to pack. One plan, with anything the models disagree on called out so you can check it.",
    example: "Plan five days in Lisbon on a mid-range budget.",
  },
  {
    id: "factcheck",
    name: "Fact-checking what you read",
    text: "Paste a claim or a headline. Several models weigh in independently, and disagreement tells you where to dig further.",
    example: "Do we really only use 10% of our brains?",
    caveat: "Keplar doesn't look things up on the web yet, so verify what matters.",
  },
  {
    id: "writing",
    name: "Writing",
    text: "Emails, cover letters, a toast, the tricky message to a landlord. Drafts compared, one written in your voice.",
    example: "A firm but friendly note to my landlord about a repair.",
  },
  {
    id: "projects",
    name: "Personal projects",
    text: "A garden plan, a home repair, learning to code. Keep related threads together in Projects and pick up where you left off.",
    example: "Help me plan a raised vegetable bed.",
  },
  {
    id: "create",
    name: "Your own site, images, and video",
    text: "Make a personal site or portfolio, an invitation, and publish on your own domain. On Plus and Pro. Video is Pro and Business only.",
    example: "A one-page portfolio for my photography.",
  },
];

export const pathsCopy = {
  label: "Two ways to use Keplar",
  title: "Made for you. Ready for your business.",
  lede: `Most people start with everyday questions. If you run a business, the same ${brand.name} can take on the work around it, but only if you want it to.`,
  personal: {
    label: "For you",
    title: "Everyday questions, one answer you can inspect.",
    points: ["Studying and homework", "Health questions (not medical advice)", "Money and big purchases", "Travel, writing, and personal projects", "Your own site, images, and video"],
    primary: { label: "Start free", href: "/app" },
    secondary: { label: "Everyday uses", href: "/for-you" },
  },
  business: {
    label: "For business · optional",
    title: `Run a business? ${brand.name} can run it with you.`,
    points: ["Storefront, checkout, and orders", "CRM and inbox", "One dashboard for the business", "Agents inside spend caps and approval gates", "An audit log of every action"],
    note: "Opens soon.",
    primary: { label: "Explore Business", href: `https://${BUSINESS_HOST}` },
    secondary: { label: `Contact ${brand.name}`, href: "/inquire" },
  },
};

export const businessHeroCopy = {
  label: "For business",
  title: `Run a business? ${brand.name} can run it with you.`,
  lede: `Business is optional. Everything personal stays the same, and Business adds the tools around your work: a storefront and orders, a CRM and inbox, a dashboard, and agents that keep working inside limits you set.`,
  tools: [
    { name: "Commerce", text: "Products, checkout, and orders for a site you built in Create." },
    { name: "CRM and inbox", text: "Contacts, a deal pipeline, and incoming messages in one place. Agents draft replies, and nothing is sent until you approve it." },
    { name: "Dashboard", text: "Orders, leads, site views, agent activity, pending approvals, and Usage on one screen." },
    { name: "Agents", text: "Lead follow-ups, reminders, and weekly reports on a schedule, inside hard spend caps." },
  ],
  note: "Payments and connectors switch on as each one is set up; until then they say so.",
};

export const agentsCopy = {
  label: "Agents",
  title: `${brand.name} doesn't stop when you close the tab.`,
  lede: "On Business, autonomous agents keep working overnight: researching, building, and preparing changes. Anything consequential waits for you. Optional, and only if you run a business.",
  timeline: [
    { time: "11:42 PM", text: "Research completed" },
    { time: "12:17 AM", text: "Competitor analysis completed" },
    { time: "1:08 AM", text: "Report generated" },
    { time: "2:31 AM", text: "Application updated" },
    { time: "2:33 AM", text: "Production deployment awaiting approval", pending: true },
  ],
  controlsTitle: "Autonomy without losing control.",
  controlsLede: "Every agent runs inside limits you set, and every action is recorded.",
  panel: [
    { label: "Spend", value: "$427", of: "$2,000", ratio: 427 / 2000 },
    { label: "Production deployment", value: "Approval required", status: "pending" as const },
    { label: "Tools", value: "6 authorized" },
    { label: "Audit log", value: "147 actions recorded" },
  ],
  controls: [
    "Hard spend caps",
    "Audit logs",
    "Human approval gates",
    "Granular, tool-level permissions",
    "Secrets isolation",
    "Sandboxing",
    "Production deploy approval",
    "Payment approval",
    "Rollback",
    "Escalation",
    "Emergency stop",
  ],
};

export const enterpriseCopy = {
  label: "Enterprise",
  title: "Autonomy, inside a boundary you define.",
  lede: "Agents work within a transparent perimeter: every limit visible, every action attributable, nothing consequential without a person.",
  boundary: [
    { id: "spend", name: "Spend cap", text: "Hard limits per agent, per run, and per team. Agents stop at the cap." },
    { id: "permissions", name: "Permissions", text: "Granular, tool-level access. Agents only touch what they are allowed to." },
    { id: "audit", name: "Audit log", text: "Every action recorded with who, what, when, and why." },
    { id: "approvals", name: "Approvals", text: "Human gates for deployments, payments, and anything irreversible." },
    { id: "secrets", name: "Secrets", text: "Credentials isolated from models and prompts, scoped per tool." },
    { id: "deployment", name: "Deployment", text: "Production changes wait for approval, with rollback ready." },
  ],
  cta: `Contact ${brand.name}`,
};

export const pricingCopy = {
  label: "Pricing",
  title: "Start free. Upgrade when you need more.",
  lede: `Start free for everyday questions. Upgrade for premium models, Deep Research, and creating sites, images, and video. Run a business? Business is tailored to it. ${brand.usage} is measured in credits, not raw tokens.`,
  computeTitle: brand.usage,
  computeLede: "One unit across every task, so you can see what things cost before you run them.",
};

export const finalCtaCopy = {
  title: `What could ${brand.name} do for you?`,
  primary: `Try ${brand.name}`,
  secondary: `Talk to ${brand.name}`,
};

export const howItWorks = [
  { name: "Understand", text: `${brand.engineName} classifies your question and how complex it is.` },
  { name: "Select", text: "It asks only the AI models this question needs, weighed by quality, reliability, latency, and cost. Not every model, every time." },
  { name: "Answer independently", text: "Each model answers on its own, in parallel." },
  { name: "Detect disagreement", text: `${brand.name} finds where the answers agree and where they don't, and investigates why.` },
  { name: "Verify", text: "Keplar weighs the evidence and reasoning behind each response. Evaluation, not voting. The minority can be right." },
  { name: "Synthesize", text: "One answer, with its consensus, sources, and disagreements shown." },
];
