import { FACT_SECTIONS, BUSINESS_FACTS, WHAT_IS_KEPLAR, factStatus, type FactSection } from "@/lib/content/product-facts";
import { productFacts } from "./understand";

/**
 * Keplar's knowledge of its own product, for questions about Keplar itself ("can you build a website?", "how do I use you in
 * Roblox Studio?", "do you have an API?"). The facts come from src/lib/content/product-facts.ts, the same sheet behind
 * /what-is-keplar and llms.txt, so the answer engine and the website say the same thing and a status changes in one place.
 *
 * Only questions about Keplar get it (it is a few thousand characters sent to every model on the panel): a one-line index of
 * every feature with its status, plans and page, plus the full description of the sections the question touches.
 */

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/** Words that tie a feature section to a question. */
const SECTION_WORDS: Record<string, RegExp> = {
  engine: /\b(models?|engine|disagree\w*|consensus|deep research|research|reason mode|debate|voice|talk|demo|shared answers?|web search|sources?)\b/,
  files: /\b(files?|pdfs?|images?|screenshots?|photos?|videos?|documents?|docs?|word|excel|powerpoint|spreadsheets?|audio|links?|urls?|upload|attach\w*)\b/,
  learn: /\b(study|studying|flashcards?|quiz\w*|exam|notes|slides?|slideshows?|presentations?|decks?|powerpoint|glossary|guides?)\b/,
  create: /\b(create|build|make|generate|websites?|sites?|web ?apps?|apps?|landing pages?|images?|pictures?|videos?|mobile|templates?|showcase|code)\b/,
  roblox: /\b(roblox|studio|luau|obby|games?|solar|overlay|play ?test)\b/,
  blender: /\b(blender|3d|models?|modeling|modelling|textures?|materials?|render\w*|fbx|glb|poly ?haven)\b/,
  ship: /\b(publish\w*|deploy\w*|domains?|hosting|host|collaborat\w*|invite|critic|preview)\b/,
  organize: /\b(projects?|memory|remember|history|specialists?|mcp|connected apps?|integrations?|canvas)\b/,
  platform: /\b(desktop|download|windows|mac|macos|linux|extension|chrome|edge|api|keys?|widget|embed|referral\w*|languages?)\b/,
  trust: /\b(privacy|private|data|security|secure|safe|changelog|roadmap|status|agi|superintelligen\w*)\b/,
};
const BUSINESS_WORDS = /\b(business|agents?|approvals?|teams?|company|companies|enterprise|workspace)\b/;

/** The person is talking about Keplar itself (its product, features, plans), not asking Keplar to do a general task. */
export function isAboutKeplar(prompt: string): boolean {
  const t = norm(prompt);
  if (!t) return false;
  // Keplar or one of its own product names.
  if (/\bkeplar\b|\bsolar 5\.8\b|\bkeplar studio\b/.test(t)) return true;
  // What you are / can do, how to use you, who made you, plans and prices.
  if (/\b(what|which) (can|do|does|are|is) (you|keplar)\b.*\b(do|offer|have|support|features?|capabilit\w*|tools?|modes?|good at|able)\b/.test(t)) return true;
  if (/\bwhat (are|is) you\b|\bwho (made|built|created|owns|runs) you\b|\byour (features?|capabilit\w*|tools?|modes?|plans?|pricing|prices?|limits?|api|app|desktop app|extension|privacy policy)\b/.test(t)) return true;
  if (/\bhow (do|can|should) i (use|start|set up|setup|install|connect|get started with|sign up for|cancel|upgrade)\b.*\b(you|this|it here|keplar)\b/.test(t)) return true;
  // "Can you build me a website / make slides / work in Roblox Studio / read PDFs?": a capability of the product, not general knowledge.
  if (/\b(can|could|do|does|will) (you|keplar)\b.*\b(build|make|create|generate|design|publish|host|deploy|read|open|connect|remember|research|study|present|export|render|model|texture|run|work (in|with))\b.*\b(websites?|sites?|apps?|images?|pictures?|videos?|slides?|slideshows?|presentations?|decks?|games?|roblox|studio|blender|3d|pdfs?|files?|documents?|spreadsheets?|flashcards?|quiz\w*|domains?|me|things?|stuff)\b/.test(t)) return true;
  if (/\b(do|does) (you|keplar) (have|offer|support|come with)\b/.test(t)) return true;
  if (/\b(is|are) (there|you) (a|an)? ?(desktop app|mobile app|api|extension|free plan|free version|student discount|limit)\b/.test(t) && /\b(you|keplar|there)\b/.test(t)) return true;
  if (/\b(pricing|plans?|subscription|credits?|usage limits?|free plan|upgrade|refund|cancel my)\b/.test(t) && /\b(you|your|keplar|here|this app|this site|my account|my plan)\b/.test(t)) return true;
  return false;
}

/** The sections a question touches (the full text of these goes with the index). Capped so the block stays small. */
export function sectionsFor(prompt: string): FactSection[] {
  const t = norm(prompt);
  return FACT_SECTIONS.filter((s) => SECTION_WORDS[s.id]?.test(t)).slice(0, 3);
}

const STATUS_LABEL = { live: "live", beta: "beta", soon: "coming soon, not available yet" } as const;
const statusLabel = (st: string) => STATUS_LABEL[st as keyof typeof STATUS_LABEL] ?? st;

/** The block placed ahead of a question about Keplar (guidance, never shown); empty for every other question. */
export function selfKnowledgeNote(prompt: string, origin = "https://keplar.one"): string {
  if (!isAboutKeplar(prompt)) return "";
  const url = (href?: string) => (href ? (href.startsWith("http") ? href : `${origin}${href}`) : "");
  const index = FACT_SECTIONS.map((s) => `${s.title}: ${s.facts.map((f) => `${f.name} (${statusLabel(factStatus(f))}${f.plans ? `; ${f.plans}` : ""})`).join(", ")}.`).join("\n");
  const detail = sectionsFor(prompt).map((s) => `${s.title}. ${s.intro}\n${s.facts.map((f) => `- ${f.name} [${statusLabel(factStatus(f))}${f.plans ? `; ${f.plans}` : ""}]: ${f.what}${f.href ? ` (${url(f.href)})` : ""}`).join("\n")}`).join("\n\n");
  const business = BUSINESS_WORDS.test(norm(prompt)) ? `\n\n${BUSINESS_FACTS.title}. ${BUSINESS_FACTS.intro}` : "";
  return [
    "About Keplar itself (guidance for answering, not part of the question; do not quote it). The person is asking about Keplar, the product you are answering in. Answer from these facts, which are current; do not invent features, plans, prices, limits or dates that are not here. Say plainly when something is beta or not available yet, which plan or app a feature needs, and where to find it (the page or the app area). If a question goes beyond these facts, say you are not sure rather than guess.",
    `${WHAT_IS_KEPLAR}\n${productFacts()}`,
    `Every feature (status; who can use it):\n${index}`,
    detail ? `Details for this question:\n${detail}` : "",
  ].filter(Boolean).join("\n\n") + business;
}
