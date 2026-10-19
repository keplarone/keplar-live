/**
 * Search-intent clusters: the map from what people search for to the Keplar page that answers it and the product route it
 * leads to. One registry drives hub pages, breadcrumbs, "Keep reading" links, the cluster sitemaps and the coverage report
 * on /admin/seo, so a new page joins a cluster in one place and is linked from its hub at once.
 *
 * Rules: a cluster has one hub (an existing page, or a planned one that is built before it is listed); supporting pages are
 * real URLs that tests check against the sitemap; `product` is where a reader goes to do the thing. No search volumes or
 * difficulty scores live here: none are measured, so none are claimed (docs/seo/KEYWORDS.md).
 */
export type ClusterId =
  | "model-comparisons"
  | "study"
  | "research"
  | "presentations"
  | "images"
  | "video"
  | "writing"
  | "productivity"
  | "prompts"
  | "pricing-capabilities"
  | "tutorials";

export type Cluster = {
  id: ClusterId;
  /** Name for breadcrumbs, hub headings and the admin report. */
  name: string;
  /** The search intent in one sentence. */
  intent: string;
  /** Hub page path. */
  hub: string;
  /** "live" hubs are in the sitemap; a "planned" hub is built before it is listed anywhere (none planned today). */
  hubStatus: "live" | "planned";
  /** Where a reader does the thing: the chat (/), a tab under /app, or a page. */
  product: { href: string; label: string };
  /** Existing supporting pages (docs, blog, guides, use cases, prompts, comparisons, landing pages). */
  pages: readonly string[];
  /** Free tool slugs (/tools/<slug>) that belong to this cluster, once built. */
  tools: readonly string[];
  /** Phrases the cluster answers, for the hub copy and the admin report. Intent wording, not volumes. */
  queries: readonly string[];
};

