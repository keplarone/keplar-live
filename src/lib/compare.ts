/**
 * Comparison pages. Copy: /workspace/marketing/launch/comparison-pages.md (competitor facts
 * first checked Sep 27, 2026; every price and cited source re-checked Oct 12, 2026: prices unchanged, dead Poe links replaced). Publishing rules applied: [WHEN RETRIEVAL IS LIVE] lines cut
 * (retrieval is not live); internal editorial notes omitted. The marketer's source/date HTML
 * comments are kept below as code comments next to the facts they back.
 * Approved and published 2026-10-12 (indexable, in the sitemap). Keplar's own prices are generated from the plan data below.
 */
import { brand } from "./site";
import { tiers } from "./tiers";
import { BUSINESS_TIERS, SELF_SERVE_TIERS } from "./business/tiers";

const K = brand.name;
/** Company name for titles, H1s and first mentions (Marketer rule: "Keplar One" first, "Keplar" after). */
const KO = brand.companyName;
const O = brand.engineName;

export type Bullet = { b?: string; text: string };
export type Block =
  | { t: "p"; text: string }
  | { t: "short"; text: string }
  | { t: "disclosure"; text: string }
  | { t: "h2"; text: string }
  | { t: "list"; title: string; items: Bullet[]; ordered?: boolean }
  | { t: "table"; caption: string; head: string[]; rows: string[][] }
  | { t: "picks"; groups: { title: string; items: string[] }[] }
  | { t: "tool"; name: string; text: string; bullets: Bullet[] };

export type Source = { label: string; url?: string };

export type ComparePage = {
  slug: string;
  path: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  label: string;
  lastChecked: string;
  blocks: Block[];
  faq: { q: string; a: string }[];
  sources: Source[];
  sourcesNote?: string;
  /** Facts to re-check on publish day (were tagged [VERIFY]). Not rendered. */
  verify?: string[];
};

const LAST_CHECKED = "October 12, 2026";
const panel = `Consensus (percentage and agree/disagree count), Models consulted, Sources (the sources the models cite; ${K} hasn't checked them), Disagreements, Verification, and a Reasoning summary`;
const short = (name: string) => name.replace(/^Keplar\s+/, "");
const consumer = tiers.filter((t) => t.price !== null).map((t) => `${short(t.name)} $${t.price}${t.price ? "/mo" : ""}`);
const businessFrom = Math.min(...SELF_SERVE_TIERS.map((id) => BUSINESS_TIERS[id].monthly ?? Infinity));
/** "Free $0; Lite $20/mo; Plus $45/mo; Pro $99/mo; Business from $199.99/mo", from tiers.ts and business/tiers.ts. */
export const keplarPlans = [...consumer, `Business from $${businessFrom.toFixed(2)}/mo`].join("; ");
const plans = keplarPlans;
const plansFreeNote = keplarPlans.replace(/^Free \$0/, "Free $0 (free open models only)");

