/**
 * The 11 search-intent clusters. Every path here already exists. This file assigns an intent
 * to each URL so a later page cannot answer the same query again. It does not create routes.
 * A path belongs to one cluster. Product routes are where the page should send a reader.
 */

export type ClusterId =
  | "comparisons"
  | "studying"
  | "reasoning"
  | "presentations"
  | "images"
  | "video"
  | "writing"
  | "productivity"
  | "prompts"
  | "pricing"
  | "tutorials";

export type ClusterPage = {
  path: string;
  role: "hub" | "support";
  /** The query this URL answers. Unique inside the cluster. */
  intent: string;
  label: string;
};

export type Cluster = {
  id: ClusterId;
  name: string;
  hub: string;
  /** In-app or public destination for someone who wants to do the thing, not only read about it. */
  productPath: string;
  pages: ClusterPage[];
};

export const CLUSTERS: Cluster[] = [
  {
    id: "comparisons",
    name: "AI model comparisons",
    hub: "/compare",
    productPath: "/app/ask",
    pages: [
      { path: "/compare", role: "hub", intent: "Multi-model tools and model-council alternatives", label: "Multi-model tools" },
      { path: "/compare/perplexity-model-council", role: "support", intent: "Keplar and Perplexity Model Council", label: "Perplexity Model Council" },
      { path: "/compare/poe", role: "support", intent: "Keplar and Poe", label: "Poe" },
      { path: "/compare/chathub", role: "support", intent: "Keplar and ChatHub", label: "ChatHub" },
      { path: "/vs", role: "support", intent: "Keplar and other assistants, one vendor at a time", label: "Assistant comparisons" },
      { path: "/vs/chatgpt", role: "support", intent: "Keplar and ChatGPT", label: "ChatGPT" },
      { path: "/vs/claude", role: "support", intent: "Keplar and Claude", label: "Claude" },
      { path: "/vs/gemini", role: "support", intent: "Keplar and Gemini", label: "Gemini" },
      { path: "/compare-ai-models", role: "support", intent: "Compare model answers on one question", label: "Compare models" },
      { path: "/chatgpt-alternative", role: "support", intent: "What to use alongside ChatGPT", label: "ChatGPT alternative" },
      { path: "/multi-model-ai", role: "support", intent: "What multi-model AI means", label: "Multi-model AI" },
      { path: "/blogs/chatgpt-vs-claude-vs-gemini-vs-perplexity", role: "support", intent: "How to choose among four assistants", label: "Choosing an assistant" },
    ],
  },
  {
    id: "studying",
    name: "AI studying and education",
    hub: "/ai-study-tool",
    productPath: "/app/study",
    pages: [
      { path: "/ai-study-tool", role: "hub", intent: "Turn notes or a PDF into a study set", label: "Study tool" },
      { path: "/for-students", role: "support", intent: "Keplar for students", label: "For students" },
      { path: "/guides/study-from-a-pdf", role: "support", intent: "Study from a PDF, step by step", label: "Study from a PDF" },
      { path: "/docs/using-keplar/study-mode", role: "support", intent: "How Study mode works in the product", label: "Study mode" },
      { path: "/prompts/learning", role: "support", intent: "Prompt templates for learning", label: "Learning prompts" },
      { path: "/use-cases/study-for-an-exam", role: "support", intent: "Study for an exam from your own notes", label: "Exam use case" },
      { path: "/blogs/best-ai-for-essays-and-studying", role: "support", intent: "What to look for in an AI study tool", label: "Essays and studying" },
    ],
  },
  {
    id: "reasoning",
    name: "AI reasoning and research",
    hub: "/how-it-works",
    productPath: "/app/ask",
    pages: [
      { path: "/how-it-works", role: "hub", intent: "How Keplar goes from a question to one answer", label: "How it works" },
      { path: "/keplar-one", role: "support", intent: "What the Keplar-One engine does", label: "Keplar-One" },
      { path: "/for-researchers", role: "support", intent: "Keplar for research work", label: "For researchers" },
      { path: "/docs/using-keplar/deep-research", role: "support", intent: "Deep Research mode, which needs Plus or Pro", label: "Deep Research" },
      { path: "/prompts/research", role: "support", intent: "Prompt templates for research", label: "Research prompts" },
      { path: "/use-cases/research-a-new-topic", role: "support", intent: "Research a topic you are new to", label: "Research a topic" },
      { path: "/blogs/what-is-deep-research", role: "support", intent: "What deep research modes are", label: "What is deep research" },
      { path: "/guides/why-ai-models-disagree", role: "support", intent: "What to do when models disagree", label: "When models disagree" },
    ],
  },
  {
    id: "presentations",
    name: "AI presentations and slides",
    hub: "/ai-slideshow-maker",
    productPath: "/app/slides",
    pages: [
      { path: "/ai-slideshow-maker", role: "hub", intent: "Turn notes into a slide deck", label: "Slideshow maker" },
      { path: "/guides/slide-deck-from-notes", role: "support", intent: "Make a deck from rough notes", label: "Deck from notes" },
      { path: "/docs/using-keplar/slideshow-creator", role: "support", intent: "Slideshow creator limits and export", label: "Slideshow creator" },
      { path: "/use-cases/make-a-presentation", role: "support", intent: "Make a presentation from an outline", label: "Presentation use case" },
    ],
  },
  {
    id: "images",
    name: "AI image generation",
    hub: "/docs/create/generate-images",
    productPath: "/app/create",
    pages: [
      { path: "/docs/create/generate-images", role: "hub", intent: "Generate images in Create, on Plus and Pro", label: "Generate images" },
      { path: "/blogs/best-ai-for-image-generation", role: "support", intent: "What to check before trusting an image model", label: "Image generation" },
      { path: "/docs/create/create-overview", role: "support", intent: "What Create builds besides images", label: "Create overview" },
    ],
  },
  {
    id: "video",
    name: "AI video generation",
    hub: "/docs/create/generate-video",
    productPath: "/app/create",
    pages: [
      { path: "/docs/create/generate-video", role: "hub", intent: "Generate short video in Create, in beta on Pro", label: "Generate video" },
      { path: "/docs/create/create-limits-by-plan", role: "support", intent: "Which Create features each plan includes", label: "Create limits" },
    ],
  },
  {
    id: "writing",
    name: "AI writing and summarization",
    hub: "/for-writers",
    productPath: "/app/ask",
    pages: [
      { path: "/for-writers", role: "hub", intent: "Keplar for writing and editing", label: "For writers" },
      { path: "/prompts/writing", role: "support", intent: "Prompt templates for writing and summaries", label: "Writing prompts" },
      { path: "/use-cases/write-and-edit-with-feedback", role: "support", intent: "Edit a draft with the disagreement shown", label: "Write and edit" },
      { path: "/use-cases/understand-a-document", role: "support", intent: "Understand a long document", label: "Understand a document" },
      { path: "/blogs/best-ai-for-writing", role: "support", intent: "What to look for in an AI writing tool", label: "AI for writing" },
      { path: "/guides/citation-styles", role: "support", intent: "How APA, MLA, and Chicago lines are arranged from fields you type", label: "Citation styles" },
    ],
  },
  {
    id: "productivity",
    name: "AI productivity",
    hub: "/prompts/work",
    productPath: "/app/ask",
    pages: [
      { path: "/prompts/work", role: "hub", intent: "Prompt templates for everyday work", label: "Work prompts" },
      { path: "/for-founders", role: "support", intent: "Keplar for founders", label: "For founders" },
      { path: "/for-small-business", role: "support", intent: "Keplar for a small business", label: "For small business" },
      { path: "/use-cases/follow-up-with-leads", role: "support", intent: "Follow up with new leads", label: "Follow up" },
      { path: "/use-cases/compare-options-before-buying", role: "support", intent: "Compare options before a purchase", label: "Compare options" },
    ],
  },
  {
    id: "prompts",
    name: "AI prompt optimization",
    hub: "/prompts",
    productPath: "/app/ask",
    pages: [
      { path: "/prompts", role: "hub", intent: "Copyable prompt templates", label: "Prompt library" },
      { path: "/blogs/how-to-write-better-ai-prompts", role: "support", intent: "Habits for writing better prompts", label: "Better prompts" },
      { path: "/docs/using-keplar/write-better-questions", role: "support", intent: "How to ask Keplar a better question", label: "Better questions" },
    ],
  },
  {
    id: "pricing",
    name: "AI model pricing and capabilities",
    hub: "/pricing",
    productPath: "/pricing",
    pages: [
      { path: "/pricing", role: "hub", intent: "Keplar plan prices", label: "Pricing" },
      { path: "/models", role: "support", intent: "Which models Keplar uses", label: "Models" },
      { path: "/features", role: "support", intent: "Every feature and whether it is live", label: "Features" },
      { path: "/docs/billing-plans/plans-compared", role: "support", intent: "Plan differences in the docs", label: "Plans compared" },
      { path: "/docs/reference/model-roster", role: "support", intent: "The model roster and roles", label: "Model roster" },
      { path: "/blogs/free-vs-paid-ai", role: "support", intent: "What free and paid AI plans tend to differ on", label: "Free and paid" },
    ],
  },
  {
    id: "tutorials",
    name: "AI tutorials and workflows",
    hub: "/guides",
    productPath: "/docs",
    pages: [
      { path: "/guides", role: "hub", intent: "Short guides for using AI carefully", label: "Guides" },
      { path: "/guides/free-tool-limits", role: "support", intent: "Which free tools call a model and the caps on those calls", label: "Free tool limits" },
      { path: "/docs", role: "support", intent: "Product documentation", label: "Docs" },
      { path: "/use-cases", role: "support", intent: "Worked tasks", label: "Use cases" },
      { path: "/blogs", role: "support", intent: "Essays on how AI behaves", label: "Blog" },
      { path: "/docs/get-started/quickstart", role: "support", intent: "First session in Keplar", label: "Quickstart" },
    ],
  },
];

