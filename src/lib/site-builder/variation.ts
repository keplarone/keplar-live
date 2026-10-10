/**
 * Structural variation. Vibe-coded sites look alike because they share one layout engine, one class vocabulary, one section order,
 * one error page and one asset recipe. Keplar's design directions vary type, color and mood; this module varies the STRUCTURE:
 * layout system, navigation pattern, section order, component vocabulary, copy voice, motion language, error page, image handling
 * and title format. A recipe is drawn per project from the brief (kind, tone, direction) and a seed, avoids what recent builds
 * used, is stored on the brief so edits stay coherent, and is shown to the owner for approval. Pure and deterministic given a seed.
 */
import type { DirectionId } from "./design";

export type Opt = { id: string; name: string; text: string; fits?: string[]; not?: string[] };

export const LAYOUTS: Opt[] = [
  { id: "index-rows", name: "Index rows", text: "Content is an editorial index: wide label | content rows separated by hairlines, numbered, almost no boxes. The hero is a single oversized statement set flush left. Pages read like a table of contents that opens up." },
  { id: "split-pinned", name: "Pinned split", text: "Desktop is a two-column composition: a narrow pinned column (name, one-line pitch, primary action) beside a long scrolling column of sections. On phones the pinned column becomes the top block." },
  { id: "poster-stack", name: "Poster stack", text: "Each section is a full-width poster: one huge line of type, one small supporting paragraph, one action. Sections alternate background (bg / bg-2 / inverse) and never repeat a composition." },
  { id: "ledger", name: "Ledger", text: "A spec-sheet structure: a thin key/value ledger (definition lists, aligned columns, tabular figures) carries the facts; prose is short. Looks like a well-set catalog entry." },
  { id: "horizontal-rails", name: "Rails", text: "Sections are introduced by a long horizontal rule with a label on it; content hangs below in an asymmetric 12-column placement (.k-at-*), with large intentional empty areas." },
  { id: "column-gutter", name: "Margin notes", text: "A wide main column with a narrow margin column for notes, captions, dates and small facts (like a printed essay with marginalia). Headlines span both columns." },
  { id: "tiles-offset", name: "Offset blocks", text: "Blocks of different sizes sit on a loose grid with deliberate offsets (one tall, one wide, one small), borders instead of shadows, no equal-height rows." },
  { id: "timeline", name: "Timeline", text: "The home page is a vertical sequence read top to bottom with a thin vertical line and time/step markers (steps, stages, a day, a process). Only real steps from the brief; never invented history." },
];

export const NAVS: Opt[] = [
  { id: "top-bar", name: "Top bar", text: "A slim top bar: name left, links right, one accent action last." },
  { id: "centered-mast", name: "Centered masthead", text: "A centered masthead: the name large and centered, links in a single quiet row beneath it, a hairline under both." },
  { id: "side-rail", name: "Side rail", text: "On desktop the navigation is a fixed narrow rail down the left side (name on top, links stacked); on phones it becomes a top bar with wrapped links. Pure CSS, no script." },
  { id: "footer-index", name: "Index in the footer", text: "A very small header (name and one link). The full page index lives in a big footer index and in a 'Contents' list at the top of the home page." },
  { id: "split-bar", name: "Split bar", text: "Links split around the name: half on the left, half on the right of a centered name. Wraps to two rows on phones." },
  { id: "numbered", name: "Numbered links", text: "Navigation links are numbered (01 Work, 02 About, 03 Contact) in the mono face, left aligned under the name." },
];

export const ORDERS: Opt[] = [
  { id: "claim-first", name: "Claim, proof, detail, action", text: "Home order: one-sentence claim, the single most concrete proof the owner supplied (or a marked placeholder), the detail rows, then the action." },
  { id: "action-first", name: "Action first", text: "Home order: the primary action and the practical facts (hours, price, address if supplied) in the first screen, then the story, then the detail." },
  { id: "story-first", name: "Story first", text: "Home order: a short narrative of what it is and why, then what you can get, then how to take part. The action appears twice, quietly, not as a banner." },
  { id: "catalog-first", name: "Catalog first", text: "Home order: straight into the list of things offered (menu, services, work, products), with a short framing line above it, then who and where, then the action." },
  { id: "question-first", name: "Question first", text: "Home order: open with the visitor's question or problem in their words, answer it plainly, then show what is on offer, then the action." },
  { id: "inverted", name: "Inverted", text: "Home order: contact and practical information first, then what is offered, then the story last. For people who arrive with intent." },
];

