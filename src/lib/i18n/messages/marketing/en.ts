/**
 * Server-only English copy for the localized marketing pages (home, features, pricing, showcase, roadmap, developers, sign-in, sign-up).
 * The source every other locale translates. Structured product data (feature registry, plans, the home story) is read from
 * its own module so English keeps one source; strings that only lived in JSX are written here.
 *
 * Rich strings mark links with <tag>text</tag>; src/lib/i18n/format.tsx turns them into elements. {name} is a value slot.
 */
import { CHAPTERS, STATUS_LABEL } from "@/lib/features";
import { pricingCopy } from "@/lib/sections";
import { tiers } from "@/lib/tiers";
import { planFits } from "@/lib/growth/pricing-page";
import { SHOWCASE_DISCLOSURE } from "@/lib/create/showcase/data";
import { site } from "@/lib/site";

const chapters: Record<string, { label: string; title: string; lede: string }> = {};
const items: Record<string, { name: string; line: string; note?: string }> = {};
for (const c of CHAPTERS) {
  chapters[c.id] = { label: c.label, title: c.title, lede: c.lede };
  for (const f of c.features) items[f.id] = f.note ? { name: f.name, line: f.line, note: f.note } : { name: f.name, line: f.line };
}
const plan = (id: string) => tiers.find((t) => t.id === id)!;
const tier = (id: string) => ({ summary: plan(id).summary, features: [...plan(id).features], cta: plan(id).cta.label });
const fit = (id: string) => {
  const f = planFits.find((x) => x.plan === id)!;
  return { who: f.who, outcome: f.outcome, cta: f.cta.label };
};

