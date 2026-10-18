/**
 * "Keplar vs …" pages. Rules for this file:
 *  - A competitor fact appears only if it was read on that vendor's own public page on the access date, and the page is cited.
 *  - No claim about quality, accuracy, safety, privacy or speed superiority in either direction.
 *  - Where the other product does something Keplar does not (or does it first), the page says so.
 *  - `approved: false` pages are noindex, left out of the sitemap, and unlinked from the hub until the owner signs off.
 */
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { tiers } from "@/lib/tiers";

export const VS_ACCESSED = "2026-10-03";

export type Source = { label: string; url: string };
export type Vs = {
  slug: string;
  name: string;
  vendor: string;
  approved: boolean;
  /** Why the page is held back, shown to the owner only in the report/tests, never on the page. */
  holdReason?: string;
  title: string;
  description: string;
  sources: Source[];
  summary: string[];
  publicFacts: string[];
  rows: { feature: string; keplar: string; them: string }[];
  chooseThem: string[];
  chooseKeplar: string[];
  overlap?: string;
  faq: { q: string; a: string }[];
};

const lite = tiers.find((t) => t.id === "lite")!.price;
const plus = tiers.find((t) => t.id === "plus")!.price;
const pro = tiers.find((t) => t.id === "pro")!.price;
const n = (x: number | null) => (x == null ? "custom" : x.toLocaleString("en-US"));

const KEPLAR_PLANS = `Free ($0, up to 50 questions a day under fair use, free open models), Lite ($${lite}), Plus ($${plus}), Pro ($${pro}) and Business (custom). Paid plans meter use in credits (${n(PLAN_ALLOWANCES.lite.monthlyUnits)}, ${n(PLAN_ALLOWANCES.plus.monthlyUnits)} and ${n(PLAN_ALLOWANCES.pro.monthlyUnits)} a month) with rolling 5-hour and weekly limits.`;

