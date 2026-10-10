/**
 * Site brief + discovery. Before generating, Keplar asks a few specific questions (tappable chips + free text, all
 * skippable), then assembles a structured brief the owner can edit and approve. The brief is stored on the site and is
 * the single source of truth the generator works from. Everything here is deterministic and free (no model call), so
 * discovery never spends credits; the build that follows goes through the normal estimate / confirm / cooldown path.
 */
import { DIRECTION_IDS, getDirection, suggestDirections, type DirectionId } from "./design";
import { parseHex } from "./color";
import { productPrompt } from "./product/prompt";
import { normalizeProduct, type ProductInfo } from "./product/types";
import { normalizeRecipe, recipeToPrompt, type Recipe } from "./variation";

export const SITE_KINDS = ["restaurant", "saas", "portfolio", "local-service", "shop", "studio", "wellness", "event", "other"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];
export const KIND_LABEL: Record<SiteKind, string> = {
  restaurant: "Restaurant, cafe or bar",
  saas: "Software or app",
  portfolio: "Portfolio",
  "local-service": "Local service",
  shop: "Shop or product",
  studio: "Studio or agency",
  wellness: "Wellness or health",
  event: "Event or community",
  other: "Something else",
};

export type Motion = "none" | "subtle" | "expressive";

export type SiteBrief = {
  name: string;
  kind: SiteKind;
  idea: string;
  purpose: string;
  audience: string;
  tone: string[];
  goal: string;
  pages: string[];
  sections: string[];
  content: string;
  imagery: string;
  references: string;
  brandNotes: string;
  accent: string | null;
  mode: "auto" | "light" | "dark";
  direction: DirectionId;
  motion: Motion;
  /** An imported product the owner reviewed (from a page link or a photo). Absent for ordinary briefs. */
  product?: ProductInfo;
  /** Structure recipe drawn for this project (layout, navigation, voice, error page...). Absent on briefs from before it existed. */
  recipe?: Recipe;
  /** Mood board: colors read from reference images the owner dropped in (the images themselves are not kept), reference links, notes. */
  mood?: Mood;
};

export type Mood = { colors: string[]; links: string[]; notes: string };

function normalizeMood(v: unknown, base?: Mood): Mood | undefined {
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  const colors = (Array.isArray(o.colors) ? o.colors : []).map((c) => String(c).trim().toLowerCase()).filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 6);
  const links = (Array.isArray(o.links) ? o.links : [])
    .map((l) => String(l).trim().slice(0, 200))
    .filter((l) => /^https?:\/\/[^\s<>"']+$/i.test(l))
    .slice(0, 5);
  const notes = clean(o.notes, 400);
  return colors.length || links.length || notes ? { colors, links, notes } : undefined;
}

export const BRIEF_LIMITS = { name: 60, idea: 1200, short: 300, long: 2400, tone: 5, pages: 8, sections: 10 } as const;

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
const list = (v: unknown, n: number, each = 60) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => clean(x, each)).filter(Boolean).slice(0, n);

/** Detects what kind of site the idea describes. */
export function detectKind(text: string): SiteKind {
  const t = ` ${text.toLowerCase()} `;
  const score = (words: string[]) => words.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
  const table: [SiteKind, string[]][] = [
    ["restaurant", ["restaurant", "cafe", "café", "coffee", "bakery", "bar ", "bistro", "menu", "pizza", "diner", "brunch", "kitchen", "eatery", "catering", "pub ", "tavern", "ramen", "sushi"]],
    ["saas", ["saas", "software", "app ", " app", "platform", "api", "dashboard", "startup", "waitlist", "tool for", "developers", "ai ", "automation", "subscription"]],
    ["portfolio", ["portfolio", "photographer", "illustrator", "designer", "freelance", "my work", "artist", "architect", "filmmaker", "writer", "developer portfolio", "personal site"]],
    ["local-service", ["plumb", "electric", "clean", "landscap", "repair", "mechanic", "salon", "barber", "dentist", "roof", "mover", "handyman", "locksmith", "painter", "contractor", "accountant", "lawyer", "tutor", "pest", "hvac", "garage", "car wash", "taxi", "service"]],
    ["shop", ["shop", "store", "boutique", "sell ", "products", "ecommerce", "e-commerce", "merch", "handmade", "candles", "jewel"]],
    ["studio", ["agency", "studio", "consultancy", "consulting", "creative team", "production company"]],
    ["wellness", ["yoga", "pilates", "therapy", "therapist", "clinic", "wellness", "massage", "physio", "fitness", "gym", "spa", "nutrition", "coach"]],
    ["event", ["event", "festival", "conference", "meetup", "wedding", "community", "nonprofit", "non-profit", "charity", "club", "church"]],
  ];
  const ranked = table.map(([k, w]) => [k, score(w)] as const).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "other";
}

