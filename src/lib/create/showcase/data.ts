/**
 * Curated Create showcase: demo builds written by the Keplar team to show the range and craft Create aims for.
 * These are NOT customer sites and every page says so. Facts inside them (prices, names, dates) are fictional sample content.
 */
export type ShowcaseArchetype = "editorial" | "menu" | "ledger" | "board" | "calendar";
export type ShowcaseItem = {
  slug: string;
  title: string;
  kind: "Site" | "App";
  industry: string;
  style: string;
  complexity: "Simple" | "Medium" | "Advanced";
  line: string;
  /** The brief you would type into Create for something like this. */
  prompt: string;
  archetype: ShowcaseArchetype;
  palette: { bg: string; surface: string; ink: string; muted: string; accent: string; line: string };
  font: { display: string; body: string };
  /** What makes it not a template, in one sentence each. */
  craft: string[];
};

const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif`;
const GROTESK = `ui-sans-serif, system-ui, sans-serif`;
const MONO = `ui-monospace, "SFMono-Regular", Menlo, monospace`;
const HUMANIST = `"Gill Sans", "Gill Sans MT", Seravek, "Trebuchet MS", ui-sans-serif, sans-serif`;

export const SHOWCASE: ShowcaseItem[] = [
  {
    slug: "saltgrass-wine-bar", title: "Saltgrass", kind: "Site", industry: "Hospitality", style: "Retro print", complexity: "Simple",
    line: "A natural wine bar's weekly list, set like a printed menu card.",
    prompt: "A website for a small natural wine bar called Saltgrass: a weekly-changing list by the glass and bottle with producer and region, Thursday tastings with sign-up, and opening hours. Warm, printed-menu feel.",
    archetype: "menu",
    palette: { bg: "#f3e6cf", surface: "#fbf3e4", ink: "#2b1d14", muted: "#6f5440", accent: "#b8471a", line: "rgba(43,29,20,.18)" },
    font: { display: SERIF, body: HUMANIST },
    craft: ["Menu set with leader dots and tabular prices, not cards.", "One rust accent used on the price column and the tasting date.", "Hours and address as a typographic colophon."],
  },
  {
    slug: "kiln-and-co", title: "Kiln & Co.", kind: "Site", industry: "Craft retail", style: "Editorial", complexity: "Medium",
    line: "A ceramics studio shop with a magazine grid and a 'kiln this week' log.",
    prompt: "An online shop for a two-person ceramics studio: collections by glaze, product pages with size options, a 'kiln this week' log of what is being fired, and studio visit booking. Editorial, warm paper, serif headlines.",
    archetype: "editorial",
    palette: { bg: "#f4efe6", surface: "#fbf8f2", ink: "#1d1a16", muted: "#655e54", accent: "#a63f19", line: "rgba(29,26,22,.14)" },
    font: { display: SERIF, body: GROTESK },
    craft: ["Asymmetric 12-column grid: narrow text beside wide figures.", "Numbered section kickers and hairline rules instead of boxes.", "Glaze swatches drawn in CSS, no stock photos."],
  },
  {
    slug: "roastlog", title: "Roastlog", kind: "App", industry: "Food production", style: "Swiss grid", complexity: "Advanced",
    line: "A roastery's batch log, green-bean inventory and weekly numbers.",
    prompt: "A dashboard for a two-person coffee roastery: roasts logged with origin, charge weight and development time, green-bean inventory with low-stock warnings, and weekly kilos roasted. Strict grid, one signal color.",
    archetype: "ledger",
    palette: { bg: "#0f0f0f", surface: "#181818", ink: "#f5f5f2", muted: "#9d9d97", accent: "#ff5436", line: "rgba(245,245,242,.12)" },
    font: { display: GROTESK, body: GROTESK },
    craft: ["Data in aligned tables with tabular figures.", "The accent marks exactly one thing per screen: what needs attention.", "Low-stock rows explain themselves in plain words."],
  },
  {
    slug: "shift-habits", title: "Shift", kind: "App", industry: "Health & wellbeing", style: "Minimal", complexity: "Medium",
    line: "A habit tracker that follows a nurse's shift pattern, not the calendar.",
    prompt: "A habit tracker for night-shift nurses: habits that follow a shift pattern instead of the calendar, a two-tap check-in, forgiving streaks, and a monthly view. Calm, precise, dark.",
    archetype: "board",
    palette: { bg: "#0e0f10", surface: "#16181a", ink: "#ededed", muted: "#9a9a9a", accent: "#2dd4bf", line: "rgba(237,237,237,.1)" },
    font: { display: GROTESK, body: GROTESK },
    craft: ["Shift blocks (Day / Night / Off) drive the layout.", "Streaks forgive one miss and say so.", "Two-tap check-in with real empty states."],
  },
  {
    slug: "northline-couriers", title: "Northline", kind: "App", industry: "Logistics", style: "Brutalist", complexity: "Advanced",
    line: "A courier co-op's dispatch board: jobs, riders and proof of delivery.",
    prompt: "A dispatch board for a cooperative of five bike couriers: a live job board by status, rider availability, proof-of-delivery photos, and a weekly earnings ledger. Raw grid, heavy borders, loud type.",
    archetype: "board",
    palette: { bg: "#f2f0ea", surface: "#ffffff", ink: "#0a0a0a", muted: "#4a4a4a", accent: "#ff4a1c", line: "#0a0a0a" },
    font: { display: GROTESK, body: MONO },
    craft: ["2px borders and hard offset shadows, zero gradients.", "Job cards read like stamped dockets.", "Monospaced metadata for times and distances."],
  },
  {
    slug: "field-notes-portfolio", title: "Field Notes", kind: "Site", industry: "Photography", style: "Luxury", complexity: "Simple",
    line: "A documentary photographer's portfolio, quiet and expensive.",
    prompt: "A portfolio for a documentary photographer: three long-form projects with captions, an about page, and a commissions inquiry form. Dark, generous whitespace, didone-style headlines.",
    archetype: "editorial",
    palette: { bg: "#0d0c0b", surface: "#161412", ink: "#eee6d6", muted: "#a79e8c", accent: "#c9a45c", line: "rgba(238,230,214,.14)" },
    font: { display: SERIF, body: GROTESK },
    craft: ["Letter-spaced small caps labels and gold hairlines.", "Captions under every figure, like a printed monograph.", "Sparse copy: every line earns its place."],
  },
  {
    slug: "tidewater-sailing", title: "Tidewater", kind: "App", industry: "Education & leisure", style: "Organic", complexity: "Medium",
    line: "A dinghy sailing school's sessions, boats and weather calls.",
    prompt: "A booking app for a dinghy sailing school: course levels, sessions on a week calendar, boat availability, a weather-call board (go / hold / cancelled) and a skills checklist per student.",
    archetype: "calendar",
    palette: { bg: "#eeefe8", surface: "#f8f8f2", ink: "#1e2a22", muted: "#566259", accent: "#2f6b5e", line: "rgba(30,42,34,.14)" },
    font: { display: SERIF, body: HUMANIST },
    craft: ["Week calendar with real slot states, not a stock widget.", "Weather call shown as a plain status the whole school sees.", "Earthy palette with one sea-green accent."],
  },
  {
    slug: "small-hours-books", title: "Small Hours", kind: "Site", industry: "Independent retail", style: "Editorial dark", complexity: "Medium",
    line: "An indie bookstore's readings, staff picks and pre-orders.",
    prompt: "A website for a two-person bookshop open late: upcoming readings with RSVP, a staff picks shelf with handwritten-style notes, pre-orders, and a monthly reading club. Dark, literary, serif.",
    archetype: "menu",
    palette: { bg: "#151311", surface: "#1e1b18", ink: "#efe8dc", muted: "#a39a8c", accent: "#e07a4f", line: "rgba(239,232,220,.14)" },
    font: { display: SERIF, body: GROTESK },
    craft: ["Events set as a dated index, not tiles.", "Staff picks as shelf-talker notes.", "Warm accent only on dates and the RSVP action."],
  },
];

export const showcaseBySlug = (slug: string) => SHOWCASE.find((s) => s.slug === slug) ?? null;
export const SHOWCASE_DISCLOSURE = "Showcase demos made by the Keplar team to show what Create aims for. Not customer sites. Names, prices and dates inside are sample content.";