const en = {
  meta: {
    home: { title: site.seoTitle, description: "Keplar sends your question to multiple AI models, finds where they disagree, verifies, and gives you one synthesized answer. Free to try, no signup." },
    features: { title: "Everything in Keplar", description: "Every Keplar feature on one page, grouped by what it is for: asking, reading files, creating sites and apps, building together, shipping, the API and widget, and trust. Each one says whether it is live, in beta or coming soon." },
    pricing: { title: "Pricing: Free, Plus $45, Pro $99", description: "Start free with Keplar One. Keplar Plus is $45/month, Keplar Pro is $99/month, and Business plans are available through our sales team. Usage you can see, never hidden." },
    showcase: { title: "Create showcase: what an app built with Keplar should look like", description: "Eight demo sites and apps made by the Keplar team to show the range Create aims for: menus, ledgers, boards, calendars and editorial pages, each in its own type and palette. Not customer sites." },
    roadmap: { title: "Roadmap", description: "What Keplar is building now, what is in beta and still being finished, and what shipped recently. No target dates we cannot keep." },
    developers: { title: "Keplar for developers: API, embeddable Ask, Teams", description: "Ask Keplar from your own code with a Bearer API key, or drop the Ask widget on your site with one script tag. OpenAPI spec, streaming, per-plan limits stated plainly." },
    signin: { title: "Log in", description: "Log in to Keplar." },
    signup: { title: "Create your account", description: "Create a free Keplar account." },
  },
  status: { live: STATUS_LABEL.live, beta: STATUS_LABEL.beta, soon: STATUS_LABEL.soon },
  chapters: {
    demoKicker: "Live demo",
    demoTitle: "Try it here. No account.",
    proof: "Keplar was created by two co-founders, {credit}. Shipping in public: <changelog>changelog</changelog>, <roadmap>roadmap</roadmap>, and a <security>security page</security> that says what is and is not done.",
    showcaseNote: "Showcase demos are made by the Keplar team, not customer sites. <link>See all eight</link>",
    closeTitle: "Ask Keplar anything.",
    closeCta: "Ask Keplar anything",
    closeSmall: "Free, no card. <link>Everything in Keplar on one page</link>, with what is live, in beta and coming soon.",
    voiceCaption: "Voice Live Create: speak, and the editor, terminal and preview move together. Pause and it holds; say \"actually\" and it revises.",
    voiceLabel: "Voice Live Create: editor, terminal and live preview side by side",
    list: chapters,
    items,
  },
  featuresPage: {
    kicker: "Everything in Keplar",
    crumb: "Features",
    title: "Every feature, and whether you can use it today.",
    lead: "<b>{live}</b> live, <b>{beta}</b> in beta, <b>{soon}</b> coming soon. Beta works but may change or be limited to some plans. Coming soon is not usable yet and is not linked as if it were.",
    sections: "Sections",
    thFeature: "Feature",
    thWhat: "What it does",
    thStatus: "Status",
    foot: "What changed recently: <changelog>changelog</changelog>. What is next: <roadmap>roadmap</roadmap>. Ready to try it: <demo>ask a question on the home page</demo>, no account.",
  },
  pricing: {
    label: pricingCopy.label,
    title: pricingCopy.title,
    lede: pricingCopy.lede,
    tailored: "Tailored to your business",
    custom: "Custom",
    cadence: { forever: "forever", "per month": "per month", custom: "custom" } as Record<string, string>,
    perMonth: "{price}/mo",
    fine: "Cancel any time from your account. Checkout is handled by Whop. Credits renew every month and are used according to how much model work a question needs: simple questions cost very little.",
    tiers: { free: tier("free"), lite: tier("lite"), plus: tier("plus"), pro: tier("pro") } as Record<string, { summary: string; features: string[]; cta: string }>,
    fitTitle: "Which plan fits?",
    fits: { free: fit("free"), plus: fit("plus"), pro: fit("pro") } as Record<string, { who: string; outcome: string; cta: string }>,
    compareTitle: "Compare every plan",
    compareLede: "The full feature-by-feature table, with every limit the product enforces today, is on the English pricing page.",
    compareLink: "See the full comparison (in English)",
    closingTitle: "Not sure yet? Start free.",
    closingLede: "Ask a real question and see where the models agree and where they split. No card needed, and you can upgrade from inside the app when you want more.",
    closingAsk: "Ask Keplar anything",
    closingCompare: "How Keplar compares",
  },
  roadmap: {
    kicker: "Roadmap",
    title: "What we are building, and what is not done yet.",
    lead: "No target dates: things ship when they work. Everything below is either being built now or already usable in beta with known gaps. For what has shipped, see the <changelog>changelog</changelog>; for the full list with status, see <features>everything in Keplar</features>.",
    nowNum: "Now",
    nowTitle: "Being built",
    nowLede: "Not usable yet. Shown as Coming soon everywhere on the site.",
    nextNum: "Next",
    nextTitle: "Finishing beta features",
    nextLede: "These work today. This is what is still missing.",
    doneNum: "Shipped",
    doneTitle: "Recently",
    doneLede: "The last few releases. Dates come from the commit history.",
    englishNote: "Release notes are in English.",
    finishing: [
      { feature: "Public API", items: ["Team-level keys", "Per-key credit caps", "An official SDK", "Webhooks"] },
      { feature: "Embeddable widget", items: ["Signed publisher tokens", "Custom styling"] },
      { feature: "Keplar for Teams", items: ["Per-member caps and usage breakdown", "Owner transfer", "Single sign-on"] },
      { feature: "Voice", items: ["A fallback for browsers without speech recognition (Firefox)", "A language picker"] },
      { feature: "Source checks", items: ["Turn on web source checks for paid plans after a live test"] },
    ],
    foot: "Something missing you need? <feedback>Tell us</feedback>. Security issues go to the address on the <security>security page</security>.",
  },
  showcase: {
    kicker: "Showcase",
    title: "No purple glow. No three-card grid. Built for the business in the brief.",
    lead: "Create plans a design for what you describe, then refuses the patterns that make AI-built sites look alike. These demos show the range we hold it to: a wine list set like a printed card, a roastery ledger, a courier dispatch board.",
    disclosure: SHOWCASE_DISCLOSURE,
    sites: "sites",
    apps: "apps",
    styles: "visual styles",
    industries: "industries",
    contentNote: "Demo titles and descriptions are in English.",
    galleryKicker: "Made by people using Keplar",
    gallery: "Community gallery",
    yourTurn: "Your turn",
    openCreate: "Open Create",
  },
  developers: {
    kicker: "Developers",
    title: "Build with Keplar.",
    lede: "One request sends a question to several models, compares them, and returns one answer with a plain record of where they disagreed. Call it from your server with an API key, or put the same Ask on your own site with one script tag.",
    getKey: "Get an API key",
    widget: "Create a widget",
    spec: "OpenAPI spec",
    endpoint: "Primary endpoint",
    products: [
      { name: "Public API", text: "Bearer keys, JSON or streaming answers, agreement and disagreement in every response." },
      { name: "Embeddable Ask", text: "A themeable Ask box for your docs or product. Origin allowlist and rate limits included." },
      { name: "Keplar for Teams", text: "Shared workspaces with admin, editor and viewer roles, invites by email or link." },
      { name: "Referrals", text: "Share your link. You and a friend each get {n} usage credits when they join." },
    ],
    platform: "Platform",
    refTitle: "The full reference",
    refLede: "Tiers and limits, the quickstart, the request and response format, streaming, the widget, Teams roles, errors and security notes are on the English developer page. Code, field names and error codes are the same in every language.",
    sections: ["Tiers and limits", "Quickstart", "POST /api/v1/ask", "Streaming", "Embeddable Ask widget", "Keplar for Teams", "Errors", "Security and privacy", "Not available yet"],
    refLink: "Open the full reference (in English)",
  },
  auth: {
    signinTitle: "Log in to Keplar",
    signinLead: "Pick up your threads, projects, and plan.",
    addTitle: "Add an account",
    addLead: "Sign in with another account. The account you're using stays signed in on this device.",
    checkoutLead: "Log in to continue to checkout. You'll go straight to payment after.",
    expired: "{email} was signed out. Sign in again to use it.",
    signupTitle: "Create your Keplar account",
    signupLead: "For homework and big decisions, trip plans and side projects, or running a business. Free runs on free open models, and you can upgrade any time.",
    invited: "A friend invited you: when your email is verified you both get extra usage credit (never cash). Details in the referral terms.",
    signUp: "Sign up",
    logIn: "Log in",
    toggle: "Sign up or log in",
    about: "About Keplar",
    panel: {
      signin: { eyebrow: "Welcome back", title: "Pick up where you left off.", lead: "Your threads, projects and plan are waiting, on every device you sign in on." },
      signup: { eyebrow: "Free account", title: "Stop trusting one AI.", lead: "Free runs on free open models, and you can upgrade any time." },
    },
    points: ["Asks the models your question needs", "Shows you where they disagree", "One answer, with the disagreements shown"],
  },
};

export default en;