export const vsPages: Vs[] = [
  {
    slug: "chatgpt",
    name: "ChatGPT",
    vendor: "OpenAI",
    approved: true,
    title: "Keplar vs ChatGPT: Differences and When to Use Each",
    description: "ChatGPT gives one model's answer; Keplar asks several models and shows where they disagree. What each is for, features and pricing compared.",
    sources: [{ label: "ChatGPT pricing (OpenAI)", url: "https://openai.com/chatgpt/pricing/" }],
    summary: [
      "ChatGPT is OpenAI's assistant, built around OpenAI's own models. Keplar is an answer layer that sends a non-trivial question to several models from different providers, compares their positions, has a reviewer check the draft against the individual responses and shows where they agreed and differed. Simple questions go to a single model.",
      "They are different shapes of product. ChatGPT is a broad assistant with many features; Keplar is narrower and built around the cross-check. Neither page claims one gives more accurate answers than the other. Accuracy depends on the question and changes with each model release.",
    ],
    publicFacts: [
      "OpenAI's pricing page lists these tiers: Free, Go, Plus, Pro, Business and Enterprise.",
      "The page says the Go tier may include ads.",
      "Plus is listed with projects, scheduled tasks, custom GPTs and expanded Deep Research, among other items.",
      "Plans are listed with usage limits that differ by tier. Check the page for current prices and limits.",
    ],
    rows: [
      { feature: "How an answer is produced", keplar: "Simple questions: one model. Moderate: a three-model panel and a verifier. Complex: up to five models, a verifier and a judge if the panel disagrees. Free is capped at three.", them: "ChatGPT is built around OpenAI's models. The pricing page does not describe a panel of other providers' models answering each question." },
      { feature: "Shows where models disagreed", keplar: "Yes, when more than one position exists.", them: "Not described on the pricing page." },
      { feature: "Free tier", keplar: "Yes: up to 50 questions a day under fair use, on free open models.", them: "Yes." },
      { feature: "Paid plans", keplar: KEPLAR_PLANS, them: "Go, Plus, Pro, Business and Enterprise are listed; see OpenAI's page for prices." },
      { feature: "Deep research", keplar: "Plus and above (a typical run is estimated at about 1,200 credits).", them: "Listed, with expanded access on Plus." },
      { feature: "Scheduled tasks and custom GPTs", keplar: "Agents can run on schedules (Plus and above). Custom GPTs are not offered.", them: "Projects, scheduled tasks and custom GPTs are listed on Plus." },
      { feature: "Live web lookups in normal answers", keplar: "No. Deep Research gathers sources; normal questions do not look up the live web.", them: "ChatGPT lists search among its features; see the page." },
      { feature: "Sources are checked", keplar: "No. Models' citations are shown labeled as not opened or checked by Keplar.", them: "See OpenAI's documentation." },
      { feature: "Confidence or accuracy score", keplar: "None.", them: "See OpenAI's documentation." },
    ],
    chooseThem: [
      "You want one assistant with a wide feature set (custom GPTs, voice, image and file tools, a large ecosystem).",
      "You want live web search built into ordinary answers.",
      "Your team is standardized on it, or you need OpenAI's business and enterprise offerings.",
      "You prefer a single model's style and are happy to cross-check yourself.",
    ],
    chooseKeplar: [
      "You want important questions answered by several providers' models, with the differences shown.",
      "You want an answer that says which models responded and which did not.",
      "You want Study mode, a slideshow creator and a site builder in one place, with credits that show use as a meter.",
      "You want a free start with no signup.",
    ],
    faq: [
      { q: "Is Keplar more accurate than ChatGPT?", a: "Keplar does not make that claim. Accuracy depends on the question and the models used. Keplar's design makes disagreement between models visible, which helps you decide what to verify, but it does not check sources or give an accuracy score." },
      { q: "Does Keplar use ChatGPT's models?", a: "Keplar's panel is chosen per question from a live catalog and can include models from OpenAI and other providers. The Models consulted section of each answer shows which were used." },
      { q: "Can I use both?", a: "Yes. Many people use more than one assistant for questions that matter." },
    ],
  },
  {
    slug: "claude",
    name: "Claude",
    vendor: "Anthropic",
    approved: true,
    title: "Keplar vs Claude: Differences and When to Use Each",
    description: "Claude gives one model's answer; Keplar asks several models from different providers and shows where they disagree. What each is for, compared honestly.",
    sources: [{ label: "Claude pricing (Anthropic)", url: "https://www.anthropic.com/pricing" }],
    summary: [
      "Claude is Anthropic's assistant, built around Anthropic's own model family. Keplar is an answer layer that consults several models from different providers for non-trivial questions and shows the comparison. Claude is also a widely used coding assistant; Anthropic lists Claude Code in its paid plans.",
      "This page does not claim either gives better answers. The pages are meant to help you pick the right tool for a job, and to show where Keplar falls short of what Anthropic lists.",
    ],
    publicFacts: [
      "Anthropic's pricing page lists Free ($0), Pro ($17 a month billed annually with $200 up front, or $20 billed monthly) and Max (from $100 a month, with 5x or 20x Pro usage).",
      "It lists Team (2 to 150 people) and Enterprise plans.",
      "It describes usage limits that apply in rolling 5-hour sessions, plus weekly limits.",
      "The Free plan is listed with web search, memory, connectors and artifacts. Claude Code is listed as included in paid plans.",
      "It lists the models as Fable, Opus, Sonnet and Haiku.",
      "For consumer plans it lists model training as opt-out; for Team and Enterprise it says no training by default.",
    ],
    rows: [
      { feature: "How an answer is produced", keplar: "Simple: one model. Moderate: three-model panel and verifier. Complex: up to five models, verifier and a judge if they split.", them: "You use Anthropic's models and choose among them as listed on the pricing page." },
      { feature: "Shows where models disagreed", keplar: "Yes, when more than one position exists.", them: "Not described on the pricing page." },
      { feature: "Free tier", keplar: "Yes: up to 50 questions a day under fair use, on free open models; Free never uses paid models.", them: "Yes; lists web search, memory, connectors and artifacts." },
      { feature: "Entry paid price", keplar: `Lite $${lite} a month; Plus $${plus}; Pro $${pro}.`, them: "Pro $17 a month billed annually, or $20 monthly; Max from $100." },
      { feature: "Usage limits", keplar: "Monthly credits plus rolling 5-hour and weekly limits on Lite, Plus and Pro.", them: "Rolling 5-hour sessions plus weekly limits." },
      { feature: "Connectors", keplar: "Remote MCP connections on Plus and above (Plus 3, Pro 10, Business 25), outbound only.", them: "Listed on the Free plan and above." },
      { feature: "Coding agent", keplar: "No dedicated coding agent; coding questions use panels and review.", them: "Claude Code is listed in paid plans." },
      { feature: "Sources are checked", keplar: "No. Citations are labeled as not opened or checked.", them: "See Anthropic's documentation." },
      { feature: "Confidence or accuracy score", keplar: "None.", them: "See Anthropic's documentation." },
    ],
    chooseThem: [
      "You want Anthropic's models and their writing and coding style as your main tool.",
      "You want a dedicated coding agent (Claude Code) alongside chat.",
      "You want built-in web search on the free plan.",
      "You want Team or Enterprise plans from Anthropic.",
    ],
    chooseKeplar: [
      "You want several providers' models to answer important questions independently, with disagreements shown.",
      "You want a cross-check without managing several subscriptions.",
      "You want Study mode, a slideshow creator and a site builder in the same app.",
      "You want to start free without signing up.",
    ],
    faq: [
      { q: "Does Keplar use Claude models?", a: "A panel can include Anthropic models and models from other providers, chosen per question. Each answer lists the models consulted." },
      { q: "Is Keplar a replacement for Claude Code?", a: "No. Keplar does not offer a coding agent. It can review and compare coding answers from several models." },
      { q: "Which has better limits?", a: "They meter differently, so they are not directly comparable. Compare the limits for your own usage on each pricing page." },
    ],
  },
  {
    slug: "gemini",
    name: "Gemini",
    vendor: "Google",
    approved: true,
    title: "Keplar vs Gemini: Differences and When to Use Each",
    description: "Gemini gives one model's answer; Keplar asks several models and shows where they disagree. What each is for, features and pricing compared.",
    sources: [{ label: "Google Gemini subscriptions", url: "https://gemini.google/subscriptions/" }],
    summary: [
      "Gemini is Google's assistant, built around Google's models and integrated with Google services. Keplar is an answer layer that consults several providers' models for non-trivial questions and shows where they agree and differ.",
      "If your work is in Gmail, Docs and Drive, Gemini's integration is a real advantage that Keplar does not match. If your concern is checking an important answer across providers, Keplar's design is aimed at that. Neither page claims one is more accurate.",
    ],
    publicFacts: [
      "Google's subscriptions page lists a free tier, Google AI Plus, Google AI Pro and Google AI Ultra. Ultra is listed from $99.99 a month, with higher usage tiers (5x or 20x relative to Pro).",
      "The Free tier lists Deep Research, Gemini Live and image generation.",
      "The Pro tier lists a 1 million token context window, Gemini in Gmail and Docs, and 5 TB of storage.",
      "Usage limits are described as refreshing every 5 hours, up to a weekly limit.",
    ],
    rows: [
      { feature: "How an answer is produced", keplar: "Simple: one model. Moderate: three-model panel and verifier. Complex: up to five models, verifier and a judge if they split.", them: "Gemini is built around Google's models. The subscriptions page does not describe a panel of other providers' models answering each question." },
      { feature: "Shows where models disagreed", keplar: "Yes, when more than one position exists.", them: "Not described on the subscriptions page." },
      { feature: "Free tier", keplar: "Yes: up to 50 questions a day on free open models.", them: "Yes; lists Deep Research, Gemini Live and image generation." },
      { feature: "Deep research", keplar: "Plus and above.", them: "Listed on the Free tier." },
      { feature: "Integration with email and documents", keplar: "Connected apps use MCP servers you add (Plus and above); Gmail and Docs integration like Gemini's is not offered.", them: "Gemini in Gmail and Docs is listed on Pro." },
      { feature: "Voice conversation", keplar: "Voice dictation into the Ask box; no live voice conversation.", them: "Gemini Live is listed." },
      { feature: "Storage bundle", keplar: "None.", them: "5 TB is listed on Pro." },
      { feature: "Sources are checked", keplar: "No. Citations are labeled as not opened or checked.", them: "See Google's documentation." },
      { feature: "Confidence or accuracy score", keplar: "None.", them: "See Google's documentation." },
    ],
    chooseThem: [
      "You live in Google Workspace and want an assistant inside Gmail, Docs and Drive.",
      "You want live voice conversation and image generation on a free tier.",
      "You want a Google One-style bundle with storage.",
      "You need very long context windows as a headline feature.",
    ],
    chooseKeplar: [
      "You want important questions answered by models from several providers, with disagreements shown.",
      "You want to see which models responded and which did not.",
      "You want Study mode, a slideshow creator and a site builder in one app.",
      "You do not want to be tied to a single provider's ecosystem.",
    ],
    faq: [
      { q: "Does Keplar include Gemini models?", a: "A panel can include Google models and others, chosen per question. Each answer lists the models consulted." },
      { q: "Can Keplar read my Gmail?", a: "Not in the way Gemini's Workspace integration does. Keplar's connected apps use MCP servers you add, and tools start disabled and ask before writing." },
      { q: "Is Keplar cheaper?", a: "They are priced and metered differently. Compare the tiers you would actually use." },
    ],
  },
  {
    slug: "perplexity",
    name: "Perplexity",
    vendor: "Perplexity AI",
    approved: false,
    holdReason: "Perplexity's help center could not be fetched directly (403/timeout); facts come from search excerpts. Perplexity's Model Council (launched February 5, 2026) overlaps directly with Keplar's multi-model approach, so the page is positioning-sensitive. Owner should review before it is indexed.",
    title: "Keplar vs Perplexity: what each is for and how they differ",
    description: "A factual comparison of Keplar and Perplexity, including Perplexity's Model Council feature that also runs a question across several models.",
    sources: [{ label: "Perplexity Help Center", url: "https://www.perplexity.ai/help-center" }, { label: "Perplexity blog: Model Council", url: "https://www.perplexity.ai/hub/blog" }],
    summary: [
      "Perplexity is an answer engine that searches the web and shows sources. It also offers Model Council, which runs one question across several models and shows a synthesized answer, so it overlaps with Keplar's central idea.",
      "The products differ in emphasis. Perplexity is built around live search and citations. Keplar is built around comparing models and showing disagreement, and it does not do live web lookups on normal questions or check sources.",
    ],
    publicFacts: [
      "Perplexity's help center describes Model Council as running a question across several models, by default three (one each from Anthropic, OpenAI and Google), with a synthesizer model that merges one answer showing agreement and differences.",
      "It is described as available on Max and Enterprise Max, on the web (and iOS), and the number of models can be chosen in some products.",
      "Help-center pages list Pro at $20 a month and Max at $200 a month; the page we read was marked as last modified September 14, 2026.",
    ],
    rows: [
      { feature: "Core idea", keplar: "Compare models' answers, show disagreement, review the draft.", them: "Search the web, show sources; Model Council runs several models on one question." },
      { feature: "Multi-model answers", keplar: "Chosen per question; simple questions use one model.", them: "Model Council, on its higher tiers." },
      { feature: "Live web search in normal answers", keplar: "No.", them: "Yes, a core feature." },
      { feature: "Sources are checked", keplar: "No. Citations are labeled as not opened or checked.", them: "See Perplexity's documentation." },
      { feature: "Confidence or accuracy score", keplar: "None.", them: "See Perplexity's documentation." },
    ],
    chooseThem: [
      "You want live web search with citations as the default way of answering.",
      "You want an answer engine with search at its core.",
    ],
    chooseKeplar: [
      "You want models compared per question, including on a free tier, with disagreement shown.",
      "You want Study mode, a slideshow creator and a site builder in the same app.",
    ],
    overlap: "Perplexity's Model Council is a similar idea. If you value live search with citations, Perplexity is built for that; Keplar is not.",
    faq: [
      { q: "Is Keplar the same as Model Council?", a: "They share the idea of asking several models. They differ in which models, how answers are combined and what is shown. Compare them on your own questions." },
    ],
  },
];

export const approvedVs = () => vsPages.filter((v) => v.approved);
export const vsBySlug = (slug: string) => vsPages.find((v) => v.slug === slug);
