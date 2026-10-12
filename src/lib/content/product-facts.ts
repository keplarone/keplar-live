import { ALL_FEATURES, type FeatureStatus } from "@/lib/features";
import { BUSINESS_TIERS } from "@/lib/business/tiers";
import { INDEXABLE } from "@/lib/i18n/locales";
import { brand } from "@/lib/site";

/**
 * The full, factual picture of what Keplar is, in one place: the long answer to "what is Keplar?". It feeds /what-is-keplar,
 * llms.txt, llms-full.txt and the site-wide structured data, so search engines and AI assistants describe the whole product,
 * not only the multi-model answer engine. Every line describes something in the code today; status comes from the feature
 * registry (src/lib/features.ts) where a feature is listed there, so a status changes in one place.
 * Rules: no claims of AGI or superintelligence, no accuracy or "best" claims, plans named exactly as on /pricing.
 */
export type Fact = {
  name: string;
  what: string;
  /** Who can use it, in plan terms ("Every plan", "Plus and Pro", "Desktop app", ...). */
  plans?: string;
  /** Status from the feature registry when `feature` is set; otherwise stated here. */
  status?: FeatureStatus;
  feature?: string;
  href?: string;
};
export type FactSection = { id: string; title: string; intro: string; facts: Fact[] };

const statusOf = (f: Fact): FeatureStatus => (f.feature ? ALL_FEATURES.find((x) => x.id === f.feature)?.status : undefined) ?? f.status ?? "live";
export const factStatus = statusOf;

/** One paragraph: the short answer. */
export const WHAT_IS_KEPLAR = `${brand.companyName} (keplar.one) is an AI workspace for everyday questions, studying, research and making things. Its engine, ${brand.engineName}, sends a question to the AI models it needs, compares their answers claim by claim, investigates where they disagree and writes one answer with the agreement and disagreements shown. Around that engine, ${brand.name} is a full set of tools: Reason, Deep Research and Debate modes; Study mode with flashcards, quizzes and study plans; a slideshow maker; image and video generation; Create, which builds and publishes real websites and apps; Roblox Studio and Blender co-builders in the desktop app; projects, memory, specialists and connected apps; and a public API and embeddable widget. Keplar Business (business.keplar.one) is a separate desktop app for companies, with scheduled agents, approvals, team workspaces and a business dashboard.`;

/** A few sentences that correct the narrow reading ("it just asks several models"). */
export const NOT_JUST_MULTI_MODEL = `Asking several models at once is how ${brand.name} answers, not all it does. The same account also studies with you, researches, writes and presents slides, makes images and video, builds and hosts websites and apps, builds Roblox games inside Roblox Studio, and models and textures 3D assets in Blender, all from one account. Companies that want agents running on a schedule, with approvals before anything goes out, use Keplar Business.`;