export const CLUSTERS: readonly Cluster[] = [
  {
    id: "model-comparisons",
    name: "AI model comparisons",
    intent: "Which AI model or assistant is better for a task, and how several models compare on the same question.",
    hub: "/compare-ai-models",
    hubStatus: "live",
    product: { href: "/", label: "Ask Keplar and see the models side by side" },
    pages: [
      "/models", "/multi-model-ai", "/chatgpt-alternative", "/vs", "/vs/chatgpt", "/vs/claude", "/vs/gemini",
      "/compare", "/compare/perplexity-model-council", "/compare/poe", "/compare/chathub",
      "/blogs/chatgpt-vs-claude-vs-gemini-vs-perplexity", "/blogs/best-ai-for-coding", "/blogs/best-ai-for-writing", "/blogs/best-ai-for-math",
      "/blogs/best-ai-for-image-generation", "/blogs/how-many-ai-models-are-enough", "/blogs/why-ai-models-disagree",
      "/docs/reference/model-roster", "/docs/how-it-works/model-diversity", "/docs/how-it-works/routing-and-panels",
    ],
    tools: ["ai-model-comparison"],
    queries: ["compare AI models", "best AI model for coding", "ChatGPT vs Claude vs Gemini", "ask multiple AI models at once", "why do AI models disagree"],
  },
  {
    id: "study",
    name: "AI for studying",
    intent: "Using AI to learn: flashcards, quizzes, study plans and explanations from a reader's own notes or textbook.",
    hub: "/ai-study-tool",
    hubStatus: "live",
    product: { href: "/app/study", label: "Open Study mode (free account)" },
    pages: [
      "/docs/using-keplar/study-mode", "/guides/study-from-a-pdf", "/use-cases/study-for-an-exam", "/blogs/best-ai-for-essays-and-studying",
      "/blogs/best-ai-for-math", "/prompts/learning", "/for-students",
    ],
    tools: ["study-guide-generator", "flashcard-generator", "learning-plan-generator"],
    queries: ["AI study tool", "AI flashcard generator", "make a study guide from a PDF", "AI quiz from notes", "study plan generator"],
  },
  {
    id: "research",
    name: "AI reasoning and research",
    intent: "Getting a researched, checkable answer: deep research, reasoning steps, sources, fact checks and second opinions.",
    hub: "/ai-research-assistant",
    hubStatus: "live",
    product: { href: "/", label: "Ask Keplar with Deep Research" },
    pages: [
      "/ai-answer-engine", "/ai-fact-check", "/docs/using-keplar/deep-research", "/blogs/what-is-deep-research", "/use-cases/research-a-new-topic",
      "/use-cases/check-a-claim-before-sharing", "/for-researchers", "/blogs/how-to-check-an-ai-answer", "/blogs/can-you-trust-ai-consensus",
      "/prompts/research", "/prompts/checking-ai", "/docs/how-it-works/verification-review", "/docs/how-it-works/sources-and-citations",
      "/docs/using-keplar/thoroughness-modes", "/docs/how-it-works/why-consensus-can-be-wrong", "/blogs/what-are-ai-hallucinations",
      "/reports", "/reports/keplar-core-evals-2026-10",
    ],
    tools: ["research-question-generator", "citation-formatter"],
    queries: ["AI research assistant", "deep research AI", "AI fact check", "research question generator", "how to check an AI answer"],
  },
  {
    id: "presentations",
    name: "AI presentations and slides",
    intent: "Turning a topic, notes or a document into a slide deck, and exporting it to PowerPoint or PDF.",
    hub: "/ai-slideshow-maker",
    hubStatus: "live",
    product: { href: "/app/slides", label: "Open Slides (Plus and Pro)" },
    pages: ["/docs/using-keplar/slideshow-creator", "/guides/slide-deck-from-notes", "/use-cases/make-a-presentation"],
    tools: ["presentation-outline-generator"],
    queries: ["AI slideshow maker", "AI presentation generator", "slide deck from notes", "presentation outline generator"],
  },
  {
    id: "images",
    name: "AI image generation",
    intent: "Making or understanding images with AI: generating pictures from a description, and asking about screenshots and photos.",
    hub: "/ai-image-generator",
    hubStatus: "live",
    product: { href: "/", label: "Ask Keplar for an image (Plus and up)" },
    pages: ["/docs/create/generate-images", "/blogs/best-ai-for-image-generation", "/docs/using-keplar/attachments-images-video"],
    tools: ["prompt-optimizer"],
    queries: ["AI image generator", "generate an image from text", "best AI for image generation", "image prompt ideas"],
  },
  {
    id: "video",
    name: "AI video generation",
    intent: "Generating short video clips from a description, and asking questions about a video.",
    hub: "/ai-video-generator",
    hubStatus: "live",
    product: { href: "/", label: "Ask Keplar for a video (Pro, beta)" },
    pages: ["/docs/create/generate-video", "/docs/using-keplar/attachments-images-video"],
    tools: ["prompt-optimizer"],
    queries: ["AI video generator", "text to video AI", "generate a video clip from a prompt"],
  },
  {
    id: "writing",
    name: "AI writing and summarization",
    intent: "Drafting, editing, tightening and summarizing text while keeping the writer's meaning and voice.",
    hub: "/ai-writing-assistant",
    hubStatus: "live",
    product: { href: "/", label: "Ask Keplar to edit or summarize" },
    pages: [
      "/blogs/best-ai-for-writing", "/use-cases/write-and-edit-with-feedback", "/use-cases/understand-a-document", "/prompts/writing", "/for-writers",
      "/docs/using-keplar/write-better-questions", "/blogs/why-ai-agrees-with-you",
    ],
    tools: ["text-summarizer", "writing-improver"],
    queries: ["AI writing assistant", "AI text summarizer", "improve my writing with AI", "summarize a document"],
  },
  {
    id: "productivity",
    name: "AI productivity",
    intent: "Getting work done with AI: decisions, follow-ups, code reviews, agents, memory and connected apps.",
    hub: "/ai-productivity",
    hubStatus: "live",
    product: { href: "/", label: "Ask Keplar" },
    pages: [
      "/prompts/work", "/prompts/coding", "/use-cases/compare-options-before-buying", "/use-cases/follow-up-with-leads", "/use-cases/get-a-second-opinion-on-code",
      "/for-founders", "/for-small-business", "/docs/using-keplar/tools-in-chat", "/docs/using-keplar/memory", "/docs/connectors-agents/agents-overview",
      "/blogs/what-is-an-ai-agent", "/blogs/what-is-mcp", "/blogs/ai-memory-and-context-windows", "/use-cases/build-a-small-business-site", "/specialists",
    ],
    tools: [],
    queries: ["AI for productivity", "AI agent for small business", "AI second opinion on code", "AI to compare options before buying"],
  },
  {
    id: "prompts",
    name: "AI prompt optimization",
    intent: "Writing better prompts and questions, with templates that work in any assistant.",
    hub: "/prompts",
    hubStatus: "live",
    product: { href: "/", label: "Try a prompt in Keplar" },
    pages: [
      "/prompts/learning", "/prompts/writing", "/prompts/work", "/prompts/coding", "/prompts/research", "/prompts/checking-ai", "/prompts/keplar",
      "/blogs/how-to-write-better-ai-prompts", "/docs/using-keplar/write-better-questions",
    ],
    tools: ["prompt-optimizer"],
    queries: ["AI prompt optimizer", "how to write better AI prompts", "prompt library", "prompt templates"],
  },
  {
    id: "pricing-capabilities",
    name: "AI model pricing and capabilities",
    intent: "What Keplar costs, what each plan includes, which models it uses and what it cannot do.",
    hub: "/pricing",
    hubStatus: "live",
    product: { href: "/signup", label: "Create a free account" },
    pages: [
      "/models", "/features", "/docs/billing-plans/plans-compared", "/docs/billing-plans/credits-explained", "/docs/billing-plans/free-plan-limits",
      "/docs/billing-plans/usage-windows", "/docs/billing-plans/when-you-reach-a-limit", "/docs/billing-plans/upgrade-downgrade-cancel",
      "/docs/reference/limits-at-a-glance", "/docs/reference/model-roster", "/blogs/free-vs-paid-ai", "/docs/get-started/free-vs-paid-tour",
      "/docs/get-started/what-keplar-cannot-do",
    ],
    tools: ["ai-model-comparison"],
    queries: ["Keplar pricing", "AI assistant plans compared", "free vs paid AI", "which AI models does Keplar use"],
  },
  {
    id: "tutorials",
    name: "AI tutorials and workflows",
    intent: "Step-by-step ways to get a result with AI, from a first question to a published site.",
    hub: "/guides",
    hubStatus: "live",
    product: { href: "/", label: "Ask Keplar" },
    pages: [
      "/blogs/why-ai-models-disagree", "/guides/study-from-a-pdf", "/guides/slide-deck-from-notes", "/use-cases", "/docs/get-started/quickstart", "/simulation",
      "/docs/using-keplar/follow-ups-and-chats", "/docs/using-keplar/voice-dictation", "/docs/create/build-a-site", "/docs/create/publish-your-site",
      "/how-it-works", "/blogs/how-to-be-visible-in-ai-search",
    ],
    tools: [],
    queries: ["how to use AI to study", "AI workflow for research", "how to build a website with AI", "AI tutorial for beginners"],
  },
] as const;

