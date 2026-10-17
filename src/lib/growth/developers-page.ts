/**
 * /for-developers: the page for the chosen first segment (independent developers and technical solo founders) and its one
 * recurring job: pressure-test a technical or product decision before committing. Every sentence here was checked against the
 * product on 2026-10-03 (docs/growth/BASELINE.md, docs/growth/CLAIMS.md). No statistics, no testimonials, no accuracy claims.
 */
import { brand } from "@/lib/site";
import type { LandingPage } from "@/lib/content/landing";

const K = brand.name;

export const developersPage: LandingPage = {
  slug: "for-developers",
  path: "/for-developers",
  metaTitle: "Second opinions on technical decisions",
  metaDescription: `Ask once and see where several models agree and split on a stack, architecture, or security decision. ${K} writes one answer and shows the disagreement.`,
  ogTitle: "A second opinion for technical decisions",
  label: "For developers and solo founders",
  h1: "Get a second opinion before you commit to the technical decision.",
  lede: `Ask once. ${K} sends your question to several AI models, shows how many agreed and exactly where they split, and writes one answer. The split is the part to check before you ship.`,
  examples: [
    "I'm a solo developer. JSONB column or a normalized table for user preferences whose shape keeps changing? Pick one and say what would change your mind.",
    "Is it safe to store JWTs in localStorage for a single-page app, or must I use httpOnly cookies? Give a definite answer.",
    "Is it a good idea for a two-person startup to rewrite a working Node.js backend in Rust before it has any paying customers? Give the strongest counterargument too.",
  ],
  sections: [
    {
      h2: "The job: pressure-test a decision before you commit",
      p: [
        "You are choosing a database shape, an auth approach, a migration path or a pricing page, and there is no one to ask. You could paste the same question into three chat windows and compare them by hand. Keplar does that in one step and writes up the differences.",
      ],
      bullets: [
        "Stack and architecture trade-offs (for example JSONB or normalized tables).",
        "Security approach questions (for example where to store a session token).",
        "Build, buy or rewrite decisions, with the strongest counterargument.",
        "Sanity checks on a plan, a spec outline or the copy on a pricing page.",
      ],
    },
    {
      h2: "How several models help",
      p: [
        `${brand.engineName} chooses the models a question needs. They answer independently, then ${K} compares what they say. If they take the same position, you see that. If they split, you see who said what and why, and the answer calls out the part you should check.`,
        "Agreement is a signal, not proof. Several models can share the same mistake.",
      ],
    },
    {
      h2: "What we saw when we tested it",
      p: ["On 3 October 2026 we asked the live Free plan real developer questions. Free uses free open models. These are single runs, not a benchmark."],
      bullets: [
        "A JSONB-versus-normalized question and a JWT-storage question: the models that responded took the same position (JSONB for frequently changing preferences; httpOnly cookies rather than localStorage).",
        "A mortgage question showed a 2-versus-1 split, with the minority position and the reason for it written out in the Disagreements section.",
        "We asked for the current Node.js LTS release. Two models said Node 22 and one said Node 20, so Keplar flagged the split. Both were out of date: nodejs.org lists Node 24 as LTS, with Node 22 also in LTS, and Node 26 as the current release that day. Keplar does not look things up on the web yet, so check versions, prices and API changes against the official source.",
        "A letter-counting question was classed as simple and sent to one model, which gave a wrong count. Simple questions use one model and are not cross-checked.",
      ],
    },
    {
      h2: "When it is not the right tool",
      bullets: [
        "Anything that changes weekly: current versions, prices, release dates, API changes. There are no live web lookups yet.",
        "Your code base. Keplar does not read your repository or run your code. Paste a short, safe snippet if you want one discussed.",
        "Replacing code review or a test suite.",
      ],
    },
    {
      h2: "What it costs",
      p: [
        "Free is $0, runs on free open models, and allows up to 50 questions a day (fair use). It can be slower when those models are busy, and the hosts of free models may log prompts, so do not paste secrets or customer data.",
        `${brand.plans.lite} is $20 a month for premium models, ${brand.plans.plus} is $45 and ${brand.plans.pro} is $99. On paid plans ${K} asks the model gateway to route only to providers that do not collect prompts. All plans are billed through Whop and the exact amount is shown at checkout.`,
      ],
    },
    {
      h2: "Honest about limits",
      p: [
        `${K} can be wrong, even when the models agree. The sources shown under an answer are the ones the models cite; ${K} has not checked them. Treat anything about security, money or production as a second opinion, not a decision.`,
      ],
    },
  ],
  faq: [
    { q: "Do I need an account?", a: "No. You can ask without signing up. An account saves chats and lets you share a single answer as a link you control." },
    { q: "Which models does it use?", a: "Free uses free open models from several families. Paid plans add premium models. The Models page lists what is in use. Keplar picks the models a question needs; you choose how thorough it should be." },
    { q: "Can I paste my code?", a: "Short snippets, yes, if they contain no secrets. On Free the model hosts may log prompts. Keplar does not read your repository." },
    { q: "How do I know when the models disagreed?", a: "The answer says so in plain words and the Disagreements section lists each position, which models took it and why." },
    { q: "Can I share an answer with a teammate?", a: "Signed-in users can create a link to one answer. It is private until you create it, not listed in search engines, expires after 90 days and can be turned off at any time." },
  ],
  related: ["/how-it-works", "/guides/why-ai-models-disagree", "/blogs/how-to-check-an-ai-answer", "/for-founders", "/pricing"],
};
