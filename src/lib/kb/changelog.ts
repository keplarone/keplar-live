/**
 * Release notes. Every entry is a user-visible change that shipped (dated from the project's commit history) and is described
 * the way the product behaves today. No benchmark or accuracy claims. Add new entries at the top; the sitemap, llms.txt, feed
 * and page read from this file. `beta` features say so.
 */
export type Release = { id: string; date: string; title: string; summary: string; items: string[]; links?: { href: string; label: string }[] };

export const releases: Release[] = [
  {
    id: "2026-10-12-blender-cloud",
    date: "2026-10-12",
    title: "Blender Cloud rendering (beta): render while your computer is off",
    summary: "Blender mode can now render the open scene on Keplar's servers, so the frames keep coming after you close Blender, and they wait for you to download them.",
    items: [
      "Prepare a cloud render: the Keplar add-on saves a copy of the scene, unsaved changes included, and packs its textures and linked files into it. Your own file isn't changed. Missing textures and anything that can't travel, such as caches on disk, are listed first.",
      "Pick the engine (Cycles, EEVEE or Workbench), the frames, resolution, samples and format, a time limit and a credit budget. Animations can also be joined into an MP4.",
      "Each render gets its own machine with Blender 5.2 and no internet access. The scene uploads straight to it from the desktop app, and the frames come back to Documents/Keplar renders.",
      "Charged by machine time, not per frame. Pause stops the machine; resume renders only the missing frames. Long renders continue on fresh machine sessions. Renders are kept three days.",
      "Needs desktop app 0.1.10 or newer and the updated Keplar add-on (press Set up Blender once).",
    ],
    links: [{ href: "/docs/studio/blender-cloud-rendering", label: "Blender Cloud rendering" }, { href: "/blender-ai", label: "Blender AI" }],
  },
  {
    id: "2026-10-12",
    date: "2026-10-12",
    title: "Roblox Cloud overnight jobs, better Studio effects, and the Keplar One browser extension (beta)",
    summary: "Roblox Studio mode can now keep working on your game's scripts while your computer is off, its effects follow real flipbook and lighting rules, and Keplar One brings Keplar into Chrome and Edge.",
    items: [
      "Roblox Cloud (beta): give a goal, a credit budget and a time limit of up to 12 hours, and it works on your game's scripts on Keplar's servers. Every edit is checked with Luau's own analyzer, and you review and apply the changes in Studio, each as one Undo step. Scripts only; it can't play-test.",
      "Studio effects: flipbook particles use valid 1024 by 1024 sheets in the grid their creator states, glows are self-lit with bright cores, smoke is lit by the scene, and textures come from vetted packs before a filtered Creator Store search.",
      "Roblox Studio mode and Roblox Cloud run on Claude Opus 5.5 only. If it can't be reached, the build pauses and says so instead of switching models.",
      "Keplar One for Chrome and Edge (beta): ask about a selection or a page from the toolbar or right-click menu with your API key. It has been submitted to the Chrome Web Store.",
      "Search with Keplar One: drag over any text or picture on a page and the answer opens in a side panel, with follow-ups, Translate, Copy text and Copy as image. It asks once before sending anything.",
      "The API accepts one optional image with a question, checked like an image in the app and not stored.",
      "New docs for Roblox Studio mode, Roblox Cloud, effects and textures, Blender mode and the extension.",
    ],
    links: [{ href: "/docs/studio/roblox-cloud", label: "Roblox Cloud" }, { href: "/docs/studio/effects-and-textures", label: "Effects and textures" }, { href: "/docs/extension/search-with-keplar-one", label: "Search with Keplar One" }, { href: "/docs/studio/blender-mode", label: "Blender mode" }],
  },
  {
    id: "2026-10-06",
    date: "2026-10-06",
    title: "A home page that shows everything, a live demo, the Create showcase and Voice Live Create (beta)",
    summary: "The home page now walks through every part of Keplar with an honest status for each feature, and you can ask a real question on it without an account.",
    items: [
      "Live demo on the home page: ask a real question with no account and watch the stages, the models answering, any disagreement and the answer arrive. It uses free models and a small daily allowance.",
      "Everything in Keplar: one page listing every feature as Live, Beta or Coming soon, and a roadmap that names what is not done yet, with no target dates.",
      "Create showcase: eight demo sites and apps made by the Keplar team (not customer sites) that show the range Create is held to, each with the brief you would type.",
      "Voice Live Create (beta): speak a brief and watch the editor, terminal and a rough preview update together. Pauses hold the last state; saying \"actually\" revises it. Then build it for real.",
      "Surprise me in Create: one press picks a specific brief, style and depth and builds it.",
      "Version history in Create can now branch any version into a new draft, next to Restore.",
      "Community gallery: like the sites people share, next to Remix and Report.",
    ],
    links: [{ href: "/features", label: "Everything in Keplar" }, { href: "/showcase", label: "Create showcase" }, { href: "/roadmap", label: "Roadmap" }],
  },
  {
    id: "2026-10-04",
    date: "2026-10-04",
    title: "Public shared answers, early drafts while you wait, calmer sidebar",
    summary: "You can now publish a shared answer as a public page (your choice, off by default), and answers start to appear while the models are still working.",
    items: [
      "Make public: after you create a private share link, an optional second step publishes that answer at its own address on keplar.one/answers, where search engines may index it. It needs a verified email and an explicit tick, and Keplar refuses to publish a page where it detects an email address, phone number, card number or key. You can make it private again at any time.",
      "Early draft: the first panel model's words now reach the screen as they arrive, labelled as an early draft until the checked answer replaces it. Short replies still appear on completion.",
      "Recents in the sidebar is one collapsible row, closed by default and remembered per account.",
      "New chats get a title by topic; sensitive or very short messages get a neutral title instead of your words.",
      "A public status page at /status shows live checks.",
    ],
    links: [{ href: "/docs/using-keplar/share-an-answer", label: "Share an answer" }, { href: "/answers", label: "Shared answers" }, { href: "/status", label: "Status" }],
  },
  {
    id: "2026-10-03",
    date: "2026-10-03",
    title: "Docs, blog and glossary; images in chat; connected apps (beta)",
    summary: "A help center and reference library went live, and chat gained image creation and connected apps.",
    items: [
      "Knowledge base: docs for how Keplar works, using it, plans and privacy; a blog; a glossary of AI terms; a prompt library; use-case pages; and dated comparisons that only state facts we could check.",
      "Create images in normal chat, with a cost card before anything above 15 credits, plus Download, Regenerate, Variation and Edit on the result.",
      "Connected apps (beta): Gmail, Calendar, Slack and GitHub over OAuth, with per-tool switches and approvals. Only connectors that are set up are shown.",
      "Create > Video (beta) and Create > Mobile (beta, generates an Expo project).",
      "Import a product into your site from a photo or a link.",
      "Delete a chat from the sidebar, history or the open chat, with an Undo for a few seconds.",
      "The disagreement section now appears only when the models actually took more than one position.",
      "Desktop app sign-in goes through your system browser.",
      "Several signed-in accounts per device, with instant switching.",
      "Opt-in learning: with \"Help improve Keplar\" on, Keplar uses outcomes to adjust which models it picks for a type of question. Models are not retrained.",
    ],
    links: [{ href: "/docs", label: "Docs" }, { href: "/blogs", label: "Blog" }, { href: "/glossary", label: "Glossary" }, { href: "/docs/connectors-agents/connected-apps-overview", label: "Connected apps" }],
  },
  {
    id: "2026-10-02",
    date: "2026-10-02",
    title: "Create sites and images, voice dictation, account export and delete",
    summary: "The Create workspace shipped, along with cookie choices and data controls.",
    items: [
      "Create: a site builder with templates, chat edits, a cost estimate you confirm first, a sandboxed responsive preview, code or ZIP download, history with undo, and publishing.",
      "Image generation in Create, with an estimate and confirmation before it runs.",
      "Voice dictation in the Ask box (browser speech recognition; the microphone is used only after you click).",
      "Account: export your data as JSON and delete your account, each behind a confirmation.",
      "Cookie choices: Accept all, Reject non-essential or Customize; analytics only runs if you allow it.",
      "Chat memory: your conversation is sent to the models so follow-ups make sense, and new chats can use your saved notes.",
    ],
    links: [{ href: "/docs/create/create-overview", label: "Create overview" }, { href: "/docs/using-keplar/voice-dictation", label: "Voice dictation" }, { href: "/docs/privacy-security/delete-and-export", label: "Delete and export" }],
  },
  {
    id: "2026-10-01",
    date: "2026-10-01",
    title: "Slideshow creator, Study mode, saved chats and memory",
    summary: "Study and presentation tools arrived, and signed-in chats are saved.",
    items: [
      "Slideshow creator (Plus and Pro) with PPTX and PDF export.",
      "Study mode, available on every plan.",
      "Saved chats and memory for signed-in users, with commands to remember or forget and a setting that hard-deletes.",
      "Longer sessions: sign-in lasts 60 days, you can see your devices and sign out everywhere.",
      "Usage meter and rolling usage limits for paid plans.",
      "Embedded checkout for paid plans.",
    ],
    links: [{ href: "/docs/using-keplar/slideshow-creator", label: "Slideshow creator" }, { href: "/docs/using-keplar/study-mode", label: "Study mode" }, { href: "/docs/using-keplar/memory", label: "Memory" }],
  },
  {
    id: "2026-09-28",
    date: "2026-09-28",
    title: "Live models, a Free plan, images and video in questions",
    summary: "Keplar began answering with live models.",
    items: [
      "Live multi-model answers: Keplar picks the models a question needs, compares their positions and writes one answer.",
      "A Free plan that uses free open models only.",
      "Attach images and videos to a question by button, drag-and-drop or paste.",
      "Email sign-in with a one-time link.",
    ],
    links: [{ href: "/how-it-works", label: "How it works" }, { href: "/models", label: "Models" }, { href: "/pricing", label: "Pricing" }],
  },
  {
    id: "2026-09-27",
    date: "2026-09-27",
    title: "Keplar's first public build",
    summary: "The website, the app shell, accounts and the Keplar brand went up.",
    items: ["The marketing site, How it works, and the first version of the app.", "Accounts, with protections against abuse and a unified usage ledger."],
    links: [{ href: "/product", label: "Product" }, { href: "/about", label: "About" }],
  },
];

export const releaseDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
export const latestRelease = () => releases.reduce((a, b) => (a.date > b.date ? a : b)).date;