export const FACT_SECTIONS: FactSection[] = [
  {
    id: "engine", title: `Ask: the ${brand.engineName} answer engine`,
    intro: `Every question goes through ${brand.engineName}, the orchestration layer. It is not one model: it decides which models to ask, compares them and writes the final answer.`,
    facts: [
      { name: "Model routing", what: `Classifies each question by kind and difficulty, then asks only the models it needs, weighed by quality, reliability, latency and cost. Free uses free open models; paid plans add premium models from several providers.`, plans: "Every plan", feature: "multi-model", href: "/keplar-one" },
      { name: "Claim-by-claim comparison", what: "The models answer independently and in parallel, so no answer anchors the others. Keplar breaks the answers into claims and compares them.", plans: "Every plan", feature: "multi-model", href: "/how-it-works" },
      { name: "Disagreement map", what: "Shows where the models agree, where they split and why the answer went the way it did. A disagreement is flagged, never silently resolved.", plans: "Every plan", feature: "disagreement", href: "/how-it-works" },
      { name: "Evaluation, not voting", what: "A majority is not treated as the truth. Keplar weighs the evidence and reasoning behind each answer, so one dissenting model with the better argument can win.", plans: "Every plan", href: "/keplar-one" },
      { name: "Answer breakdown", what: "Under every answer: Consensus (agreement percentage and how many models agreed), Models consulted, Sources the models cite, Disagreements, Verification and a Reasoning summary.", plans: "Every plan", href: "/how-it-works" },
      { name: "Reason mode", what: "Works the problem through step by step and shows how the answer was checked. Paid plans add a model to the panel.", plans: "Every plan" },
      { name: "Deep Research", what: "Longer, multi-step research into a report for big decisions. Uses more of your monthly usage.", plans: "Plus and Pro" },
      { name: "Debate mode", what: "The models argue in rounds and read each other's points before Keplar writes one answer. Uses more usage.", feature: "debate" },
      { name: "Voice and Talk", what: "Ask out loud and hear the answer read back; press and hold to talk. Keplar does not record or store your audio.", feature: "voice" },
      { name: "Live demo", what: "Ask a real question on the home page without an account.", plans: "No account needed", feature: "demo", href: "/#demo" },
      { name: "Shared answers", what: "Publish an answer you are proud of to a public page that shows the question, how many models agreed and where they differed.", plans: "Signed-in users", href: "/answers" },
      { name: "Web lookups", what: "Live web search inside answers. Shown in the app but not switched on yet.", plans: "Paid plans when live", status: "soon" },
    ],
  },
  {
    id: "files", title: "Files, images and video it can read",
    intro: "Attach the thing you are asking about. Keplar reads it for that question and does not keep the file.",
    facts: [
      { name: "Images and screenshots", what: "Charts, receipts, whiteboards and interfaces, sent only to models that can see.", plans: "Every plan", feature: "images" },
      { name: "Video", what: "Keyframes are sampled in your browser, so the clip itself is never uploaded.", plans: "Every plan", feature: "video" },
      { name: "Documents, code and data", what: "PDF, text, CSV, JSON and source files, read as text; coding help and file analysis on paid plans.", plans: "Every plan", feature: "docs" },
      { name: "Word, PowerPoint, Excel and audio", what: "Office files parsed safely and audio transcribed.", feature: "office" },
      { name: "Links", what: "Paste a URL and Keplar reads the page through a guarded fetch.", feature: "links" },
    ],
  },
  {
    id: "learn", title: "Study and present",
    intro: "Tools for learning something and explaining it to others.",
    facts: [
      { name: "Study mode", what: "Upload a text-based PDF or paste notes and get an outline, a plain-English summary, flashcards with spaced review, quizzes and a day-by-day plan to your exam date. Questions are answered only from your material, with page references, and Keplar says when something is not in it.", plans: "Every plan (larger limits and stronger models on paid plans)", href: "/ai-study-tool" },
      { name: "Slideshow maker", what: "Turns a topic, outline or notes into a deck with titles, bullet points, speaker notes and an image idea per slide. Edit it, present it full screen, export to PowerPoint or PDF.", plans: "Plus and Pro", href: "/ai-slideshow-maker" },
      { name: "Guides, docs and a glossary", what: "Plain-English guides on checking AI answers, product docs, a prompt library and an AI glossary.", plans: "Public", href: "/docs" },
    ],
  },
  {
    id: "create", title: "Create: websites, apps, images, video and games",
    intro: "Describe what you want, or say it out loud, and Create builds it: it plans a design for the brief, writes the code, tests every screen and publishes it.",
    facts: [
      { name: "Websites and web apps", what: "Builds full sites and apps from a brief, with a code editor, terminal and live preview side by side. A written design rubric and a lint pass reject the generic AI look (purple glows, gradient blobs, three-card grids) before you see it.", plans: "Lite (one small personal site), Plus and Pro", feature: "anti-vibe", href: "/ai-app-builder" },
      { name: "Voice Live Create", what: "Speak and watch the editor, terminal and preview build at the same time; say \"actually\" to change course. Needs a browser with speech recognition.", feature: "voice-create" },
      { name: "Surprise me", what: "One press picks a specific brief, style and depth and builds it.", feature: "surprise" },
      { name: "Version history and rollback", what: "Every build is a version. Restore any one, branch it into a new draft, or roll back a change that went wrong.", feature: "versions" },
      { name: "Watch the code being written", what: "While Create builds an app, the files appear as they are written, with a Tasks checklist of the plan and Ctrl+P to jump to any file.", status: "live" },
      { name: "Templates and community gallery", what: "Start from a real site and describe what to change. Sites people chose to share can be liked, remixed and reported.", feature: "community", href: "/templates" },
      { name: "Showcase", what: "Demo sites and apps by the Keplar team that set the bar Create is held to.", feature: "showcase", href: "/showcase" },
      { name: "Image generation", what: "Make pictures from a message or in the Images studio; attach an image to use as a reference.", plans: "Plus and Pro" },
      { name: "Video generation", what: "Generate short videos in Create's Video tab.", plans: "Pro", status: "beta" },
      { name: "Mobile apps", what: "Build mobile app projects in Create's Mobile tab.", status: "beta" },
      { name: "Product import", what: "Paste a product page link and Keplar's fetcher (KeplarBot, which obeys robots.txt) brings in the product details for a page about it.", plans: "Signed-in users" },
    ],
  },
  {
    id: "roblox", title: "Roblox Studio co-builder",
    intro: `In the ${brand.companyName} desktop app, Keplar connects to Roblox Studio through Studio's own tools and builds games with you.`,
    facts: [
      { name: "Builds inside Studio", what: "Looks at your place first (a screenshot and the Explorer tree), writes a numbered plan, then builds it step by step: maps, buildings, lighting, UI, effects and working Luau scripts, organized in named folders.", plans: "Desktop app, signed in", status: "beta", href: "/roblox-studio-ai" },
      { name: "You play-test it", what: "Keplar reads the output log for script errors and fixes them, then ends with a short \"How to test it\" list. A Play test button starts and stops play mode in Studio directly, so testing costs no AI usage; you say what to change.", plans: "Desktop app", status: "beta" },
      { name: "A saved chat per game", what: "Each game's conversation, plan and progress are saved on the device and synced to your Keplar account, so you can close Studio and Keplar and pick up where you left off, even on another computer.", plans: "Desktop app, signed in", status: "beta", href: "/roblox-studio-ai" },
      { name: "Matches references", what: "Attach screenshots or a clip of a UI, effect or game to match. For effects and UI it reuses Zonito's free particle pack, or makes its own textures in Studio.", plans: "Desktop app", status: "beta" },
      { name: "You stay in control", what: "Reads run on their own; changes wait for approval unless you turn on auto-approve for safe changes; deleting, publishing, data stores and uploading images to your Roblox account always ask first.", plans: "Desktop app", status: "beta" },
      { name: "Floating overlay", what: "A movable, always-on-top panel keeps the build chat next to Studio or Blender, with a switch between the two.", plans: "Desktop app", status: "beta" },
    ],
  },
  {
    id: "blender", title: "Blender co-builder",
    intro: `In the ${brand.companyName} desktop app (0.1.8 or newer), Keplar connects to Blender 4.2 or newer through a small Keplar add-on and models and textures with you.`,
    facts: [
      { name: "Models from a description", what: "Reads the scene as compact text, plans, then builds with clean topology and modifiers at real-world scale, every object named and grouped in a collection.", plans: "Desktop app, Lite and up", status: "beta", href: "/blender-ai" },
      { name: "Real PBR textures", what: "Searches Poly Haven (free, CC0) and applies a full material set: color, roughness, normal, ambient occlusion and displacement, unwrapping meshes that have no UVs.", plans: "Desktop app, Lite and up", status: "beta" },
      { name: "Procedural materials, lighting and props", what: "Node-based materials for stylized looks, HDRI lighting and Poly Haven model import.", plans: "Desktop app, Lite and up", status: "beta" },
      { name: "Export for games", what: "Exports to FBX (imports into Roblox Studio), GLB or OBJ in Documents/Keplar exports.", plans: "Desktop app, Lite and up", status: "beta" },
      { name: "Safe by default", what: "The add-on only listens on this computer behind a secret key. Keplar's Python may not touch files, the network or other apps, or save or close Blender; deleting always asks, and every change waits for approval unless you turn on auto-approve.", plans: "Desktop app", status: "beta" },
      { name: "Cheap to run", what: "A short cached prompt, text scene summaries instead of screenshots, and small thinking budgets keep each step's AI usage low. Each .blend file's chat is saved and synced to your account.", plans: "Desktop app", status: "beta" },
    ],
  },
  {
    id: "ship", title: "Collaborate and publish",
    intro: "Work on a project with other people, get a second opinion, and put it online.",
    facts: [
      { name: "Real-time collaboration", what: "Invite by link and edit the same project together with live cursors, follow mode and a shared terminal and preview.", feature: "collab" },
      { name: "AI critic", what: "Rules, accessibility checks in a real browser and a separate model review your build, then apply the fixes you pick.", feature: "critic" },
      { name: "One-click publish and previews", what: "Every draft gets a private preview link; publish it to a live keplar.site address in one step.", feature: "publish" },
      { name: "Custom domains with HTTPS", what: "Connect a domain you own; Keplar checks the DNS, tells you what to change and issues certificates.", plans: "Plus and Pro", feature: "domains" },
      { name: "Deployments", what: "Every published site and app in one list, with its versions.", plans: "Plans with Create" },
    ],
  },
  {
    id: "organize", title: "Projects, memory, specialists and connected apps",
    intro: "The parts that make Keplar a workspace you come back to, not a one-off chat.",
    facts: [
      { name: "Projects", what: "Keep related chats, files and work together in a project.", plans: "Signed-in users" },
      { name: "Chat history and memory", what: "Chats are saved to your account to reopen, rename and delete. With memory on, Keplar remembers durable things you tell it (name, goals, preferences) and keeps short summaries of recent chats. Memory is optional and under your control.", plans: "Every plan, signed in" },
      { name: "Specialists", what: "Custom specialists people make and share. Add one to your account and Keplar's panel of models answers with it; shared ones are reviewed before listing.", plans: "Signed-in users", href: "/specialists" },
      { name: "Connected apps (MCP)", what: "Connect remote MCP servers such as Context7, DeepWiki, Microsoft Learn and Cloudflare Docs (Linear, Notion and Sentry sign-in in beta). Their tools start off and need approval.", status: "beta" },
      { name: "Keplar Canvas", what: "When you come back signed in, the Canvas home picks up where you left off.", plans: "Signed-in users" },
    ],
  },
  {
    id: "platform", title: "Use it from anywhere",
    intro: "The same engine in a desktop app, behind an API and inside a widget on your site.",
    facts: [
      { name: "Desktop app", what: "For Windows, macOS and Linux. Keeps the app in its own window and adds the Roblox Studio co-builder; your account and data stay in the cloud.", plans: "Every plan", href: "/download" },
      { name: "Public API", what: "Ask Keplar from your own code with Bearer keys, streaming, an OpenAPI spec and per-plan limits. Free keys use free models only.", feature: "api", href: "/developers" },
      { name: "Embeddable widget", what: "One script tag puts Keplar Ask on your site, limited to the origins you allow.", feature: "embed", href: "/developers#embed" },
      { name: "Referral program", what: "Invite a friend and you both get extra usage, never cash.", feature: "referrals", href: "/referral-terms" },
      { name: "Languages", what: `The website is published in ${INDEXABLE.length} languages, and you can ask questions in your own language.`, plans: "Everyone" },
    ],
  },
  {
    id: "trust", title: "Trust and honesty",
    intro: "What Keplar says about itself, and what it does with your data.",
    facts: [
      { name: "No overclaiming", what: `${brand.name} is a practical multi-model workspace. It is not AGI or superintelligence, and agreement between models does not prove an answer is correct. Health, legal and money answers are general information, not professional advice.`, plans: "Everyone", href: "/ai-vs-agi-vs-superintelligence" },
      { name: "Privacy and security", what: "Files you attach are read for that question and not kept; voice is not recorded; a security page explains encryption, providers, retention and how to report a problem.", plans: "Everyone", feature: "security", href: "/security" },
      { name: "Changelog, roadmap and status", what: "Dated release notes, a public roadmap of what is in beta or coming soon, and a live status page.", plans: "Public", feature: "changelog", href: "/changelog" },
    ],
  },
];

