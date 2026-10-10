/**
 * Surprise me: a complete, specific app brief with zero input. Industry × audience × signature detail × complexity,
 * plus a style id from the app-builder presets. Specific briefs are what keep output away from generic templates.
 */
export type SurpriseBrief = { prompt: string; style: string; mode: "light" | "dark"; label: string };

const INDUSTRIES = [
  { label: "Night-market food guide", who: "street-food fans in Bangkok", screens: "a stall map list by soi, dish pages with price and spice level, a 'tonight's open' filter and a saved crawl", sig: "a hand-drawn chili scale" },
  { label: "Climbing gym logbook", who: "boulderers at a small community gym", screens: "routes by wall and grade, a send log with attempts, a weekly reset calendar and a setter notes feed", sig: "a grade pyramid that fills as you send" },
  { label: "Vinyl crate tracker", who: "record collectors who dig at fairs", screens: "a collection grid by label, a want list with max price, fair-day checklists and a listening queue", sig: "a spinning label thumbnail on hover" },
  { label: "Community garden plots", who: "a neighborhood allotment association", screens: "plot map list, watering rota, harvest swap board and a seed library loans page", sig: "a season wheel showing what to plant now" },
  { label: "Indie bookstore events", who: "a two-person bookshop", screens: "upcoming readings with RSVPs, staff picks shelf, a pre-order form and a reading club thread", sig: "shelf-talker cards in the owners' handwriting style" },
  { label: "Bike courier dispatch", who: "a cooperative of five couriers", screens: "a live job board, rider status, delivery proof uploads and a weekly earnings ledger", sig: "a route ribbon showing pickup to drop-off" },
  { label: "Ceramics kiln scheduler", who: "a shared pottery studio", screens: "kiln firing slots, glaze test library, member shelves and a firing log with cone temps", sig: "a cone-temperature gauge" },
  { label: "Film photo lab orders", who: "a small analog lab", screens: "drop-off orders with film stock, scan delivery gallery, push/pull notes and a pickup queue", sig: "contact-sheet layouts for scans" },
  { label: "Trail running club", who: "a weekend trail club", screens: "group runs with RSVPs, route library with elevation notes, member PBs and a gear swap", sig: "an elevation strip under each route" },
  { label: "Tea house menu", who: "a quiet tea room", screens: "seasonal tea menu with brewing times, tasting flights, table bookings and a tea journal", sig: "a steep-time timer drawn as a thin arc" },
  { label: "Repair café log", who: "volunteers fixing household items", screens: "intake tickets, fixer skills directory, outcomes ledger and a parts-needed board", sig: "a fixed / not-fixed tally strip" },
  { label: "Sailing school bookings", who: "a dinghy sailing school", screens: "course levels, boat availability, weather-call board and a skills checklist per student", sig: "a wind-direction mark on each session" },
];
const STYLES: { id: string; mode: "light" | "dark" }[] = [
  { id: "editorial", mode: "light" }, { id: "swiss", mode: "light" }, { id: "minimal", mode: "dark" }, { id: "brutalist", mode: "light" },
  { id: "organic", mode: "light" }, { id: "retro", mode: "light" }, { id: "luxury", mode: "dark" }, { id: "dimensional", mode: "dark" },
];
const DEPTH = ["Keep it focused: three core screens done extremely well.", "Medium scope: five screens with accounts and real data.", "Ambitious: six screens, admin tools, and live updates where they matter."];

/** `rand` is injectable for tests; defaults to Math.random. */
export function surpriseBrief(rand: () => number = Math.random): SurpriseBrief {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length) % a.length];
  const ind = pick(INDUSTRIES);
  const st = pick(STYLES);
  const depth = pick(DEPTH);
  const prompt = `${ind.label} for ${ind.who}: ${ind.screens}. Signature detail: ${ind.sig}. ${depth} Make it look hand-crafted by a studio: real copy for this audience, no generic hero-plus-three-cards, no purple glow, no fake testimonials or stats.`;
  return { prompt, style: st.id, mode: st.mode, label: ind.label };
}