export const clusterById = (id: ClusterId) => CLUSTERS.find((c) => c.id === id)!;

/** The cluster a page belongs to (hub or supporting page); the first match when a page serves two clusters. */
export function clusterOf(path: string): Cluster | null {
  return CLUSTERS.find((c) => c.hub === path || c.pages.includes(path)) ?? null;
}

/** Hubs that exist today, for sitemaps and nav. */
export const liveHubs = () => CLUSTERS.filter((c) => c.hubStatus === "live").map((c) => c.hub);

/** Other pages in the same cluster, for "Keep reading" lists: the hub first, then supporting pages, never the page itself. */
export function relatedInCluster(path: string, n = 6): string[] {
  const c = clusterOf(path);
  if (!c) return [];
  const out = [c.hub, ...c.pages].filter((p, i, a) => p !== path && a.indexOf(p) === i);
  return out.slice(0, n);
}

/** Breadcrumb trail for a page inside a cluster: Home → hub → page (the hub only when it is live). */
export function clusterTrail(path: string, name: string): { name: string; path: string }[] {
  const c = clusterOf(path);
  if (!c || c.hub === path || c.hubStatus !== "live") return [{ name, path }];
  return [{ name: c.name, path: c.hub }, { name, path }];
}

/**
 * The secondary product call to action for a page: its cluster's product route with an honest label (Study needs a free
 * account, Slides is Plus and Pro), or null when the cluster's product is the chat itself. The primary action on every
 * content page stays "Try Keplar free" → /app, which works signed out, so a page that promises no signup keeps that promise.
 */
export function productCta(path: string): { href: string; label: string } | null {
  const c = clusterOf(path);
  return c && c.product.href !== "/" ? { href: c.product.href, label: c.product.label } : null;
}

/** Short labels for the cluster hubs in the site chrome (footer topic row), in a fixed order. */
export const TOPIC_LINKS: readonly { href: string; label: string }[] = [
  { href: "/compare-ai-models", label: "Compare AI models" },
  { href: "/ai-study-tool", label: "Studying" },
  { href: "/ai-research-assistant", label: "Research" },
  { href: "/ai-slideshow-maker", label: "Presentations" },
  { href: "/ai-image-generator", label: "Images" },
  { href: "/ai-video-generator", label: "Video" },
  { href: "/ai-writing-assistant", label: "Writing" },
  { href: "/ai-productivity", label: "Productivity" },
  { href: "/prompts", label: "Prompts" },
  { href: "/tools", label: "Free tools" },
];