/** Keplar Business, the separate product for companies (business.keplar.one), built from its plan table so prices stay current. */
const BUSINESS_CORE = BUSINESS_TIERS.starter.includes.slice(0, 11);
export const BUSINESS_FACTS = {
  title: "Keplar Business (business.keplar.one)",
  intro: `A separate desktop app for companies, on the same ${brand.name} accounts. business.keplar.one shows the plans, takes inquiries and business-account sign-up, and offers the download once a subscription is active. Agents live here: daily briefs, page monitors and lead follow-ups run on a schedule with run history, and anything an agent wants to send outside Keplar, such as an email, waits in Approvals until someone approves it. Team workspaces have owner, admin, editor and viewer roles. The workspace also has Create (sites, apps, images, video), Operations (orders, CRM, inbox, audit log) and Integrations (connectors and connected apps).`,
  includes: BUSINESS_CORE,
  plans: Object.values(BUSINESS_TIERS).map((t) => ({ name: t.name, price: t.monthly === null ? "Custom pricing" : `$${t.monthly.toLocaleString("en-US", { minimumFractionDigits: 2 })} a month`, audience: t.audience, highlights: t.includes.filter((x) => !x.startsWith("Everything in") && !BUSINESS_CORE.includes(x)).slice(0, 6) })),
};

