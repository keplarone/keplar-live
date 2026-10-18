/**
 * Every feature, grouped into the landing's seven chapters. One registry drives the landing chapters, /features, and the nav
 * so a status changes in one place. Status is honest: "live" = anyone can use it today; "beta" = works, still changing or
 * limited to some plans; "soon" = being built, not usable yet (shown as "Coming soon", never linked as if it works).
 * Owners of each workstream: flip the status here when it ships to production.
 */
import { BUSINESS_HOST } from "./site";

export type FeatureStatus = "live" | "beta" | "soon";
/** A product that groups several features (today only Keplar Studio). */
export type ProductId = "keplar-studio";
export type Feature = {
  id: string;
  name: string;
  line: string;
  href: string;
  status: FeatureStatus;
  note?: string;
  /** The product this feature belongs to; /features shows such features under the product's name. */
  product?: ProductId;
};

/** An app a product works inside (names are proper nouns and are not translated). */
export type ProductEnvironment = { id: "roblox" | "blender"; name: string; href: string };
export type Product = {
  id: ProductId;
  /** Brand name, never translated. */
  name: string;
  /** Where the product is described: its anchor on /features (the row groups its features). */
  href: string;
  environments: ProductEnvironment[];
};

/**
 * Keplar Studio: the desktop app's co-builder for Roblox Studio and Blender. In the app it is one Create tab with an
 * environment switch (src/components/create/studio). Availability lives on each feature's note; plans are read from
 * STUDIO_PLANS in src/lib/desktop/studio-bridge.ts (Lite and up), not set here.
 */
export const KEPLAR_STUDIO: Product = {
  id: "keplar-studio",
  name: "Keplar Studio",
  href: "/features#keplar-studio",
  environments: [
    { id: "roblox", name: "Roblox Studio", href: "/roblox-studio-ai" },
    { id: "blender", name: "Blender", href: "/blender-ai" },
  ],
};

export const PRODUCTS: Record<ProductId, Product> = { "keplar-studio": KEPLAR_STUDIO };
export type Chapter = { id: string; n: string; label: string; title: string; lede: string; features: Feature[] };

export const STATUS_LABEL: Record<FeatureStatus, string> = { live: "Live", beta: "Beta", soon: "Coming soon" };