const byId = new Map(CLUSTERS.map((c) => [c.id, c]));

export function clusterById(id: ClusterId): Cluster {
  const c = byId.get(id);
  if (!c) throw new Error(`unknown cluster ${id}`);
  return c;
}

export function clusterForPath(path: string): Cluster | undefined {
  return CLUSTERS.find((c) => c.pages.some((p) => p.path === path));
}

/** Other pages in the same cluster, hub first, excluding `path`. */
export function clusterAlso(path: string, limit = 4): { path: string; label: string }[] {
  const c = clusterForPath(path);
  if (!c) return [];
  const rest = c.pages.filter((p) => p.path !== path);
  const hub = rest.filter((p) => p.role === "hub");
  const support = rest.filter((p) => p.role !== "hub");
  return [...hub, ...support].slice(0, limit).map((p) => ({ path: p.path, label: p.label }));
}

/** Breadcrumb trail from cluster membership. The hub is its own single crumb. */
export function clusterTrail(path: string): { name: string; path: string }[] {
  const c = clusterForPath(path);
  if (!c) return [];
  const page = c.pages.find((p) => p.path === path);
  if (!page || page.role === "hub") return [{ name: c.name, path: c.hub }];
  return [{ name: c.name, path: c.hub }, { name: page.label, path: page.path }];
}