/** One line per fact, for featureList and plain-text indexes. */
export const factLines = (): string[] => FACT_SECTIONS.flatMap((s) => s.facts.map((f) => `${f.name}: ${f.what}`));

/** The whole picture as Markdown-ish plain text (llms.txt, llms-full.txt). */
export function factsText(url: (p: string) => string): string {
  const label = { live: "", beta: " (beta)", soon: " (coming soon)" } as const;
  return [
    WHAT_IS_KEPLAR,
    "",
    NOT_JUST_MULTI_MODEL,
    "",
    ...FACT_SECTIONS.flatMap((s) => [
      `### ${s.title}`,
      s.intro,
      ...s.facts.map((f) => `- ${f.name}${label[statusOf(f)]}: ${f.what}${f.plans ? ` Plans: ${f.plans}.` : ""}${f.href ? ` More: ${url(f.href)}` : ""}`),
      "",
    ]),
    `### ${BUSINESS_FACTS.title}`,
    BUSINESS_FACTS.intro,
    `- Every Business plan includes: ${BUSINESS_FACTS.includes.join(", ")}.`,
    ...BUSINESS_FACTS.plans.map((p) => `- ${p.name}, ${p.price}, for ${p.audience.toLowerCase()}: ${p.highlights.join(", ")}.`),
    "- More: https://business.keplar.one",
    "",
  ].join("\n");
}

