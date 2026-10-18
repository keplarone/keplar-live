/**
 * /ai-app-builder: the search landing page for Create (people looking for an "AI app builder" / "AI website builder").
 * Copy describes only what the build pipeline does today (src/lib/app-builder/pipeline.ts, verify/smoke.ts, critic/service.ts)
 * and the per-plan limits it enforces (src/lib/create/platform/plans.ts). No customer counts, testimonials or logos.
 */
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import type { Section } from "@/lib/content/landing";

const projects = (p: keyof typeof ENTITLEMENTS) => ENTITLEMENTS[p].projects;

export const createLanding = {
  slug: "ai-app-builder",
  path: "/ai-app-builder",
  metaTitle: "AI App and Website Builder That Tests Its Work",
  metaDescription:
    "Describe a site or app and Keplar Create builds it with a code editor, terminal and live preview, then reviews it for accessibility and generic design.",
  ogTitle: "Describe it. Keplar builds and tests it.",
  label: "Create",
  h1: "Describe it. Keplar builds it, then tests it.",
  lede: "Create turns a description, typed or spoken, into a working site or app. Every build is planned, written, opened in a real browser, checked and fixed before you see it, so you start from something that runs, not a pile of code to debug.",
  examples: [
    "A booking page for a dog-walking business with a weekly schedule",
    "A habit tracker that saves my streaks and shows a monthly chart",
    "A one-page portfolio for a product designer with a contact form",
  ],
  sections: [
    {
      h2: "How a build works",
      bullets: [
        "Plan: Create turns your description into screens, data and actions, and shows you the plan.",
        "Build: it writes the project, with any images it needs generated alongside.",
        "Test: it serves the app privately and opens it in a real headless browser. It visits every page, signs up as a test user, creates records, calls each AI action once, and checks that the data shows up.",
        "Fix: page errors, console errors, failed requests, empty screens and sideways scrolling are reported with the file and line, fixed, and tested again.",
        "Save: you get a version you can preview, edit and roll back.",
      ],
    },
    {
      h2: "Not vibe-coded",
      p: [
        "Generated code that looks right but breaks on the second click is the usual problem with AI builders. Create treats a build as unfinished until it passes its own tests, and a separate design and accessibility review (rules, an automated axe-core pass in a real browser, and a model review) suggests fixes you can apply as a new version.",
        "You can still open the code. The editor, a terminal and the live preview sit side by side, and every change is a version you can branch from.",
      ],
    },
    {
      h2: "From text or voice",
      p: ["Type a description or talk it through. Voice Create keeps the editor, terminal and preview on screen while you speak, so you can watch the build change as you describe it."],
    },
    {
      h2: "Publish and share",
      bullets: [
        "Publish with a shareable link when you are ready.",
        "Connect your own domain on Plus and Pro.",
        `Free includes ${projects("free")} project, Plus ${projects("plus")} and Pro ${projects("pro")}.`,
      ],
    },
    {
      h2: "Honest about limits",
      p: [
        "Create needs a free account. Free builds on free open models, which are slower and less capable than the premium models on paid plans, and has a smaller daily build allowance.",
        "Automated tests catch a lot, not everything. Review what you publish, especially anything that handles payments or personal data.",
      ],
    },
  ] satisfies Section[],
  faq: [
    { q: "Do I need to know how to code?", a: "No. You describe what you want and Create builds it. If you do code, the editor and terminal are there, and every change is saved as a version." },
    { q: "What can it build?", a: "Websites, landing pages and small apps with screens, saved data, sign-up and AI actions. Larger systems may need several rounds of edits." },
    { q: "Is Create free?", a: `Yes, with a free account: ${projects("free")} project on free open models and a smaller daily build allowance. Paid plans use premium models, allow more projects, and include custom domains from Plus.` },
    { q: "How is this different from other AI app builders?", a: "Every build is tested in a real browser and fixed before you see it, and a separate design and accessibility review runs on request. Create also sits next to Keplar's multi-model answers, so you can research and build in one place." },
    { q: "Who owns what I build?", a: "You keep your rights in what you submit, and Keplar uses your input and its outputs only as needed to run the service for you. The Terms have the details." },
  ],
  related: ["/showcase", "/pricing", "/for-founders", "/for-small-business"],
} as const;