export const VOICES: Opt[] = [
  { id: "dry", name: "Dry and exact", text: "Dry, exact, a little wry. Short declaratives. No exclamation marks. Nouns over adjectives." },
  { id: "warm", name: "Warm and spoken", text: "Warm and spoken, like a neighbor explaining. First person plural. Contractions are fine. One light joke at most." },
  { id: "terse", name: "Terse", text: "Terse. Fragments allowed. Headlines under five words. Everything earns its place." },
  { id: "ceremonial", name: "Measured and formal", text: "Measured, a little formal, unhurried; long sentences are fine if they are clear. No slang." },
  { id: "playful", name: "Playful", text: "Playful and lightly irreverent but still specific; wordplay in headings only, never in instructions or prices." },
  { id: "plain", name: "Plain service", text: "Plain-spoken service language: what you do, how it works, what to do next. Questions answered the way the owner would on the phone." },
  { id: "literary", name: "Literary", text: "Quiet and observational, with concrete sensory details taken only from the owner's words. Never invented anecdotes." },
];

export const MOTIONS: Opt[] = [
  { id: "stillness", name: "Stillness", text: "Almost no motion: headings and figures simply appear; hover states are underlines and color shifts." },
  { id: "slow-reveal", name: "Slow reveal", text: "Slow upward reveals with long easing (0.9s), one reveal per block, a lot of time between them." },
  { id: "snap", name: "Snap", text: "Quick, mechanical, no easing: hard cuts on hover (invert colors), no reveals except the hero." },
  { id: "drift", name: "Drift", text: "Gentle parallax drift on two large figures and a slow field behind the hero; text stays still." },
  { id: "marquee", name: "Ticker", text: "One slow CSS marquee strip of real words from the brief (service names, dishes, places), paused for reduced motion; everything else still." },
];

export const ERRORS: Opt[] = [
  { id: "plain-note", name: "Plain note", text: "404.html: a plain typographic note in the site's voice: what happened in one sentence, then the page list as links. No illustration." },
  { id: "huge-404", name: "Oversized number", text: "404.html: an oversized '404' in the display face cropped by the viewport, one line of text, and a link home." },
  { id: "index-card", name: "Index card", text: "404.html: styled like a library index card or ticket with a drawn border; the missing path described in the site's voice; links to each page." },
  { id: "directory", name: "Directory", text: "404.html: a full directory of the site's pages as a numbered list, with a short line explaining the page isn't here." },
];

export const IMAGES: Opt[] = [
  { id: "ratio-mix", name: "Mixed ratios", text: "Images use varied intentional ratios (one 3:4, one 16:9, one square), never the same crop three times; captions in the mono face." },
  { id: "full-bleed", name: "Full bleed", text: "Few images, each full-bleed or edge to edge, with text overlapping only where contrast is guaranteed by a flat panel." },
  { id: "framed", name: "Framed plates", text: "Images sit in thin-bordered plates with a numbered caption, like museum plates. Generous mat around each." },
  { id: "contact-sheet", name: "Contact sheet", text: "Images in a tight contact-sheet grid of small uneven frames with captions, plus one large lead image." },
  { id: "type-led", name: "Type-led", text: "Mostly typographic: images are optional, supporting, and small. Where a photo is missing use the .k-art geometric field or a typographic panel, never a stock look." },
];

export const TITLES: Opt[] = [
  { id: "name-only", name: "Name", text: "Page titles read '<Page> · <Name>'." },
  { id: "claim-name", name: "Claim | Name", text: "The home title is a short plain claim followed by ' | <Name>'; other pages '<Page> | <Name>'." },
  { id: "name-dash", name: "Name – claim", text: "Titles read '<Name> – <what it is>' on the home page and '<Page> – <Name>' elsewhere." },
];

export const FONT_DISPLAY = ["swap", "optional", "fallback"] as const;
export type FontDisplay = (typeof FONT_DISPLAY)[number];

const VOCAB: { id: string; prefix: string; words: string[] }[] = [
  { id: "atelier", prefix: "at", words: ["plate", "sheet", "atelier", "proof", "swatch", "folio"] },
  { id: "kitchen", prefix: "kt", words: ["course", "pass", "ticket", "board", "service", "order"] },
  { id: "workshop", prefix: "wk", words: ["bench", "part", "spec", "tool", "run", "batch"] },
  { id: "press", prefix: "pr", words: ["column", "spread", "byline", "folio", "dek", "masthead"] },
  { id: "field", prefix: "fd", words: ["plot", "trail", "marker", "survey", "ridge", "ledger"] },
  { id: "studio", prefix: "sd", words: ["reel", "cue", "take", "frame", "slate", "cut"] },
  { id: "market", prefix: "mk", words: ["stall", "crate", "tag", "scale", "aisle", "lot"] },
  { id: "signal", prefix: "sg", words: ["channel", "node", "trace", "pulse", "band", "gain"] },
];