export const perplexity: ComparePage = {
  slug: "perplexity-model-council",
  path: "/compare/perplexity-model-council",
  metaTitle: "Keplar One vs Perplexity Model Council",
  metaDescription:
    "How Keplar One and Perplexity Model Council each combine several AI models into one answer: model choice, disagreement handling, plans and price.",
  h1: `${KO} vs Perplexity Model Council`,
  label: "Compare",
  lastChecked: LAST_CHECKED,
  blocks: [
    { t: "p", text: `Perplexity Model Council and ${KO} share an idea we agree with: one AI model shouldn't be the last word. Both send your question to several models and return one synthesized answer that shows where they agree and differ.` },
    { t: "p", text: "The differences are price, how the models are chosen, and what you can inspect afterwards." },
    { t: "short", text: `A model council for $45, not $200, with a disagreement summary that shows where models split. On web and iOS, Model Council requires Perplexity Max at $200/month. ${K} Plus is $45/month, and ${O} picks the models per question with cost in mind.` },
    {
      t: "list",
      title: "What Perplexity Model Council does well",
      items: [
        { b: "Built into a strong search product.", text: "Model Council sits inside Perplexity, which is known for search-grounded answers with citations." },
        { b: "Frontier models from three labs by default.", text: "On web, a council runs three models, one each from Anthropic, OpenAI, and Google by default, and you can change which ones." },
        { b: "Clear agreement view.", text: "A synthesizer model reviews the outputs and gives one answer that shows where the models agree and differ." },
        { b: "Bigger councils in Perplexity Computer.", text: "There you can use 2–8 models, and it can produce reports and decks." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: 3 models on web, default one each from Anthropic/OpenAI/Google, toggleable; synthesizer
        // shows agree/differ; Computer 2–8 models with synthesis + each model's report as files, PDF/deck/spreadsheet on
        // request. Source: https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council (help center,
        // last modified Sep 4, 2026; read via search index because direct fetch returned 403)
      ],
    },
    {
      t: "list",
      title: `How ${K} approaches it`,
      items: [
        { b: "Picks the models the question needs.", text: `${O} can route across multiple model families, but doesn't ask every model every time. It picks per question based on need and cost, weighing quality, reliability, latency, and cost.` },
        { b: "Flags disagreement.", text: `When models disagree, ${K} flags it instead of silently picking one answer.` },
        { b: "Evaluation, not voting.", text: "The synthesizer weighs the evidence and reasoning behind each response rather than taking a majority vote, because the minority can be right." },
        { b: "Consensus and disagreements shown.", text: "Every answer shows how strongly the models agreed and how they lined up (for example, 5 agree, 1 disagrees)." },
        { b: "A disagreement summary.", text: "It shows which model or models disagreed and summarizes what they concluded differently." },
        { b: "An answer you can inspect.", text: `Below every answer you can expand: ${panel}.` },
      ],
    },
    {
      t: "table",
      caption: `${K} and Perplexity Model Council compared`,
      head: ["", KO, "Perplexity Model Council"],
      rows: [
        ["Price to use it", plansFreeNote, "Web/iOS: Perplexity Max, $200/mo or $2,000/yr, or Enterprise Max. Not on Free, Pro, Education Pro, or Enterprise Pro. Computer version on all paid plans, charged in credits. Monthly Model Council query cap on web/iOS."],
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://www.perplexity.ai/help-center/en/articles/11680686-perplexity-max ($200/mo or
        // $2,000/yr; last modified Sep 14, 2026) and https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council
        // (plan availability, monthly cap, Computer on all paid plans). Read via search index; direct fetch 403.
        ["Who picks the models", `${O}, per question (cost-aware)`, "You. Default is one model each from Anthropic, OpenAI, and Google."],
        ["Models per question", "Varies by question. Can route across multiple model families; the router picks per question based on need and cost", "3 on web; 2–8 in Perplexity Computer"],
        ["One synthesized answer", "Yes", "Yes"],
        ["Disagreement shown", "Yes: a disagreement summary (which models split, and what they concluded differently)", "Yes, shows where models agree and differ"],
        ["How disagreements are resolved", "Synthesizer weighs evidence and reasoning; not a majority vote", "Synthesizer model reviews outputs"],
        // "Source checking" row cut: [WHEN RETRIEVAL IS LIVE].
        ["Agreement display", "Yes: consensus percentage and agree/disagree count", "Not documented in Perplexity's help center or launch blog"],
        // Checked 2026-09-27, re-checked 2026-10-12: neither https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council nor
        // https://www.perplexity.ai/hub/blog/introducing-model-council describes a confidence score; the blog says converging
        // models let you 'move faster with confidence'. Absence of documentation, not proof the feature doesn't exist.
        ["Sources shown", `Sources the models cite (not checked by ${K})`, "Search-grounded citations"],
        ["Platforms", "Web (responsive on mobile browsers)", "Web and iOS"],
        ["Strongest at", "Getting one weighed answer at a professional price", "Search-grounded research inside Perplexity"],
      ],
    },
    {
      t: "picks",
      groups: [
        { title: "Pick Perplexity Model Council if:", items: ["You already pay for Perplexity Max, or your company has Enterprise Max.", "Search-grounded answers with citations matter most to you.", "You want to choose the three models yourself, or you want 2–8 models in Perplexity Computer."] },
        { title: `Pick ${K} if:`, items: ["You want a multi-model council without a $200/month plan. Plus is $45, and Free lets you try it on free open models.", "You'd rather have the models chosen per question than pick them yourself.", "You want a disagreement summary that shows where models split, with consensus shown on every answer."] },
      ],
    },
  ],
  faq: [
    { q: `Is ${K} a cheaper Perplexity Model Council?`, a: `Both send a question to several AI models and synthesize one answer. On web and iOS, Model Council requires Perplexity Max ($200/month). ${K} Plus is $45/month, and there's a Free plan. The products work differently: Perplexity lets you choose the models inside its search product, and ${O} picks them per question.` },
    { q: `How does ${K} choose which models to ask?`, a: `${O} can route across multiple model families, and the router picks per question based on what the question needs and what it costs. A simple question may use fewer models than a complex one. In Model Council, you choose the models: 3 on web, or 2–8 in Perplexity Computer.` },
    { q: "If most models agree, is the answer right?", a: `Not necessarily. Consensus can be wrong. ${K} weighs the evidence and reasoning behind each response and shows how strongly the models agreed, instead of treating a majority as the truth.` },
    // "Does Keplar cite sources like Perplexity?" cut: [WHEN RETRIEVAL IS LIVE].
  ],
  sources: [
    { label: "Perplexity Help Center, “What is Model Council”", url: "https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council" },
    { label: "Perplexity blog, “Introducing Model Council” (Feb 5, 2026)", url: "https://www.perplexity.ai/hub/blog/introducing-model-council" },
    { label: "Perplexity blog, “Model Council comes to Computer”", url: "https://www.perplexity.ai/en-GB/hub/blog/model-council-comes-to-computer" },
    { label: "Perplexity Help Center, “Perplexity Max” ($200/mo or $2,000/yr)", url: "https://www.perplexity.ai/help-center/en/articles/11680686-perplexity-max" },
    { label: "Price and plan availability confirmed on the help center pages above on Oct 12, 2026. The exact monthly Model Council cap isn't published there." },
  ],
};

export const poe: ComparePage = {
  slug: "poe",
  path: "/compare/poe",
  metaTitle: "Keplar One vs Poe: Many AI Bots vs One Answer",
  metaDescription: "Poe gives you many AI bots to switch between; Keplar One asks several models at once and writes one checked answer. How they differ, with prices.",
  h1: `${KO} vs Poe`,
  label: "Compare",
  lastChecked: LAST_CHECKED,
  blocks: [
    { t: "p", text: `Poe and ${KO} both give you access to more than one AI model. They're built for different jobs. Poe is a large hub where you choose and chat with models and bots, and can compare their replies. ${K} sends one question to several models and gives you one synthesized answer.` },
    { t: "short", text: `If you want to pick bots and read each reply yourself, Poe is excellent at that. If you want the models' answers compared and combined for you, that's what ${K} does.` },
    {
      t: "list",
      title: "What Poe does well",
      items: [
        { b: "Huge catalog.", text: "Access to many AI models plus a marketplace of user-created bots." },
        { b: "Multi-bot chat.", text: "You can compare answers from recommended bots in one click, or @-mention any bot into the same thread." },
        { b: "Message several models at once", text: "and compare their responses side by side in one chat." },
        { b: "Group chats", text: "with up to 200 people and bots." },
        { b: "Low entry price.", text: "Paid plans start at $4.99/month." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: group chats up to 200 people and points at $30 per 1M,
        // https://help.poe.com/hc/en-us/articles/19944206309524-Poe-FAQs (updated Jul 8, 2026); 'subscription plans starting
        // at $4.99/month', https://help.poe.com/hc/en-us/articles/19945140063636-Poe-Purchases-FAQs (renamed from "Subscriptions FAQs";
        // poe.com/about redirects to sign-in since Oct 2026)
        { b: "API and bot creation", text: "for builders." },
      ],
    },
    {
      t: "list",
      title: `How ${K} approaches it`,
      items: [
        { b: "One answer, not several threads to reconcile.", text: `${O} sends your question to the models it needs, cost-aware, and synthesizes one answer.` },
        { b: "Disagreement is flagged,", text: "not left for you to spot." },
        { b: "Evidence and reasoning over votes.", text: "The synthesizer weighs the evidence and reasoning behind each response rather than taking a majority vote." },
        { b: "A disagreement summary", text: "shows which model or models split and what they concluded differently." },
        { b: "Consensus and disagreements shown", text: "on every answer." },
      ],
    },
    {
      t: "table",
      caption: `${K} and Poe compared`,
      head: ["", KO, "Poe"],
      rows: [
        ["Main output", "One synthesized answer", "Replies from each bot you choose"],
        ["Multiple models on one question", `Yes, chosen by ${O} (cost-aware)`, "Yes: multi-bot chat, @-mentions, messaging several models at once"],
        ["Merges replies into one answer", "Yes", "We didn't find a synthesis feature"],
        // Checked 2026-09-27, re-checked 2026-10-12: Poe FAQs (https://help.poe.com/hc/en-us/articles/19944206309524-Poe-FAQs), poe.com/about, the
        // multi-bot chat blog and the multi-message demo describe comparing bots in one thread; none describes merging
        // replies into one answer. Absence, not proof.
        ["Disagreement flagged", "Yes, with a disagreement summary", "You compare replies yourself"],
        ["Consensus display", "Yes", "Not found"],
        // "Source checking" row cut: [WHEN RETRIEVAL IS LIVE].
        ["Bot marketplace and custom bots", "No", "Yes, a major strength"],
        ["Group chats with people", "No", "Yes, up to 200 people and bots"],
        ["Pricing", plans, "Free tier; paid from $4.99/mo; compute-points system with add-on points"],
        ["Deep Research", "Plus includes Deep Research for occasional use", "Available through research bots, e.g. Gemini Deep Research and Perplexity Deep Research"],
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://poe.com/Perplexity-Deep-Research (labelled OFFICIAL on Poe) and Poe's announcement of
        // Gemini Deep Research (https://poe.com/Gemini-Deep-Research, per Poe's LinkedIn post, Dec 2025).
        ["Full reply from each model", "Not shown side by side; the answer panel shows consensus, models consulted, cited sources, disagreements, verification, and a reasoning summary", "Yes"],
        ["Platforms", "Web (responsive on mobile browsers)", "Web, desktop apps, iOS, and Android"],
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: Poe FAQs, group-chat section ('Open Poe on web, desktop apps, iOS, or Android'):
        // https://help.poe.com/hc/en-us/articles/19944206309524-Poe-FAQs
      ],
    },
    {
      t: "picks",
      groups: [
        { title: "Pick Poe if:", items: ["You want to choose specific models and bots, including community-built ones.", "You like reading each model's reply and deciding yourself.", "You want group chats, bot creation, or the lowest entry price."] },
        { title: `Pick ${K} if:`, items: ["You want one answer, with the comparison done for you.", "You want disagreements between models flagged, and consensus shown.", "You'd rather not pick models for every question."] },
      ],
    },
  ],
  faq: [
    { q: "Can Poe compare several AI models at once?", a: `Yes. Poe's multi-bot chat lets you compare replies from several bots in one thread, or @-mention any bot into the conversation. ${K} differs in what it does with those replies: it combines them into one synthesized answer and flags where they disagree.` },
    { q: `Is ${K} a Poe alternative?`, a: `For some people. If you mostly use Poe to ask several models the same question and then work out which answer to trust, ${K} is built for that. If you use Poe for its bot marketplace, custom bots, or group chats, ${K} doesn't replace those.` },
    { q: `Why is ${K} Plus more expensive than Poe's entry plan?`, a: `Poe's paid plans start at $4.99/month for access to its models and bots. ${K} Plus ($45/month) pays for several models answering each question, plus the step that compares and combines them into one answer. There's also a Free plan.` },
  ],
  sources: [
    // Poe's own multi-bot blog post and demo page are no longer public (sign-in redirect / 404 on 2026-10-12); third-party report instead.
    { label: "Analytics Vidhya, “Poe's Multi-Bot Chat” (Apr 19, 2024): replies from several bots in one thread, @-mention any bot", url: "https://www.analyticsvidhya.com/blog/2024/04/poes-multi-bot-chat-a-game-changer-in-ai-interactivity/" },
    { label: "Poe Help Center FAQs (group chats up to 200; points; platforms), fetched Oct 12, 2026", url: "https://help.poe.com/hc/en-us/articles/19944206309524-Poe-FAQs" },
    { label: "Poe Purchases FAQs (paid from $4.99/mo; add-on points from $30 per 1M), fetched Oct 12, 2026", url: "https://help.poe.com/hc/en-us/articles/19945140063636-Poe-Purchases-FAQs" },
    { label: `“No synthesis found”: ${K} Researcher's competitor study, Sep 27, 2026.` },
    // Editorial (not rendered): don't publish Poe's higher-tier prices ($19.99–$249.99); third-party source only.
  ],
};

export const chathub: ComparePage = {
  slug: "chathub",
  path: "/compare/chathub",
  metaTitle: "Keplar One vs ChatHub: Side by Side vs One Answer",
  metaDescription: "ChatHub shows several chatbots side by side; Keplar One compares them for you and writes one answer with the disagreements shown. Features and prices.",
  h1: `${KO} vs ChatHub`,
  label: "Compare",
  lastChecked: LAST_CHECKED,
  blocks: [
    { t: "p", text: `ChatHub and ${KO} start from the same insight. ChatHub puts it well: any single AI can hallucinate, so get more than one perspective. What you get back is different. ChatHub shows you several replies side by side, and ${K} gives you one synthesized answer.` },
    { t: "short", text: `ChatHub is a fast, affordable way to read several models' replies side by side. ${K} does the comparing for you and flags where the models disagree.` },
    {
      t: "list",
      title: "What ChatHub does well",
      items: [
        { b: "True side-by-side view", text: "of up to 6 models at once." },
        { b: "Available almost everywhere:", text: "web app, browser extension, iOS, Android, Windows, and Mac." },
        { b: "Extra tools:", text: "image generation, file upload, web search, and a prompt library." },
        { b: "Affordable:", text: "Pro at $19/month and a higher plan at $39/month, with annual discounts." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: Pro $19/mo or $14.99/mo yearly, 10,000 basic + 1,500 advanced queries; Unlimited $39/mo or
        // $24.99/mo yearly: https://chathub.gg/pricing.md. Up to six chatbots at once: https://doc.chathub.gg/. Platforms
        // (web, Chrome extension, iOS, Android, Windows, macOS): https://chathub.gg/llms.txt. 'compare answers, identify
        // disagreement, and select the most useful result': https://chathub.gg/llms-full.txt
        { b: "Honest framing:", text: "ChatHub's docs position side-by-side use as a way to identify disagreement yourself." },
      ],
    },
    {
      t: "list",
      title: `How ${K} approaches it`,
      items: [
        { b: "The comparison is done for you.", text: `${O} picks the models the question needs (cost-aware), then synthesizes one answer.` },
        { b: "Disagreement flagged,", text: "with consensus shown." },
        { b: "Evidence and reasoning over votes.", text: "The synthesizer weighs evidence and reasoning rather than taking a majority vote." },
        { b: "A disagreement summary", text: "shows which model or models split and what they concluded differently." },
      ],
    },
    {
      t: "table",
      caption: `${K} and ChatHub compared`,
      head: ["", KO, "ChatHub"],
      rows: [
        ["Main output", "One synthesized answer", "Up to 6 replies side by side"],
        ["Who reconciles the answers", O, "You"],
        ["Who picks the models", `${O}, per question (cost-aware)`, "You"],
        ["Disagreement flagged", "Yes, with a disagreement summary", "You spot it by reading the replies"],
        ["Consensus display", "Yes", "Not found"],
        // "Source checking" row cut: [WHEN RETRIEVAL IS LIVE].
        ["Full reply from each model", "Not shown side by side", "Yes, up to 6 side by side"],
        ["Platforms", "Web only, responsive on mobile browsers; no native apps", "Web, extension, iOS, Android, Windows, Mac"],
        ["Pricing", plans, "Paid plans from $19/mo (free tier details not published); Pro $19/mo ($14.99/mo annual), 10k basic and 1,500 advanced queries; “Unlimited” plan $39/mo ($24.99/mo annual)"],
      ],
    },
    {
      t: "picks",
      groups: [
        { title: "Pick ChatHub if:", items: ["You want to read every model's full reply side by side.", "You want native desktop, mobile, and browser-extension apps.", "You want the lowest price, or need image generation alongside chat."] },
        { title: `Pick ${K} if:`, items: ["You don't want to read six answers and referee them.", "You want a disagreement summary and consensus shown on one answer.", "You'd rather have the models chosen for each question."] },
      ],
    },
  ],
  faq: [
    { q: `What's the difference between ${K} and ChatHub?`, a: `ChatHub shows several AI models' replies side by side, and you decide which to trust. ${K} sends your question to the models it needs, then combines their answers into one, flagging where they disagree and showing the consensus level.` },
    { q: `Can I see each model's full reply side by side in ${K}?`, a: `No. ${K} doesn't have a side-by-side view of full responses. Below every answer you can expand: ${panel}. If reading every full reply side by side is what you want, ChatHub is built for that.` },
    { q: `Is ChatHub cheaper than ${K}?`, a: `Yes. ChatHub's paid plans are $19 and $39 a month, and ${K} Plus is $45. The products do different jobs: ChatHub shows the replies side by side, and ${K} compares and combines them into one answer. Both have free plans.` },
  ],
  sources: [
    { label: "ChatHub homepage (fetched Oct 12, 2026)", url: "https://chathub.gg/" },
    { label: "ChatHub pricing (fetched Oct 12, 2026)", url: "https://chathub.gg/pricing.md" },
    { label: "Up to six chatbots at once (fetched Oct 12, 2026)", url: "https://doc.chathub.gg/" },
    { label: "“Identify disagreement” wording (“ChatHub makes it easier to compare answers, identify disagreement, and select the most useful result”), fetched Oct 12, 2026", url: "https://chathub.gg/llms-full.txt" },
    { label: "Platforms (fetched Oct 12, 2026)", url: "https://chathub.gg/llms.txt" },
    // Editorial (not rendered): the free plan's 2-bot limit is third-party only (e.g. tooljunction.io), not confirmed on an
    // official ChatHub page, so it's not claimed. Don't publish user counts (self-reported or third-party).
  ],
};

export const hub: ComparePage = {
  slug: "",
  path: "/compare",
  metaTitle: "Best Multi-Model AI Tools and Model Council Apps",
  metaDescription:
    "An honest comparison of multi-model AI tools: Keplar One, Perplexity Model Council, ChatHub, Poe and others, by how they combine models and what they cost.",
  h1: "Best multi-model AI tools and AI model council alternatives",
  label: "Compare",
  lastChecked: LAST_CHECKED,
  blocks: [
    { t: "disclosure", text: `Disclosure: we make ${KO}, one of the tools on this list. We've tried to describe every tool fairly, cite our sources, and say where another tool is the better choice. Prices change often; last checked ${LAST_CHECKED}.` },
    { t: "p", text: "Multi-model AI tools fall into two groups:" },
    {
      t: "list",
      title: "",
      ordered: true,
      items: [
        { b: "Council and consensus tools", text: "send your question to several models and synthesize one answer." },
        { b: "Hubs and aggregators", text: "give you many models to switch between or compare side by side, and you reconcile the answers yourself." },
      ],
    },
    { t: "p", text: "Neither is better in general. It depends on whether you want to read every reply or get one answer." },
    { t: "h2", text: "Quick comparison" },
    {
      t: "table",
      caption: "Multi-model AI tools at a glance",
      head: ["Tool", "Type", "One synthesized answer?", "Starting paid price", "Best for"],
      rows: [
        [KO, "Council", "Yes; disagreement summary, shows consensus level", plans, "One weighed answer, with models picked per question"],
        ["Perplexity Model Council", "Council (inside Perplexity)", "Yes; shows agreement and differences", "Perplexity Max $200/mo (web/iOS)", "Perplexity Max subscribers who want search-grounded answers"],
        ["Microsoft 365 Copilot Researcher: Council", "Council (enterprise preview)", "Yes; full reports plus a summary of agreement and divergence", "Microsoft Copilot license + Frontier program", "Microsoft 365 enterprises"],
        ["MultipleChat", "Workspace with several modes", "Yes, in Ensemble mode; also Compare, Debate, and more", "Pro $20/mo", "People who want many modes and team plans"],
        ["Satcove", "Consensus app", "Yes; structured report with agreements, divergences, and a recommendation", "Starter €14.99/mo", "Published consensus allowances per plan"],
        ["AllChat", "Consensus app", "Yes; agreement and disagreements flagged, with sources", "Pro $9/mo ($8/mo billed annually)", "A low-cost consensus app with an iPhone app"],
        ["Poe", "Hub", "Not found; multi-bot chat to compare", "From $4.99/mo", "Bot marketplace, many models, group chats"],
        ["ChatHub", "Side-by-side", "No; up to 6 replies side by side", "Pro $19/mo", "Reading replies side by side, on every platform"],
        ["TypingMind", "Bring-your-own-API-key front end", "No; parallel multi-model chats (Premium)", "One-time purchase, plus your own API costs", "Power users with their own API keys"],
        ["Magai", "Workspace", "No; switch models mid-chat", "Standard $20/mo", "Creators and teams switching models"],
      ],
    },
    { t: "h2", text: "Council and consensus tools (one synthesized answer)" },
    {
      t: "tool",
      name: KO,
      text: `${KO}'s engine can route across multiple model families, and picks the models per question based on need and cost. It gives you one synthesized answer. The synthesizer weighs the evidence and reasoning behind each response rather than taking a majority vote. A disagreement summary shows which models split and what they concluded differently, and every answer shows its consensus percentage and agree/disagree count. The answer panel also lists the models consulted, the sources the models cite, verification, and a reasoning summary. Web only, responsive on mobile browsers.`,
      bullets: [
        { b: "Plans:", text: `${plansFreeNote}. Plus includes Deep Research for occasional use.` },
        { b: "Why pick it:", text: "a model council for $45, not $200, with a disagreement summary that shows where models split, and no need to pick models yourself." },
        { b: "Consider another tool if:", text: "you want to read every model's full reply side by side, want native apps, or want the cheapest consensus app." },
      ],
    },
    {
      t: "tool",
      name: "Perplexity Model Council",
      text: "Runs three models on web (by default one each from Anthropic, OpenAI, and Google; you can change them), and 2–8 in Perplexity Computer. A synthesizer shows where they agree and differ.",
      bullets: [
        { b: "Price:", text: "Perplexity Max $200/mo or $2,000/yr, or Enterprise Max. Not on Free, Pro, Education Pro, or Enterprise Pro. Computer version on all paid plans, charged in credits." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://www.perplexity.ai/help-center/en/articles/11680686-perplexity-max,
        // https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council
        { b: "Why pick it:", text: "search-grounded answers with citations from a leading answer engine." },
      ],
    },
    {
      t: "tool",
      name: "Microsoft 365 Copilot Researcher: Council",
      text: "Runs the same question through multiple deep-reasoning research agents (for example, GPT and Claude), keeps each model's full report, and adds a summary that highlights where the models agree, where they diverge, and what each contributes. Public preview from March 30, 2026; still limited to the Frontier program.",
      bullets: [
        { b: "Access:", text: "Microsoft 365 Copilot Frontier program plus a Microsoft Copilot license; an admin must allow Anthropic models." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://support.microsoft.com/en-us/microsoft-365-copilot/use-model-council-with-researcher-in-microsoft-365-copilot
        // (Frontier required; Copilot license; admin must allow Anthropic; GPT + Claude; full reports + agree/diverge summary).
        // Preview date: M365 Message Center MC1265765 archive, https://mc.merill.net/message/MC1265765 (that notice also said a
        // Copilot Premium license).
        { b: "Why pick it:", text: "if your organization lives in Microsoft 365 and is in the Frontier program." },
      ],
    },
    {
      t: "tool",
      name: "MultipleChat",
      text: "The most feature-rich option we found: Compare mode (side by side) plus Ensemble (parallel answers, then synthesis), Debate, Smart, and Research modes, and “Auto Verification”.",
      bullets: [
        { b: "Price:", text: "Free; Pro $20/mo ($179.99/yr); Smart $90/mo; Teams $25 or $95 per seat; a separate desktop app, $250 once, with your own API keys." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://multiple.chat/pricing (modes incl. Smart, Ensemble, Debate, Research; Compare Mode;
        // Auto Verification; iOS/Android apps). Desktop app $250 one-time with your own keys: https://multiple.chat/desktop-app
        { b: "Why pick it:", text: "many ways to combine models, and team plans." },
      ],
    },
    {
      t: "tool",
      name: "Satcove",
      text: "Six models (Claude, GPT, Gemini, Mistral, Perplexity, Grok) produce a structured report with agreements, divergences, and a recommendation, plus an alignment signal. Includes a debate mode (“Cove Fight”) and “Privacy Shield”, which tries to replace common identifiers before model calls.",
      // Corrected 2026-09-27: Satcove calls it an 'alignment signal', not an agreement score; Privacy Shield 'attempts to
      // replace common identifiers'. Source: https://satcove.com/pricing
      bullets: [
        { b: "Price:", text: "Free (3 consensus runs/week); Starter €14.99; Pro €39.99; Pro Max €99.99; Enterprise." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://satcove.com/pricing
        { b: "Why pick it:", text: "it publishes exactly how many consensus runs each plan includes." },
      ],
    },
    {
      t: "tool",
      name: "AllChat",
      text: "Several frontier models (ChatGPT, Claude, Gemini, Grok) plus research models (Perplexity, Exa) produce one answer that flags agreement, disagreement, and sources, with a transparency panel showing each model's contribution.",
      bullets: [
        { b: "Price:", text: "Free; Pro $9/mo ($8/mo billed annually); Max $18/mo ($15/mo billed annually); Enterprise." },
        // Corrected 2026-09-27: removed 'agreement score' (not described on AllChat's current pages); model list and
        // transparency panel from https://askallchat.com/; prices from https://askallchat.com/pricing
        { b: "Why pick it:", text: "the lowest-cost consensus app we found, with an iPhone app." },
      ],
    },
    { t: "h2", text: "Hubs and side-by-side tools (you reconcile the answers)" },
    {
      t: "tool",
      name: "Poe",
      text: "A large hub of AI models and user-created bots. Multi-bot chat lets you compare replies or @-mention bots into one thread, and group chats hold up to 200 people and bots. We didn't find a feature that merges replies into one answer.",
      bullets: [
        { b: "Price:", text: "paid from $4.99/mo; compute points." },
        { b: "Why pick it:", text: "the widest catalog and bot ecosystem." },
      ],
    },
    {
      t: "tool",
      name: "ChatHub",
      text: "Shows up to 6 models side by side on web, browser extension, iOS, Android, Windows, and Mac. Includes image generation, file upload, and web search.",
      bullets: [
        { b: "Price:", text: "Pro $19/mo; “Unlimited” plan $39/mo." },
        { b: "Why pick it:", text: "affordable side-by-side reading, on every platform." },
      ],
    },
    {
      t: "tool",
      name: "TypingMind",
      text: "A front end where you bring your own API keys. The premium tier includes multi-model parallel chats.",
      bullets: [
        { b: "Price:", text: "one-time license, plus your own API usage costs." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://www.typingmind.com/buy (one-time licenses Standard $39, Extended $79, Premium $99;
        // multi-model parallel chats in Premium; web/PWA, no native mobile apps). Prices left out of copy on purpose.
        { b: "Why pick it:", text: "control and low cost for technical users." },
      ],
    },
    {
      t: "tool",
      name: "Magai",
      text: "A workspace for switching models mid-chat, with agents and many integrations. We didn't find a consensus feature.",
      bullets: [
        { b: "Price:", text: "Standard $20, Pro $40, Ultra $200 per month. Monthly usage credit roughly equals the price paid." },
        // Confirmed 2026-09-27, re-confirmed 2026-10-12: https://help.magai.co/en/articles/10318014-how-much-usage-does-each-plan-include (model
        // switching mid-chat, agents, 150+ integrations)
        { b: "Why pick it:", text: "creators and teams who switch models within one workspace." },
      ],
    },
    {
      t: "list",
      title: "How to choose",
      items: [
        { b: "Want one answer, with disagreements surfaced?", text: "Choose a council or consensus tool. Compare the price, how models are chosen, and what you can inspect." },
        { b: "Want to read every model's reply?", text: "Choose a hub or side-by-side tool." },
        // Copy file says "Microsoft 365 Copilot Premium"; aligned with the Sep 27 correction (Frontier program + a Copilot license).
        { b: "Already paying for Perplexity Max or Microsoft 365 Copilot?", text: "Try their council features first." },
        { b: "Watch out for accuracy claims.", text: `Several tools in this category make them. We didn't find a current, reproducible public evaluation behind any of them, and we don't make one for ${K}.` },
        { b: "Agreement isn't proof.", text: "In any council tool, models can agree and still be wrong. Look for tools that show how the answer was reached, not only a score." },
      ],
    },
  ],
  faq: [
    { q: "What is an AI model council?", a: `A tool that sends one question to several AI models and combines their answers into one, usually showing where they agreed and disagreed. Perplexity, Microsoft, and ${K} all use the “council” idea. Consensus apps like Satcove and AllChat work in a similar way.` },
    { q: "What's the cheapest alternative to Perplexity Model Council?", a: `Several consensus apps start under $20/month, including AllChat, Satcove, and MultipleChat's Pro plan. ${K} Plus is $45/month, and ${K} has a Free plan. Model Council on web and iOS requires Perplexity Max at $200/month.` },
    { q: "Do Poe or ChatHub combine answers into one?", a: "Based on what we found, no. Poe lets you compare bots in one thread, and ChatHub shows up to 6 replies side by side. You compare the answers yourself. That's the right tool if you want to read every reply." },
    { q: "Does agreement between models mean the answer is correct?", a: "No. Models can share the same gaps and mistakes. A good multi-model tool shows why it reached its answer and how confident it is, rather than treating a majority as the truth." },
  ],
  sourcesNote: "On official pages.",
  sources: [
    { label: "Perplexity: help center and blogs (see the Perplexity comparison)" },
    { label: "Microsoft: support article (fetched Oct 12, 2026)", url: "https://support.microsoft.com/en-us/microsoft-365-copilot/use-model-council-with-researcher-in-microsoft-365-copilot" },
    { label: "Microsoft: M365 Message Center MC1265765 archive", url: "https://mc.merill.net/message/MC1265765" },
    { label: "MultipleChat pricing (fetched Oct 12, 2026)", url: "https://multiple.chat/pricing" },
    { label: "MultipleChat desktop app ($250 one-time; fetched Oct 12, 2026)", url: "https://multiple.chat/desktop-app" },
    { label: "Satcove pricing (fetched Oct 12, 2026)", url: "https://satcove.com/pricing" },
    { label: "AllChat (fetched Oct 12, 2026)", url: "https://askallchat.com/" },
    { label: "AllChat pricing (fetched Oct 12, 2026)", url: "https://askallchat.com/pricing" },
    { label: "Poe: see the Poe comparison" },
    { label: "ChatHub: see the ChatHub comparison" },
    { label: "TypingMind (fetched Oct 12, 2026)", url: "https://www.typingmind.com/buy" },
    { label: "Magai usage per plan (fetched Oct 12, 2026)", url: "https://help.magai.co/en/articles/10318014-how-much-usage-does-each-plan-include" },
  ],
};

export const comparePages = [perplexity, poe, chathub];
