/**
 * Docs section ids and hub text. Kept free of fs/content imports so the edge proxy (docs.keplar.one routing) can read the ids.
 */
export type DocSection = { id: string; title: string; blurb: string };

/** Left-nav order and the text of each section hub. Add a section here, then put pages in content/docs/<id>/. */
export const docSections: DocSection[] = [
  { id: "get-started", title: "Get started", blurb: "Ask your first question, read the answer, and understand what Keplar does and does not do. Ten minutes from here to a confident first week." },
  { id: "how-it-works", title: "How Keplar works", blurb: "The pipeline behind every answer: how a question is understood, which kinds of questions bring in more models, how routing, agreement, disagreement, verification and synthesis work, and where the limits are." },
  { id: "using-keplar", title: "Using Keplar", blurb: "Practical guides for the chat: thoroughness, attachments, follow-ups, memory, sharing, Deep Research, Study mode, slides and tools." },
  { id: "create", title: "Create", blurb: "Build and publish a site, import a product, generate images and video, and connect a domain. What each plan allows and what happens when something goes wrong." },
  { id: "connectors-agents", title: "Connectors and agents", blurb: "Connect outside apps with the Model Context Protocol, control what they may do, and run agents that work under spend caps and approvals." },
  { id: "billing-plans", title: "Plans, credits and limits", blurb: "Free, Lite, Plus, Pro and Business; how credits are counted; the rolling limits; and what to do when you reach one." },
  { id: "desktop", title: "Desktop app", blurb: "Install the Keplar desktop app, sign in, and fix the common problems." },
  { id: "extension", title: "Browser extension", blurb: "Keplar One for Chrome and Edge: ask about a selection or a page, and use Search with Keplar One to search anything on a page by dragging over it." },
  { id: "privacy-security", title: "Privacy and security", blurb: "What happens to your questions, files and memory; how to export or delete them; and the protections around accounts, connected apps and published sites." },
  { id: "reference", title: "Reference", blurb: "Lookup pages: the roster and its roles, answer sections, limits at a glance, the developer story, status messages and a glossary pointer." },
];

export const DOC_SECTION_IDS: ReadonlySet<string> = new Set(docSections.map((s) => s.id));