export type Recipe = {
  seed: string;
  layout: string;
  nav: string;
  order: string;
  voice: string;
  motion: string;
  error: string;
  images: string;
  title: string;
  vocab: string;
  fontDisplay: FontDisplay;
};

const LIBS: Record<Exclude<keyof Recipe, "seed" | "fontDisplay" | "vocab">, Opt[]> = { layout: LAYOUTS, nav: NAVS, order: ORDERS, voice: VOICES, motion: MOTIONS, error: ERRORS, images: IMAGES, title: TITLES };

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash32(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Style hints: some pairings clash with a direction's character, so the recipe leans away from them. */
const DIRECTION_LEAN: Partial<Record<DirectionId, { layout?: string[]; motion?: string[] }>> = {
  editorial: { layout: ["column-gutter", "index-rows", "horizontal-rails"] },
  swiss: { layout: ["ledger", "horizontal-rails", "index-rows"] },
  noir: { layout: ["poster-stack", "split-pinned"], motion: ["slow-reveal", "stillness"] },
  organic: { layout: ["timeline", "tiles-offset", "split-pinned"] },
  technical: { layout: ["ledger", "split-pinned", "timeline"] },
  raw: { layout: ["poster-stack", "tiles-offset"], motion: ["snap", "marquee"] },
  craft: { layout: ["tiles-offset", "timeline", "column-gutter"] },
  clear: { layout: ["split-pinned", "ledger", "index-rows"] },
};

function pickFrom(key: string, opts: Opt[], r: () => number, kind: string, avoid: Set<string>, lean?: string[]): Opt {
  const fit = opts.filter((o) => (!o.fits || o.fits.includes(kind)) && !(o.not ?? []).includes(kind));
  const pool = fit.length ? fit : opts;
  const weighted = pool.map((o) => ({ o, w: (avoid.has(`${key}:${o.id}`) ? 0.15 : 1) * (lean?.includes(o.id) ? 2.2 : 1) }));
  const total = weighted.reduce((a, x) => a + x.w, 0);
  let x = r() * total;
  for (const w of weighted) {
    x -= w.w;
    if (x <= 0) return w.o;
  }
  return weighted[weighted.length - 1].o;
}

/**
 * Draws a recipe. `avoid` holds option ids that recent builds used (from the fingerprint library) so a new project is steered
 * away from them; `fixed` pins choices the owner already made.
 */
export function makeRecipe(opts: { seed: string; kind: string; direction: DirectionId; tone?: string[]; avoid?: string[]; fixed?: Partial<Recipe> }): Recipe {
  const r = rng(`${opts.seed}|${opts.kind}|${opts.direction}`);
  const avoid = new Set(opts.avoid ?? []);
  const lean = DIRECTION_LEAN[opts.direction];
  const tone = (opts.tone ?? []).join(" ").toLowerCase();
  const pick = (key: keyof typeof LIBS, l?: string[]) => pickFrom(key, LIBS[key], r, opts.kind, avoid, l).id;
  const voiceLean = /warm|friendly|casual|local|cozy/.test(tone) ? ["warm", "plain"] : /precise|technical|minimal/.test(tone) ? ["dry", "terse"] : /refined|premium|quiet|elegant/.test(tone) ? ["ceremonial", "literary"] : /playful|bold|loud/.test(tone) ? ["playful", "terse"] : undefined;
  const vocab = VOCAB[Math.floor(r() * VOCAB.length)].id;
  const fdRoll = r();
  const fd: FontDisplay = fdRoll < 0.6 ? "swap" : fdRoll < 0.85 ? "optional" : "fallback";
  const out: Recipe = {
    seed: opts.seed,
    layout: pick("layout", lean?.layout),
    nav: pick("nav"),
    order: pick("order"),
    voice: pick("voice", voiceLean),
    motion: pick("motion", lean?.motion),
    error: pick("error"),
    images: pick("images"),
    title: pick("title"),
    vocab,
    fontDisplay: fd,
  };
  return { ...out, ...cleanRecipe({ ...opts.fixed }) };
}

const byId = (opts: Opt[], id: unknown) => opts.find((o) => o.id === id);

/** Validates a recipe from the client or storage: only known ids survive; anything else falls back to `base`. */
export function cleanRecipe(input: unknown, base?: Recipe | null): Partial<Recipe> {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Partial<Recipe> = {};
  for (const k of Object.keys(LIBS) as (keyof typeof LIBS)[]) {
    const v = byId(LIBS[k], o[k]);
    if (v) out[k] = v.id;
    else if (base) out[k] = base[k];
  }
  const vocab = VOCAB.find((v) => v.id === o.vocab);
  if (vocab) out.vocab = vocab.id;
  else if (base) out.vocab = base.vocab;
  if (FONT_DISPLAY.includes(o.fontDisplay as FontDisplay)) out.fontDisplay = o.fontDisplay as FontDisplay;
  else if (base) out.fontDisplay = base.fontDisplay;
  if (typeof o.seed === "string" && o.seed) out.seed = o.seed.slice(0, 40);
  else if (base) out.seed = base.seed;
  return out;
}

export function normalizeRecipe(input: unknown, base?: Recipe | null): Recipe | undefined {
  if (!input || typeof input !== "object") return base ?? undefined;
  const c = cleanRecipe(input, base);
  const need: (keyof Recipe)[] = ["seed", "layout", "nav", "order", "voice", "motion", "error", "images", "title", "vocab", "fontDisplay"];
  return need.every((k) => c[k] !== undefined) ? (c as Recipe) : base ?? undefined;
}

export const optName = (key: keyof typeof LIBS, id: string) => byId(LIBS[key], id)?.name ?? id;
export const vocabOf = (id: string) => VOCAB.find((v) => v.id === id) ?? VOCAB[0];

/** The few lines a person reads to approve the structure. */
export function recipeSummary(r: Recipe): { label: string; value: string }[] {
  return [
    { label: "Layout", value: optName("layout", r.layout) },
    { label: "Navigation", value: optName("nav", r.nav) },
    { label: "Section order", value: optName("order", r.order) },
    { label: "Copy voice", value: optName("voice", r.voice) },
    { label: "Motion", value: optName("motion", r.motion) },
    { label: "Images", value: optName("images", r.images) },
    { label: "404 page", value: optName("error", r.error) },
  ];
}

/** The text the generator reads. Everything here is an instruction about structure, never about facts. */
export function recipeToPrompt(r: Recipe): string {
  const v = vocabOf(r.vocab);
  return [
    "STRUCTURE RECIPE (specific to this project; follow it so this site does not look like any other Keplar site):",
    `- Layout system, ${optName("layout", r.layout)}: ${byId(LAYOUTS, r.layout)?.text}`,
    `- Navigation, ${optName("nav", r.nav)}: ${byId(NAVS, r.nav)?.text}`,
    `- ${byId(ORDERS, r.order)?.text}`,
    `- Copy voice, ${optName("voice", r.voice)}: ${byId(VOICES, r.voice)?.text}`,
    `- Motion language, ${optName("motion", r.motion)}: ${byId(MOTIONS, r.motion)?.text}`,
    `- Images, ${optName("images", r.images)}: ${byId(IMAGES, r.images)?.text}`,
    `- ${byId(TITLES, r.title)?.text}`,
    `- Component vocabulary: name your own components with the prefix "${v.prefix}-" and words from this project's world (${v.words.join(", ")}), e.g. .${v.prefix}-${v.words[0]}, .${v.prefix}-${v.words[1]}. Do not invent new generic names such as "card", "feature", "cta", "testimonial" or "hero-content". The k-* primitives are only a thin base.`,
    `- ${byId(ERRORS, r.error)?.text} Always include the file 404.html (it does not count toward the page budget) with the shared header and footer.`,
    "- Vary compositions: no two sections on a page share the same structure, never a row of three equal cards, never a centered hero followed by three feature boxes and a closing call-to-action band.",
  ].join("\n");
}

/** Option ids as a flat list, for the fingerprint library ("recent builds used these"). */
export const recipeTokens = (r: Recipe) => [`layout:${r.layout}`, `nav:${r.nav}`, `order:${r.order}`, `voice:${r.voice}`, `motion:${r.motion}`, `error:${r.error}`, `images:${r.images}`, `title:${r.title}`, `vocab:${r.vocab}`];

export const newSeed = () => Math.random().toString(36).slice(2, 10);