/* ── capability matrix: which product and platform has what (one source for the page, llms.txt and /capabilities.json) ── */

export type Cell = "yes" | "beta" | "no" | "n/a";
export const MATRIX_COLUMNS = ["Keplar One web", "Keplar One desktop", "Keplar Business web", "Keplar Business desktop"] as const;
export type MatrixRow = { feature: string; cells: [Cell, Cell, Cell, Cell]; note?: string };

/** Honest per-surface availability. Business is a separate product (business.keplar.one and its own desktop app). */
export const CAPABILITY_MATRIX: MatrixRow[] = [
  { feature: "Multi-model answers (Ask)", cells: ["yes", "yes", "yes", "yes"] },
  { feature: "Reason and Deep Research", cells: ["yes", "yes", "yes", "yes"], note: "Deep Research on Keplar One starts at Plus." },
  { feature: "Study mode", cells: ["yes", "yes", "no", "no"] },
  { feature: "Slideshow maker", cells: ["yes", "yes", "no", "no"], note: "Plus and Pro." },
  { feature: "Image generation", cells: ["yes", "yes", "yes", "yes"], note: "Keplar One: Plus and Pro." },
  { feature: "Video generation", cells: ["beta", "beta", "beta", "beta"], note: "Keplar One: Pro." },
  { feature: "Create websites and apps", cells: ["yes", "yes", "yes", "yes"] },
  { feature: "Roblox Studio co-builder", cells: ["no", "beta", "no", "no"], note: "Needs Roblox Studio on the same computer." },
  { feature: "Blender co-builder", cells: ["no", "beta", "no", "no"], note: "Desktop app 0.1.8+, Blender 4.2+." },
  { feature: "Floating overlay over Studio or Blender", cells: ["no", "beta", "no", "no"] },
  { feature: "Scheduled agents and Approvals", cells: ["no", "no", "beta", "beta"] },
  { feature: "Operations: orders, CRM, inbox, audit log", cells: ["no", "no", "beta", "beta"] },
  { feature: "Connected apps (MCP)", cells: ["beta", "beta", "beta", "beta"] },
  { feature: "Projects", cells: ["yes", "yes", "yes", "yes"] },
  { feature: "Chat history and optional memory", cells: ["yes", "yes", "no", "no"], note: "Business keeps projects and report history instead." },
  { feature: "Public API and embeddable widget", cells: ["beta", "n/a", "no", "n/a"], note: "Keys come with a Keplar One account." },
];

/** The registry as data, for /capabilities.json (machine-readable; the pages and llms.txt are built from the same values). */
export function capabilitiesManifest(origin: string) {
  return {
    name: brand.companyName,
    url: `${origin}/`,
    summary: WHAT_IS_KEPLAR,
    products: [
      { id: "keplar-one", name: brand.companyName, url: `${origin}/`, platforms: ["Web", "Windows", "macOS", "Linux"] },
      { id: "keplar-business", name: "Keplar Business", url: "https://business.keplar.one/", platforms: ["Windows", "macOS", "Linux"], note: "Separate product on the same Keplar account." },
    ],
    statuses: { live: "available to everyone it applies to", beta: "works, still changing or limited to some plans", soon: "being built, not usable yet" },
    sections: FACT_SECTIONS.map((sec) => ({ id: sec.id, title: sec.title, intro: sec.intro, features: sec.facts.map((f) => ({ name: f.name, description: f.what, status: statusOf(f), ...(f.plans ? { plans: f.plans } : {}), ...(f.href ? { url: f.href.startsWith("http") ? f.href : `${origin}${f.href}` } : {}) })) })),
    business: { title: BUSINESS_FACTS.title, intro: BUSINESS_FACTS.intro, includes: BUSINESS_FACTS.includes, plans: BUSINESS_FACTS.plans },
    matrix: { columns: MATRIX_COLUMNS, rows: CAPABILITY_MATRIX },
  };
}