export const CHAPTERS: Chapter[] = [
  {
    id: "ask", n: "01", label: "Ask", title: "Ask Keplar anything.",
    lede: "One question goes to several AI models. Keplar compares them, shows where they disagree, checks what holds up and writes one answer.",
    features: [
      { id: "demo", name: "Live demo", line: "Ask a real question on this page. No account.", href: "/", status: "live" },
      { id: "multi-model", name: "Several models, one answer", line: "Only the models a question needs, compared claim by claim.", href: "/how-it-works", status: "live" },
      { id: "disagreement", name: "Disagreement map", line: "Where the models agree, where they split, and why the answer went the way it did.", href: "/how-it-works", status: "live" },
      { id: "debate", name: "Debate mode", line: "Watch the models argue in rounds before Keplar answers.", href: "/", status: "beta" },
      { id: "voice", name: "Voice mode", line: "Ask out loud, hear the answer read back. Keplar never records or stores your audio.", href: "/", status: "beta" },
      { id: "live-research", name: "Live Research", line: "In the desktop app, Keplar searches the web and reads pages on your computer, then cites each one and checks the citations.", href: "/", status: "beta", note: "Desktop app 0.2.0 or newer." },
    ],
  },
  {
    id: "understand", n: "02", label: "Understand", title: "It reads what you give it.",
    lede: "Drop in the thing you are asking about. Keplar reads it for that question only and does not keep the file.",
    features: [
      { id: "images", name: "Images and screenshots", line: "Charts, receipts, whiteboards, UI. Sent only to models that can see.", href: "/", status: "live" },
      { id: "video", name: "Video", line: "Keyframes are sampled in your browser; the clip itself is not uploaded.", href: "/", status: "live" },
      { id: "docs", name: "Documents, code and data", line: "PDF, RTF, text, CSV, JSON, source files and zips of code, read as text.", href: "/", status: "live" },
      { id: "office", name: "Word, PowerPoint, Excel and audio", line: "Office files parsed safely; audio transcribed.", href: "/", status: "live" },
      { id: "links", name: "Links", line: "Paste a URL and Keplar reads the page through a guarded fetch.", href: "/", status: "live" },
    ],
  },
  {
    id: "create", n: "03", label: "Create", title: "Describe it, or say it. Get something that does not look generated.",
    lede: "Create plans a design for the business in your brief, writes the code, tests every screen, and refuses purple glow, gradient blobs and three-card grids.",
    features: [
      { id: "voice-create", name: "Voice Live Create", line: "Speak and watch the editor, terminal and preview build at the same time. Say \"actually\" to change course.", href: "/app/create", status: "beta", note: "Needs a browser with speech recognition (Chrome, Edge, Safari)." },
      { id: "showcase", name: "Showcase", line: "Eight demos by the Keplar team that set the bar Create is held to.", href: "/showcase", status: "live" },
      { id: "surprise", name: "Surprise me", line: "One press: a specific brief, style and depth, built for you.", href: "/app/create", status: "live" },
      { id: "versions", name: "Version history", line: "Every build is a version. Restore any one, or branch it into a new draft.", href: "/app/create", status: "live" },
      { id: "community", name: "Community gallery", line: "Sites people chose to share. Like, remix, report.", href: "/templates", status: "beta" },
      { id: "anti-vibe", name: "Anti-generic design rules", line: "A written rubric and a lint pass that reject the usual AI look before you see it.", href: "/showcase", status: "live" },
      // Keplar Studio: one product, two environments. Ids stay as they were (every locale catalog keys its copy by id).
      { id: "roblox-studio", product: "keplar-studio", name: "Roblox Studio", line: "A co-builder inside Roblox Studio: maps, UI, flipbook effects and Luau scripts, on Claude Opus 5.5.", href: "/roblox-studio-ai", status: "beta", note: "Desktop app, Lite and up." },
      { id: "roblox-cloud", product: "keplar-studio", name: "Roblox Cloud", line: "Overnight jobs on your game's scripts, each edit checked by Luau's analyzer, applied in Studio when you say so.", href: "/roblox-studio-ai", status: "beta", note: "Scripts only; it can't play-test." },
      { id: "blender", product: "keplar-studio", name: "Blender", line: "Model, texture with Poly Haven PBR sets, light and export in Blender 4.2 or newer.", href: "/blender-ai", status: "beta", note: "Desktop app 0.1.8 or newer, Lite and up." },
      { id: "blender-cloud", product: "keplar-studio", name: "Blender Cloud rendering", line: "Render a scene on Keplar's servers with your computer off, then download the frames and an MP4.", href: "/blender-ai", status: "beta", note: "Desktop app 0.1.10 or newer." },
    ],
  },
  {
    id: "together", n: "04", label: "Build together", title: "Build it with someone, and with a critic.",
    lede: "Work on the same project at the same time, and get a second opinion that is not you.",
    features: [
      { id: "collab", name: "Real-time collaboration", line: "Invite by link and edit the same project together: live cursors, follow mode, a shared terminal and preview.", href: "/app/create", status: "live", note: "Open an app in Create, then Live. Viewers watch; editors type." },
      { id: "critic", name: "AI critic", line: "Rules, axe-core in a real browser and a separate model review your build, then apply the fixes you pick.", href: "/app/create", status: "live" },
    ],
  },
  {
    id: "ship", n: "05", label: "Ship", title: "Publish in one step. Undo in one step.",
    lede: "Your project goes live on a Keplar address, with your own domain when you want it.",
    features: [
      { id: "publish", name: "One-click publish", line: "Publish a draft to a live address from Create.", href: "/app/create", status: "live" },
      { id: "previews", name: "Previews", line: "Every draft has a private preview link before it goes live.", href: "/app/create", status: "live" },
      { id: "rollback", name: "Rollback", line: "Restore the previous version if a change goes wrong.", href: "/app/create", status: "live" },
      { id: "domains", name: "Custom domains", line: "Connect a domain you own; Keplar checks the DNS and tells you what to change.", href: "/app/create", status: "beta" },
      { id: "ssl", name: "Automatic HTTPS", line: "Certificates are issued and renewed for connected domains.", href: "/app/create", status: "beta" },
    ],
  },
  {
    id: "platform", n: "06", label: "Platform", title: "Use Keplar from anywhere.",
    lede: "The same engine, behind an API, in your browser, inside a widget on your site, and shared across a team.",
    features: [
      { id: "api", name: "Public API", line: "Bearer keys, per-plan limits, OpenAPI spec. Free keys use free models only.", href: "/developers", status: "beta" },
      { id: "extension", name: "Keplar One browser extension", line: "Ask about a selection or a page from Chrome or Edge, using your API key.", href: "/developers", status: "beta", note: "Submitted to the Chrome Web Store." },
      { id: "lens", name: "Search with Keplar One", line: "Drag over any text or picture on a page; the answer opens in a side panel.", href: "/developers", status: "beta", note: "Part of the browser extension." },
      { id: "embed", name: "Embeddable widget", line: "One script tag puts Keplar Ask on your site, limited to origins you allow.", href: "/developers#embed", status: "beta" },
      { id: "teams", name: "Keplar for Teams", line: "Shared workspaces with owner, admin, editor and viewer roles.", href: `https://${BUSINESS_HOST}`, status: "beta", note: "Business plan." },
      { id: "referrals", name: "Referral program", line: "Invite a friend; you both get extra usage, never cash.", href: "/referral-terms", status: "live" },
    ],
  },
  {
    id: "trust", n: "07", label: "Trust", title: "Plain about what it does, and with your data.",
    lede: "What we protect, how, and what we have not done yet, written down. No badges we have not earned.",
    features: [
      { id: "security", name: "Security", line: "Encryption, providers, retention, account protection and how to report a problem.", href: "/security", status: "live" },
      { id: "changelog", name: "Changelog", line: "What shipped, when.", href: "/changelog", status: "live" },
      { id: "roadmap", name: "Roadmap", line: "What we are building next, and what is not live yet.", href: "/roadmap", status: "live" },
    ],
  },
];

export const ALL_FEATURES: Feature[] = CHAPTERS.flatMap((c) => c.features);
export const featureCounts = () => ({
  live: ALL_FEATURES.filter((f) => f.status === "live").length,
  beta: ALL_FEATURES.filter((f) => f.status === "beta").length,
  soon: ALL_FEATURES.filter((f) => f.status === "soon").length,
});

/** The features that belong to a product, in catalogue order. */
export const productFeatures = (id: ProductId): Feature[] => ALL_FEATURES.filter((f) => f.product === id);