/** A short noun phrase for the thing being built ("your bike repair shop"), used to make questions specific. */
export function subjectOf(idea: string): string {
  const m = /\b(?:for|about)\s+(?:a|an|my|our|the)?\s*([a-z][a-z0-9&' -]{3,48}?)(?:\s+(?:called|named|in|that|which|with|who|where|based)\b|[.,;:\n]|$)/i.exec(idea);
  const phrase = m?.[1]?.trim();
  return phrase && phrase.split(/\s+/).length <= 6 ? phrase : "";
}

export function nameOf(idea: string): string {
  const m = /\b(?:called|named)\s+["“]?([A-Z0-9][\w&'’.-]*(?:\s+[A-Z0-9&][\w&'’.-]*){0,3})/.exec(idea) ?? /^([A-Z][\w&'’.-]*(?:\s+[A-Z&][\w&'’.-]*){0,2})\s+(?:is|are)\b/.exec(idea);
  return clean(m?.[1] ?? "", BRIEF_LIMITS.name);
}

export type Question = {
  id: string;
  /** Brief field this answer fills. */
  field: "purpose" | "audience" | "tone" | "goal" | "pages" | "content" | "imagery" | "references" | "brandNotes";
  text: string;
  help?: string;
  chips: string[];
  /** Pick several chips. */
  multi: boolean;
  placeholder: string;
  /** Free text only (no chips). */
  textOnly?: boolean;
};

const TONES = ["Warm and friendly", "Refined and quiet", "Bold and confident", "Playful", "Precise and technical", "Minimal", "Earthy and handmade", "Premium"];

type Bank = Partial<Record<Question["field"], Omit<Question, "id" | "field">>>;

const BANKS: Record<SiteKind, Bank> = {
  restaurant: {
    goal: { text: "What should a hungry visitor do first?", chips: ["Reserve a table", "See the menu", "Order takeaway", "Find us and hours", "Book catering"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who do you want through the door?", chips: ["Neighborhood regulars", "Date-night couples", "Families", "Office lunch crowd", "Visitors and tourists", "Food lovers"], multi: true, placeholder: "Anyone specific?" },
    tone: { text: "How should it feel?", chips: ["Warm and casual", "Refined and quiet", "Playful", "Rustic and seasonal", "Bold and loud", "Minimal"], multi: true, placeholder: "Describe the vibe in your own words" },
    pages: { text: "Which pages do you need?", chips: ["Menu", "Our story", "Hours and location", "Reservations", "Catering", "Events", "Gallery", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "What is on the menu, and what makes you different? Paste dishes, prices, hours, address.", help: "Only what you give me appears as fact. Anything missing becomes a clearly marked placeholder.", chips: ["I'll add details later"], multi: false, placeholder: "Dishes, prices, hours, address, a line about your story…" },
    imagery: { text: "How should the pictures work?", chips: ["I'll add my own photos", "Graphic shapes, no photos", "Generate images with Keplar later"], multi: false, placeholder: "Notes on imagery" },
  },
  saas: {
    purpose: { text: "In one line: what does it do, and for whom?", chips: [], textOnly: true, multi: false, placeholder: "e.g. Tracks habits for people who keep quitting at week three" },
    goal: { text: "What is the one action visitors should take?", chips: ["Join the waitlist", "Start free", "Book a demo", "Buy now", "Download"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who is it for?", chips: ["Developers", "Small teams", "Enterprise buyers", "Consumers", "Creators", "Operations teams"], multi: true, placeholder: "Be specific if you can" },
    tone: { text: "What should it sound and look like?", chips: ["Precise and technical", "Friendly", "Premium", "Bold and confident", "Calm", "Minimal"], multi: true, placeholder: "Brands you'd compare it to?" },
    pages: { text: "Which pages and sections?", chips: ["Features", "How it works", "Pricing", "FAQ", "Docs link", "Changelog", "About", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "Paste the real features, pricing and proof you have.", help: "I will not invent customers, logos, numbers or testimonials. Gaps become marked placeholders.", chips: ["I'll add details later"], multi: false, placeholder: "Features, plans and prices, integrations, anything true you want shown" },
    imagery: { text: "Visuals?", chips: ["Product screenshots later", "Diagrams and shapes only", "Generate images with Keplar later"], multi: false, placeholder: "Notes on visuals" },
  },
  portfolio: {
    purpose: { text: "What kind of work do you want to show?", chips: ["Design", "Photography", "Illustration", "Architecture", "Software", "Writing", "Film and motion"], multi: true, placeholder: "Tell me more" },
    audience: { text: "Who should be impressed?", chips: ["Clients hiring me", "Studios and agencies", "Galleries", "Employers", "Collaborators"], multi: true, placeholder: "Anyone specific?" },
    goal: { text: "What do you want visitors to do?", chips: ["Get in touch", "Hire me", "Buy prints", "Book a consultation", "Follow my work"], multi: false, placeholder: "Something else?" },
    tone: { text: "What should the site feel like next to your work?", chips: ["Quiet gallery", "Editorial", "Bold and graphic", "Warm and personal", "Technical", "Playful"], multi: true, placeholder: "Describe it" },
    pages: { text: "Which pages?", chips: ["Selected work", "About", "Services", "Process", "Journal", "CV", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "List a few projects (name, year, one line) and a sentence about you.", chips: ["I'll add projects later"], multi: false, placeholder: "Project names, years, clients, your bio…" },
    imagery: { text: "Where do the images come from?", chips: ["I'll add my own work", "Graphic placeholders for now", "Generate images with Keplar later"], multi: false, placeholder: "Notes" },
  },
  "local-service": {
    purpose: { text: "What do you do, and where?", chips: [], textOnly: true, multi: false, placeholder: "e.g. Emergency plumbing across south Austin, 12 years" },
    goal: { text: "How should customers reach you?", chips: ["Call now", "Request a quote", "Book online", "Emergency call-out", "Visit the shop"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who are your customers?", chips: ["Homeowners", "Landlords", "Small businesses", "Families", "Busy professionals", "Older customers"], multi: true, placeholder: "Anyone specific?" },
    tone: { text: "How should you come across?", chips: ["Trustworthy and calm", "Friendly local", "No-nonsense", "Premium", "Modern"], multi: true, placeholder: "Describe it" },
    pages: { text: "What should the site cover?", chips: ["Services", "Prices", "Areas we serve", "About us", "FAQ", "Gallery of work", "Contact and hours"], multi: true, placeholder: "Anything else?" },
    content: { text: "What can you promise? Licenses, years in business, guarantees, price ranges, opening hours, phone.", help: "Only real facts appear. No invented reviews or numbers.", chips: ["I'll add details later"], multi: false, placeholder: "License no., guarantees, prices from, hours, phone…" },
    imagery: { text: "Pictures?", chips: ["I'll add photos of my work", "Graphic shapes, no photos", "Generate images with Keplar later"], multi: false, placeholder: "Notes" },
  },
  shop: {
    purpose: { text: "What do you sell, and what is special about it?", chips: [], textOnly: true, multi: false, placeholder: "e.g. Hand-poured soy candles in refillable glass" },
    goal: { text: "What should a visitor do?", chips: ["Buy online", "Inquire to order", "Visit the store", "Join the mailing list", "Pre-order"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who buys from you?", chips: ["Gift buyers", "Design lovers", "Locals", "Collectors", "Trade and wholesale"], multi: true, placeholder: "Anyone specific?" },
    tone: { text: "What is the brand feel?", chips: ["Handmade and warm", "Minimal", "Luxury", "Playful", "Bold", "Natural"], multi: true, placeholder: "Describe it" },
    pages: { text: "Pages?", chips: ["Collection", "Our story", "Shipping and returns", "Stockists", "FAQ", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "List a few products with prices, and your shipping or returns terms.", chips: ["I'll add products later"], multi: false, placeholder: "Product, price, one line…" },
    imagery: { text: "Product images?", chips: ["I'll add product photos", "Graphic placeholders for now", "Generate images with Keplar later"], multi: false, placeholder: "Notes" },
  },
  studio: {
    purpose: { text: "What does the studio do best?", chips: [], textOnly: true, multi: false, placeholder: "e.g. Brand identity and websites for independent hotels" },
    goal: { text: "What should a prospective client do?", chips: ["Start a project", "Book a call", "See our work", "Download a capabilities deck"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who are your clients?", chips: ["Startups", "Hospitality", "Non-profits", "Established brands", "Individuals"], multi: true, placeholder: "Anyone specific?" },
    tone: { text: "How should the studio feel?", chips: ["Editorial", "Bold and graphic", "Quiet and precise", "Playful", "Technical"], multi: true, placeholder: "Describe it" },
    pages: { text: "Pages?", chips: ["Work", "Services", "Process", "Team", "Journal", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "Name a few projects or clients you can show, plus your approach.", chips: ["I'll add work later"], multi: false, placeholder: "Projects, services, approach…" },
    imagery: { text: "Imagery?", chips: ["I'll add project images", "Graphic placeholders for now", "Generate images with Keplar later"], multi: false, placeholder: "Notes" },
  },
  wellness: {
    purpose: { text: "What do you offer, and what changes for people?", chips: [], textOnly: true, multi: false, placeholder: "e.g. Small-group reformer pilates for back pain" },
    goal: { text: "What should visitors do?", chips: ["Book a class", "Book a consultation", "Call us", "See the timetable", "Join the newsletter"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who do you help?", chips: ["Beginners", "Athletes", "Older adults", "Busy professionals", "New parents"], multi: true, placeholder: "Anyone specific?" },
    tone: { text: "How should it feel?", chips: ["Calm and grounded", "Warm and encouraging", "Clinical and trusted", "Energetic", "Minimal"], multi: true, placeholder: "Describe it" },
    pages: { text: "Pages?", chips: ["Services", "Timetable", "Prices", "About the team", "FAQ", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "Share qualifications, prices, session lengths and hours.", help: "No medical claims or guarantees will be written unless you supply them.", chips: ["I'll add details later"], multi: false, placeholder: "Qualifications, prices, hours…" },
    imagery: { text: "Imagery?", chips: ["I'll add photos", "Graphic shapes, no photos", "Generate images with Keplar later"], multi: false, placeholder: "Notes" },
  },
  event: {
    purpose: { text: "What is happening, when and where?", chips: [], textOnly: true, multi: false, placeholder: "e.g. Riverside Makers Fair, 14 June, Dock Street Market" },
    goal: { text: "What should visitors do?", chips: ["Get tickets", "Register", "Volunteer", "Donate", "Find the schedule"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who is it for?", chips: ["Locals", "Families", "Industry peers", "Members", "Supporters"], multi: true, placeholder: "Anyone specific?" },
    tone: { text: "What is the mood?", chips: ["Festive", "Professional", "Community and warm", "Bold", "Calm"], multi: true, placeholder: "Describe it" },
    pages: { text: "Pages?", chips: ["Schedule", "Speakers or lineup", "Venue and travel", "Tickets", "FAQ", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "Paste dates, times, venue, ticket info and the lineup.", chips: ["I'll add details later"], multi: false, placeholder: "Dates, venue, ticket link, lineup…" },
    imagery: { text: "Imagery?", chips: ["I'll add photos", "Graphic shapes, no photos", "Generate images with Keplar later"], multi: false, placeholder: "Notes" },
  },
  other: {
    purpose: { text: "What is this site for, in a sentence?", chips: [], textOnly: true, multi: false, placeholder: "What it is, and what visitors get from it" },
    goal: { text: "What is the main thing visitors should do?", chips: ["Contact me", "Buy something", "Sign up", "Read and learn", "Visit in person"], multi: false, placeholder: "Something else?" },
    audience: { text: "Who is it for?", chips: ["Customers", "Clients", "Members", "The public", "Press and partners"], multi: true, placeholder: "Be specific if you can" },
    tone: { text: "How should it feel?", chips: TONES.slice(0, 6), multi: true, placeholder: "Describe it" },
    pages: { text: "Which pages do you need?", chips: ["About", "Services", "Gallery", "FAQ", "Contact"], multi: true, placeholder: "Anything else?" },
    content: { text: "Paste any real details to include: offers, prices, hours, address, facts.", chips: ["I'll add details later"], multi: false, placeholder: "Anything true you want on the site" },
    imagery: { text: "Imagery?", chips: ["I'll add my own photos", "Graphic shapes, no photos", "Generate images with Keplar later"], multi: false, placeholder: "Notes" },
  },
};

const ORDER: Question["field"][] = ["purpose", "goal", "audience", "tone", "pages", "content", "imagery", "references"];

/**
 * 3 to 6 questions for an idea, most useful first. A long, detailed idea needs fewer. Purpose is only asked when the idea
 * is too short to say what the thing is.
 */
export function planQuestions(idea: string, kind: SiteKind = detectKind(idea), product?: ProductInfo | null): Question[] {
  if (product) return productQuestions(product);
  const bank = BANKS[kind];
  const words = idea.trim().split(/\s+/).filter(Boolean).length;
  const detailed = words >= 45;
  const chosen: Question["field"][] = [];
  if (words < 10 && bank.purpose) chosen.push("purpose");
  chosen.push("goal", "audience", "tone");
  if (!detailed) chosen.push("pages", "content");
  if (detailed) chosen.push("imagery");
  else if (chosen.length < 6) chosen.push("imagery");
  const uniq = [...new Set(chosen)].slice(0, 6);
  const out: Question[] = [];
  for (const f of ORDER) {
    if (!uniq.includes(f)) continue;
    const q = bank[f] ?? BANKS.other[f];
    if (!q) continue;
    out.push({ id: f, field: f, ...q });
  }
  if (out.length < 3) {
    for (const f of ["goal", "audience", "tone"] as const) if (!out.some((q) => q.field === f)) out.push({ id: f, field: f, ...(BANKS.other[f] as Omit<Question, "id" | "field">) });
  }
  return out.slice(0, 6);
}

/**
 * With an imported product the facts are already known, so the questions are about the page, not the product: what visitors
 * should do (the first chip follows the Buy setting chosen in the card), who it is for, the feel, the pages, and how the
 * photos are used.
 */
function productQuestions(p: ProductInfo): Question[] {
  const label = (p.name || "this product").slice(0, 60);
  const goalChips = p.buy === "link" && p.buyUrl ? ["Buy on the original product page", "Send an inquiry", "Join the newsletter"] : p.buy === "contact" ? ["Send an inquiry", "Buy now (I'll add a checkout link)", "Join the newsletter"] : ["Buy now (I'll add a checkout link)", "Send an inquiry", "Join the newsletter"];
  return [
    { id: "goal", field: "goal", text: `What should visitors do on the page for ${label}?`, help: "The Buy button follows the choice you made in the Imported product card.", chips: goalChips, multi: false, placeholder: "Something else?" },
    { id: "audience", field: "audience", text: `Who is ${label} for?`, chips: ["Everyday customers", "Gift buyers", "Enthusiasts", "Professionals", "Existing customers"], multi: true, placeholder: "Anyone specific?" },
    { id: "tone", field: "tone", text: "How should the page feel?", chips: ["Premium", "Minimal", "Warm and friendly", "Bold and confident", "Playful", "Precise and technical"], multi: true, placeholder: "Describe the vibe in your own words" },
    { id: "pages", field: "pages", text: "Which pages besides the product page?", chips: ["Our story", "FAQ", "Shipping and returns", "Contact"], multi: true, placeholder: "Anything else?" },
    { id: "imagery", field: "imagery", text: "How should your photos be used?", help: "You choose which photos and the hero in the Imported product card. They are shown at their original quality.", chips: p.images.length > 1 ? ["Big hero photo plus a gallery", "Hero photo only", "Photos large throughout"] : ["Big hero photo", "Photo beside the text"], multi: false, placeholder: "Anything else about the photos?" },
  ];
}

export type Answer = { chips?: string[]; text?: string; skipped?: boolean };
export type Answers = Record<string, Answer>;

const DEFAULT_PAGES: Record<SiteKind, string[]> = {
  restaurant: ["Home", "Menu", "Visit"],
  saas: ["Home", "Pricing", "Contact"],
  portfolio: ["Work", "About", "Contact"],
  "local-service": ["Home", "Services", "Contact"],
  shop: ["Home", "Collection", "Contact"],
  studio: ["Work", "Services", "Contact"],
  wellness: ["Home", "Services", "Contact"],
  event: ["Home", "Schedule", "Contact"],
  other: ["Home", "About", "Contact"],
};

const PAGE_CHIP_TO_NAME: Record<string, string> = {
  "our story": "About", "hours and location": "Visit", "find us and hours": "Visit", "reservations": "Reserve", "areas we serve": "Areas", "about us": "About", "about the team": "Team",
  "contact and hours": "Contact", "selected work": "Work", "gallery of work": "Gallery", "venue and travel": "Venue", "speakers or lineup": "Lineup", "shipping and returns": "Shipping", "docs link": "Docs", "how it works": "How it works",
};

export function pageNamesFrom(chips: string[], kind: SiteKind, max = BRIEF_LIMITS.pages): string[] {
  const home = DEFAULT_PAGES[kind][0];
  const names = chips.map((c) => PAGE_CHIP_TO_NAME[c.toLowerCase()] ?? c).map((c) => clean(c, 24)).filter(Boolean);
  const set = [home, ...names.filter((n) => n.toLowerCase() !== home.toLowerCase())];
  if (!set.some((n) => /contact|visit|reserve/i.test(n))) set.push("Contact");
  return [...new Set(set)].slice(0, max);
}

const joinAnswer = (a?: Answer) => [...(a?.chips ?? []), a?.text ?? ""].map((x) => x.trim()).filter(Boolean).join(". ");

/** Builds a first brief from the idea and whatever the owner answered. Skipped or missing answers fall back to sensible defaults. */
export function buildBrief(idea: string, answers: Answers = {}, opts: { name?: string; kind?: SiteKind; product?: ProductInfo | null } = {}): SiteBrief {
  const product = opts.product ?? null;
  const cleanIdea = clean(idea, BRIEF_LIMITS.idea);
  const kind = product ? "shop" : opts.kind ?? detectKind(cleanIdea);
  const name = clean(opts.name || (product ? product.brand || product.name : "") || nameOf(cleanIdea), BRIEF_LIMITS.name) || (subjectOf(cleanIdea) ? subjectOf(cleanIdea).replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40) : "My site");
  const get = (k: Question["field"]) => answers[k];
  const toneChips = (get("tone")?.chips ?? []).concat(get("tone")?.text ? [clean(get("tone")!.text, 80)] : []).slice(0, BRIEF_LIMITS.tone);
  const pagesChips = get("pages")?.chips ?? [];
  const pages = pageNamesFrom([...pagesChips, ...list(get("pages")?.text, 6, 24)], kind);
  const imageryRaw = joinAnswer(get("imagery"));
  const generated = /generate images/i.test(imageryRaw);
  const dir = suggestDirections(kind)[0];
  const tone = toneChips.length ? toneChips : [];
  const text = (f: Question["field"]) => clean(joinAnswer(get(f)), f === "content" ? BRIEF_LIMITS.long : BRIEF_LIMITS.short);
  const contentText = text("content");
  const productPurpose = product ? clean(`A one-product page for ${product.name || "the product"}${product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase()) ? ` by ${product.brand}` : ""}${product.description ? `: ${product.description}` : ""}`, BRIEF_LIMITS.short) : "";
  const brief: SiteBrief = {
    name,
    kind,
    idea: cleanIdea,
    purpose: text("purpose") || productPurpose || cleanIdea.slice(0, BRIEF_LIMITS.short),
    audience: text("audience"),
    tone,
    goal: text("goal") || (product ? (product.buy === "link" && product.buyUrl ? "Buy on the original product page" : product.buy === "contact" ? "Send an inquiry" : "Buy now") : ""),
    pages,
    sections: [],
    content: /^i'll add (details|products|projects|work) later$/i.test(contentText) ? "" : contentText,
    imagery: imageryRaw ? imageryRaw.slice(0, 200) : "Graphic shapes and typography; leave clearly marked image placeholders where photos belong",
    references: text("references"),
    brandNotes: text("brandNotes"),
    accent: null,
    mode: "auto",
    direction: pickDirection(kind, tone, dir.id),
    motion: generated ? "subtle" : "subtle",
  };
  if (product) {
    brief.product = product;
    brief.imagery = imageryRaw ? imageryRaw.slice(0, 200) : product.images.length ? "The owner's own product photos, large, at their natural proportions" : "No photos yet; marked placeholder where the product photo belongs";
  }
  return brief;
}

/** Chooses a style direction from the tone words, falling back to the best match for the kind. */
export function pickDirection(kind: SiteKind, tone: string[], fallback?: DirectionId): DirectionId {
  const t = tone.join(" ").toLowerCase();
  const rules: [RegExp, DirectionId][] = [
    [/refined|quiet gallery|luxury|premium|elegant|upscale/, "noir"],
    [/editorial|magazine|literary/, "editorial"],
    [/technical|precise|developer|engineer/, "technical"],
    [/bold|loud|raw|graphic|punk|brutal/, "raw"],
    [/earthy|handmade|rustic|seasonal|natural|organic|calm and grounded/, "organic"],
    [/warm|friendly|local|playful|cozy|casual/, kind === "local-service" || kind === "wellness" ? "clear" : "craft"],
    [/trust|clinical|calm|no-nonsense|professional/, "clear"],
    [/minimal|swiss|modern|clean/, "swiss"],
  ];
  for (const [re, id] of rules) if (re.test(t)) return id;
  return fallback ?? suggestDirections(kind)[0].id;
}

/** Validates a brief coming from the client; returns a safe, bounded brief. */
export function normalizeBrief(input: unknown, base?: Partial<SiteBrief>): SiteBrief {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind = (SITE_KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as SiteKind) : base?.kind ?? "other";
  const dir = DIRECTION_IDS.includes(o.direction as DirectionId) ? (o.direction as DirectionId) : base?.direction ?? suggestDirections(kind)[0].id;
  const accentRaw = typeof o.accent === "string" ? o.accent.trim() : "";
  const accent = accentRaw && parseHex(accentRaw) ? (accentRaw.startsWith("#") ? accentRaw.toLowerCase() : `#${accentRaw.toLowerCase()}`) : null;
  const motion = o.motion === "none" || o.motion === "subtle" || o.motion === "expressive" ? o.motion : base?.motion ?? "subtle";
  const mode = o.mode === "light" || o.mode === "dark" || o.mode === "auto" ? o.mode : base?.mode ?? "auto";
  const pages = list(o.pages, BRIEF_LIMITS.pages, 24);
  const product = normalizeProduct(o.product ?? base?.product, base?.product ?? null);
  const brief: SiteBrief = {
    name: clean(o.name ?? base?.name, BRIEF_LIMITS.name) || "My site",
    kind,
    idea: clean(o.idea ?? base?.idea, BRIEF_LIMITS.idea),
    purpose: clean(o.purpose ?? base?.purpose, BRIEF_LIMITS.short),
    audience: clean(o.audience ?? base?.audience, BRIEF_LIMITS.short),
    tone: list(o.tone ?? base?.tone, BRIEF_LIMITS.tone, 40),
    goal: clean(o.goal ?? base?.goal, 120),
    pages: pages.length ? pages : DEFAULT_PAGES[kind],
    sections: list(o.sections ?? base?.sections, BRIEF_LIMITS.sections, 40),
    content: clean(o.content ?? base?.content, BRIEF_LIMITS.long),
    imagery: clean(o.imagery ?? base?.imagery, 200),
    references: clean(o.references ?? base?.references, BRIEF_LIMITS.short),
    brandNotes: clean(o.brandNotes ?? base?.brandNotes, BRIEF_LIMITS.short),
    accent,
    mode,
    direction: dir,
    motion,
  };
  if (product) brief.product = product;
  const recipe = normalizeRecipe(o.recipe, base?.recipe ?? null);
  if (recipe) brief.recipe = recipe;
  const mood = normalizeMood(o.mood, base?.mood);
  if (mood) brief.mood = mood;
  return brief;
}

export const pageFile = (name: string, index: number) => (index === 0 ? "index.html" : `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || `page-${index + 1}`}.html`);

/** Page names to file names, home first. */
export function pageFiles(pages: string[], maxPages: number): { name: string; file: string }[] {
  const seen = new Set<string>();
  const out: { name: string; file: string }[] = [];
  pages.slice(0, maxPages).forEach((name, i) => {
    let file = pageFile(name, i);
    let n = 2;
    while (seen.has(file)) file = file.replace(/(-\d+)?\.html$/, `-${n++}.html`);
    seen.add(file);
    out.push({ name, file });
  });
  return out;
}

/** The brief as the text the generator reads. */
export function briefToPrompt(b: SiteBrief, maxPages: number): string {
  const dir = getDirection(b.direction);
  const files = pageFiles(b.pages, maxPages);
  const lines = [
    `Name: ${b.name}`,
    `Type: ${KIND_LABEL[b.kind]}`,
    `What it is: ${b.purpose || b.idea}`,
    b.idea && b.idea !== b.purpose ? `Owner's own words: ${b.idea}` : "",
    `Primary action visitors should take: ${b.goal || "get in touch"}`,
    `Audience: ${b.audience || "not specified; write for a general but specific-minded visitor"}`,
    `Tone: ${b.tone.length ? b.tone.join(", ") : "not specified; choose what suits the direction"}`,
    `Pages (file: name): ${files.map((f) => `${f.file}: ${f.name}`).join("; ")}`,
    b.sections.length ? `Sections wanted on the home page, in order: ${b.sections.join(", ")}` : "",
    `Imagery: ${b.imagery || "graphic shapes and type; marked placeholders where photos belong"}`,
    b.references ? `Style references the owner likes: ${b.references}` : "",
    b.brandNotes ? `Brand notes: ${b.brandNotes}` : "",
    `Style direction: ${dir.name}. ${dir.character}`,
    b.mood?.colors.length ? `Mood board colors the owner collected (inspiration for the accent and surfaces; keep contrast rules): ${b.mood.colors.join(", ")}` : "",
    b.mood?.links.length ? `Reference sites the owner likes (links only; you cannot open them, do not copy any design): ${b.mood.links.join(" ")}` : "",
    b.mood?.notes ? `Mood notes: ${b.mood.notes}` : "",
    `Motion: ${b.motion === "none" ? "none" : b.motion === "subtle" ? "subtle (one hero scene and a few reveals)" : "expressive (hero scene, reveals, parallax on key figures)"}`,
  ].filter(Boolean);
  const hasProduct = Boolean(b.product);
  const content = b.content ? `\n\nOWNER-PROVIDED CONTENT (use verbatim where it fits; this is the ONLY source of facts, prices, hours, addresses, names, numbers, awards and quotes):\n${b.content}` : hasProduct ? "\n\nNo other facts were provided beyond the product below. Do not invent prices, hours, addresses, phone numbers, names, numbers, awards, reviews or customers; mark every other missing fact with a placeholder <span class=\"k-todo\">[Add: ...]</span>." : "\n\nNo facts were provided. Do not invent any prices, hours, addresses, phone numbers, names, numbers, awards, reviews or customers. Write real, specific copy about what the thing is and does, and put every missing fact in a marked placeholder <span class=\"k-todo\">[Add: opening hours]</span>.";
  return lines.join("\n") + (b.recipe ? `\n\n${recipeToPrompt(b.recipe)}` : "") + content + (b.product ? productPrompt(b.product) : "");
}
