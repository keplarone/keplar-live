/** Site-wide content and navigation. Copy lives here, not in components. */

/**
 * Brand names in one place: the name may change (trademark review), so a rename
 * should be a one-file change. Metadata, JSON-LD, nav, footer, and shared copy
 * reference these. Long-form marketing sentences are not templated.
 */
export const brand = {
  /** Short product name used in UI and copy. */
  name: "Keplar",
  /** Company name (founder decision, Sep 27, 2026). The legal entity is still `site.legalEntity` (unconfirmed). */
  companyName: "Keplar One",
  /** Orchestration engine name. Pending a naming decision; change it here only. */
  engineName: "Keplar-One",
  usage: "Keplar Usage",
  answer: "Keplar Answer",
  plans: { free: "Free", lite: "Keplar Lite", plus: "Keplar Plus", pro: "Keplar Pro", business: "Business" },
  /** Public contact route. */
  contactPath: "/inquire",
  /** Business email (founder-confirmed, Sep 27, 2026). */
  contactEmail: "team@keplar.one",
  /** Where all feedback from the site and the app is delivered (the Feedback form emails it here; every mailto fallback uses it). */
  feedbackEmail: "team@keplar.one",
} as const;

/** Production domain (founder-confirmed). */
export const PRODUCTION_HOST = "keplar.one";
export const PRODUCTION_URL = `https://${PRODUCTION_HOST}`;
/** Docs subdomain: same project, serves /docs (see src/proxy.ts rewrite). */
export const DOCS_HOST = `docs.${PRODUCTION_HOST}`;
export const DOCS_URL = `https://${DOCS_HOST}`;
/** Business subdomain: same project; until Keplar Business is built it serves one landing page (src/proxy.ts businessHost). */
export const BUSINESS_HOST = `business.${PRODUCTION_HOST}`;

/**
 * Absolute site URL. Override per environment with NEXT_PUBLIC_SITE_URL
 * (e.g. http://localhost:3000 in .env.local for dev). Production builds default
 * to the real domain; dev defaults to localhost.
 */
const rawUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production" ? PRODUCTION_URL : "http://localhost:3000");

export const siteUrl = rawUrl.replace(/\/$/, "");

/**
 * Only the real production deployment may be indexed. Vercel production, or an
 * explicit NEXT_PUBLIC_SITE_INDEXABLE=true on self-hosted production. Every
 * other host additionally gets `X-Robots-Tag: noindex` from next.config.ts.
 */
export const isIndexable =
  process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true" || process.env.VERCEL_ENV === "production";

/** Search-console verification tokens; rendered only when set. */
export const siteVerification = {
  google: process.env.GOOGLE_SITE_VERIFICATION || process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  bing: process.env.BING_SITE_VERIFICATION || process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || undefined,
};

export const site = {
  name: brand.name,
  url: siteUrl,
  /** Root meta description: the answer engine first, then the rest of the workspace, so search and AI summaries see the whole product. */
  description:
    "Keplar asks the AI models your question needs and gives one checked answer, with disagreements shown. Plus Study mode, Deep Research, slides, images, video, websites, apps and agents.",
  /** On-page summary used in the hero. */
  summary:
    "Keplar asks multiple intelligences, finds where they agree, investigates where they don't, and gives you one synthesized answer.",
  seoTitle: `${brand.companyName} — One question. Multiple intelligences. One answer.`,
  /** Use only if the primary title truncates in search results (Marketer, Sep 27, 2026). */
  seoTitleFallback: `${brand.companyName}: Multiple Intelligences, One Answer`,
  tagline: "One question. Multiple intelligences. One answer.",
  /**
   * Open for the founders (docs/legal-open-decisions.md): the registered legal entity has not been supplied.
   * Leave null until it is; the footer renders it only when set. Never invent one.
   */
  legalEntity: null as string | null,
} as const;

export type NavLink = { href: string; label: string; hint?: string; children?: NavLink[] };

/**
 * Marketing nav: four top-level items (Product, Docs, Pricing, Download), then search, Sign in and one primary CTA.
 * Product opens one short menu; Docs, Pricing and Download are direct. Every other page is in the footer or Cmd/Ctrl-K
 * (see `paletteOnlyPages` below). Labels are keyed by href in each locale's common catalog, so reuse existing hrefs.
 */
export const primaryNav: NavLink[] = [
  {
    href: "/features",
    label: "Product",
    children: [
      { href: "/features", label: "Everything in Keplar", hint: "Every feature and whether it is live" },
      { href: "/#demo", label: "Live demo", hint: "Ask a question now, no sign-up" },
      { href: "/app/create", label: "Create", hint: "Describe or speak a site or app" },
      { href: "/enterprise", label: "Teams", hint: "Shared workspaces, roles and approvals" },
    ],
  },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
];

/** Footer: four short columns with the core pages. Landing and reference pages keep their URLs and live in Cmd-K, /guides and the sitemap. */
export const footerNav: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Everything in Keplar" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/showcase", label: "Create showcase" },
      { href: "/templates", label: "Community gallery" },
      { href: "/keplar-one", label: brand.engineName },
      { href: "/enterprise", label: "For business" },
      { href: "/pricing", label: "Pricing" },
      { href: "/download", label: "Download" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/developers", label: "API and widget" },
      { href: "/guides", label: "Guides" },
      { href: "/blogs", label: "Blog" },
      { href: "/changelog", label: "Changelog" },
      { href: "/roadmap", label: "Roadmap" },
    ],
  },
  { heading: "Company", links: [{ href: "/about", label: "About" }, { href: "/contact", label: "Contact" }, { href: "/help", label: "Help" }, { href: "/status", label: "Status" }] },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/security", label: "Security" },
    ],
  },
];

/**
 * Pages that left the nav and footer in the minimal pass (Oct 7, 2026). Their URLs, metadata and sitemap entries are unchanged
 * (none is a duplicate, so nothing redirects); Cmd/Ctrl-K lists them so every page is still one search away.
 */
export const paletteOnlyPages: NavLink[] = [
  { href: "/product", label: "Overview", hint: "Keplar in one page" },
  { href: "/for-you", label: "For you", hint: "What Keplar does for you" },
  { href: "/agents", label: "Agents", hint: "Scheduled work that asks before acting" },
  { href: "/referral-terms", label: "Referral program", hint: "Invite a friend; you both get extra usage" },
  { href: "/signup", label: "Create an account" },
  { href: "/inquire", label: "Inquire", hint: "Business and press inquiries" },
  { href: "/ai-answer-engine", label: "AI answer engine" },
  { href: "/compare-ai-models", label: "Compare AI models" },
  { href: "/ai-study-tool", label: "AI study tool" },
  { href: "/ai-slideshow-maker", label: "AI slideshow maker" },
  { href: "/superintelligence", label: "What is superintelligence?" },
  { href: "/multi-model-ai", label: "Multi-model AI" },
  { href: "/models", label: "Models we use" },
  { href: "/glossary", label: "Glossary" },
  { href: "/prompts", label: "Prompt library" },
];

export const signInHref = "/signin";
export const tryHref = "/app/ask";
