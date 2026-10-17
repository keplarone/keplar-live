/**
 * Free tools. Local tools do no inference. Model tools call only a $0 OpenRouter `:free`
 * model (free-guard.ts) and stop when the key is missing or the host reports a cost.
 * Nothing here invents a ranking, a citation, or a Study-mode export.
 */
import { liveEnv, openRouterSlug } from "@/lib/orchestration/config";
import { catalogById } from "@/lib/orchestration/catalog";
import { isFreeModel } from "@/lib/orchestration/free-guard";
import { FREE_TOOL_IDS } from "@/lib/tools/models";
import type { ClusterId } from "./clusters";

export const TOOL_LIMITS = { perIp: 8, windowSec: 60 * 60, maxInputChars: 4_000, maxOutputTokens: 500 } as const;

export type ToolKind = "model" | "citation" | "browse";

export type ToolFaq = { q: string; a: string };

export type ToolDef = {
  slug: string;
  kind: ToolKind;
  clusterId: ClusterId;
  productPath: string;
  productLabel: string;
  title: string;
  description: string;
  label: string;
  h1: string;
  lede: string;
  sections: { h2: string; paragraphs: string[] }[];
  example: { title: string; text: string };
  faq: ToolFaq[];
  /** Shown above the form. Model tools warn that free hosts may log prompts. */
  notice: string;
};

const NOTICE_MODEL = "Free model hosts may log what you paste. Do not include passwords, keys, or someone else's private information. The result is a draft from one free model, not a Keplar multi-model answer.";
const NOTICE_LOCAL = "This one runs in your browser's request on Keplar's server and does not call a model. It is a starting point, not a style manual.";

export const TOOLS: ToolDef[] = [
  {
    slug: "citation-formatter",
    kind: "citation",
    clusterId: "writing",
    productPath: "/docs/how-it-works/sources-and-citations",
    productLabel: "How Keplar treats sources",
    title: "Citation formatter",
    description: "Format a web page or article you already have into APA, MLA, or Chicago. Keplar does not look the source up and does not check that it exists.",
    label: "Free tool",
    h1: "Format a citation from the details you have.",
    lede: "Paste the author, title, year, and URL you already found. The formatter arranges them. It does not search, and it will not invent a missing author or date.",
    sections: [
      { h2: "What you get", paragraphs: ["A single reference for a web page, article, or book, in APA, MLA, or Chicago author-date order. Use it as a draft in a bibliography, then check it against the style guide your school or publisher names."] },
      { h2: "What it will not do", paragraphs: ["It will not fetch the page, recover a missing author, or decide which style your assignment requires. If a field is empty, that part is left out rather than guessed. Sources inside a Keplar answer are still labeled as cited by a model and not opened by Keplar."] },
    ],
    example: { title: "Example fields", text: "Author: Ada Lovelace. Title: Notes on the analytical engine. Year: 1843. Container: Taylor's Scientific Memoirs. The formatted line uses only those fields." },
    faq: [
      { q: "Does this check that the page is real?", a: "No. It only arranges the text you typed. Open the URL yourself before you rely on it." },
      { q: "Which styles are included?", a: "APA, MLA, and Chicago author-date, for the common case of a named author, a title, a year, a container, and a URL." },
    ],
    notice: NOTICE_LOCAL,
  },
  {
    slug: "model-comparison",
    kind: "browse",
    clusterId: "comparisons",
    productPath: "/app/ask",
    productLabel: "Ask Keplar",
    title: "Model comparison explorer",
    description: "Browse Keplar's comparison pages by name. There is no score, ranking, or traffic chart. Each page says what it is allowed to claim.",
    label: "Free tool",
    h1: "Find the comparison page that matches your question.",
    lede: "Filter the pages Keplar has already published. This is a directory, not a leaderboard. Nothing here says one model is more accurate than another.",
    sections: [
      { h2: "How to use it", paragraphs: ["Type a product name, such as Poe or ChatGPT. The list narrows to pages whose title or intent mentions it. Open the page for the sourced details and the date they were read."] },
      { h2: "What is not here", paragraphs: ["There is no star rating, win rate, or benchmark table. /vs/perplexity is withheld until it is approved. For a live comparison of answers, ask the same question in Keplar and read where the models agreed and split."] },
    ],
    example: { title: "Try a filter", text: "Type “council” to reach the Perplexity Model Council page, or “ChatGPT” to reach the assistant comparison. The filter matches the words on this list only." },
    faq: [
      { q: "Is this a ranking of AI models?", a: "No. It only lists Keplar's own pages. Those pages do not claim Keplar is more accurate, safer, or more private." },
      { q: "Why are some products missing?", a: "A comparison is published only after its sources have been read and, for /vs pages, approved. An unapproved page is not listed." },
    ],
    notice: "Nothing you type is sent to a model. The filter runs on the list already on the page.",
  },
  {
    slug: "prompt-optimizer",
    kind: "model",
    clusterId: "prompts",
    productPath: "/prompts",
    productLabel: "Prompt library",
    title: "Prompt optimizer",
    description: "Rewrite a prompt so the task, the inputs, and the check you will do are explicit. One free model drafts it. Keplar does not claim the rewrite is better.",
    label: "Free tool",
    h1: "Make a prompt state the task and the check.",
    lede: "Paste a prompt. A free model returns a tighter version that names the audience, the inputs, and what you should verify. Compare the two and keep the one you prefer.",
    sections: [
      { h2: "What a useful rewrite includes", paragraphs: ["The job in one sentence, the material the model is allowed to use, the shape of the answer, and the part you will check yourself. A rewrite that adds facts you did not provide is a worse prompt, not a better one."] },
      { h2: "Limits", paragraphs: ["This is one free model, not Keplar's panel. It can miss the point of a short prompt. The prompt library has templates you can copy without calling a model at all."] },
    ],
    example: { title: "A prompt that is too open", text: "Help me with my essay. A tighter version names the question, the sources you may use, the length, and that claims need a page or a reason." },
    faq: [
      { q: "Will the rewrite be more accurate?", a: "No. Accuracy depends on the question and the model that later answers it. This tool only rewrites the instructions." },
      { q: "Is my prompt stored?", a: "The tool does not save it in your account. Free model hosts may log prompts. Do not paste secrets." },
    ],
    notice: NOTICE_MODEL,
  },
  {
    slug: "study-guide",
    kind: "model",
    clusterId: "studying",
    productPath: "/app/study",
    productLabel: "Study mode",
    title: "Study guide generator",
    description: "Turn notes you paste into a short outline. It is one free model, not Study mode, and it does not read a PDF or cite your pages.",
    label: "Free tool",
    h1: "Outline notes you paste. It will not open a file.",
    lede: "Paste notes. You get a short outline of what they say. Study mode, in the app, is the tool that reads a PDF and answers only from that file with page references.",
    sections: [
      { h2: "What the outline is for", paragraphs: ["A first pass over notes you already trust: headings, a few points under each, and a list of terms to review. It should not add facts that are not in the notes. If it does, delete them."] },
      { h2: "What to use instead for a real study set", paragraphs: ["Study mode accepts a text-based PDF or pasted notes, builds flashcards and a quiz, and says when something is not in the material. This page does not do that. It is a free preview of the shape of an outline."] },
    ],
    example: { title: "Notes in, outline out", text: "Paste a few paragraphs from your own notes. Expect headings and bullets drawn from those paragraphs, plus a line that says what the notes do not cover." },
    faq: [
      { q: "Can I upload a PDF here?", a: "No. Paste text. PDF study sets are in Study mode, which needs an account." },
      { q: "Are the page numbers real?", a: "This tool has no pages to cite. Do not treat a number it prints as a reference." },
    ],
    notice: NOTICE_MODEL,
  },
  {
    slug: "flashcards",
    kind: "model",
    clusterId: "studying",
    productPath: "/app/study",
    productLabel: "Study mode",
    title: "Flashcard generator",
    description: "Draft flashcards from notes you paste. Cards can be wrong. Study mode is where spaced review and quizzes live.",
    label: "Free tool",
    h1: "Draft flashcards from notes you paste.",
    lede: "You get a short list of term and definition pairs. Check every card against the notes. A card that adds a fact is a card to throw away.",
    sections: [
      { h2: "A card worth keeping", paragraphs: ["The term appears in your notes, and the definition uses their wording. Cards about adjacent topics the notes never mention are not worth keeping, even when they sound plausible."] },
      { h2: "Spaced review is in the app", paragraphs: ["This page does not schedule reviews or grade a quiz. Signed-in Study mode does, with the free plan's smaller limits and free models."] },
    ],
    example: { title: "What the output looks like", text: "Term: photosynthesis. Definition: a sentence taken from the notes you pasted, not a textbook paragraph the model remembers." },
    faq: [
      { q: "How many cards do I get?", a: "A short set, capped by the reply length. It is not your whole course." },
      { q: "Can I save them?", a: "Not from this page. Study mode saves a set to your account." },
    ],
    notice: NOTICE_MODEL,
  },
  {
    slug: "research-questions",
    kind: "model",
    clusterId: "reasoning",
    productPath: "/app/ask",
    productLabel: "Ask Keplar",
    title: "Research question generator",
    description: "Draft narrower questions from a topic you name. It does not search the web or write the paper. Deep Research needs Plus or Pro.",
    label: "Free tool",
    h1: "Split a topic into questions you can actually answer.",
    lede: "Name a topic. A free model suggests smaller questions and what evidence each one would need. It does not answer them and it does not browse.",
    sections: [
      { h2: "What a good question here looks like", paragraphs: ["It is narrow enough that a source could settle it, and it says what kind of source would count. A question that asks for the best or the most accurate answer is sent back as too broad."] },
      { h2: "This is not Deep Research", paragraphs: ["Deep Research is a longer run on Plus and Pro. Browser answers do not search the web. Live Research, in the desktop app, does, and it is in beta. This tool only drafts questions."] },
    ],
    example: { title: "From a wide topic", text: "“Remote work and cities” can become “Which US cities published office-vacancy figures for 2024?” That question names a document. The tool should not invent the figure." },
    faq: [
      { q: "Will it cite papers?", a: "No. If it prints a citation, treat it as unchecked. Keplar has not opened it." },
      { q: "Can it research the questions too?", a: "Not here. Ask one of them in Keplar, or use Deep Research on Plus or Pro." },
    ],
    notice: NOTICE_MODEL,
  },
  {
    slug: "presentation-outline",
    kind: "model",
    clusterId: "presentations",
    productPath: "/ai-slideshow-maker",
    productLabel: "Slideshow maker",
    title: "Presentation outline generator",
    description: "Draft slide titles and speaker notes from a topic or notes. It does not build a deck, export PowerPoint, or generate images. Those are Plus and Pro.",
    label: "Free tool",
    h1: "Draft slide titles. It does not build the deck.",
    lede: "Paste a topic or notes. You get a sequence of slide titles, one point each, and a speaker note. The slideshow maker, on Plus and Pro, is what exports PowerPoint or PDF.",
    sections: [
      { h2: "What comes back", paragraphs: ["About six to ten slides: a title, a single claim, and a note about what you would say. Image ideas, if any, are text. This page does not generate pictures."] },
      { h2: "What still needs you", paragraphs: ["The order, the claims, and whether a slide should exist. A free model will happily add a slide you cannot defend. Cut those before you open the slideshow maker."] },
    ],
    example: { title: "A topic line", text: "“How our team reviews a vendor.” Expect a title slide, a slide for criteria, a slide for what to ignore, and a closing slide that names the decision. Not a designed file." },
    faq: [
      { q: "Can I download PowerPoint here?", a: "No. Export is part of the slideshow maker on Plus and Pro." },
      { q: "Are the images real?", a: "No images are generated. A note that says “show a photo of the office” is a suggestion, not a file." },
    ],
    notice: NOTICE_MODEL,
  },
  {
    slug: "summarizer",
    kind: "model",
    clusterId: "writing",
    productPath: "/app/ask",
    productLabel: "Ask Keplar",
    title: "Text summarizer",
    description: "Summarize text you paste. The summary can drop a caveat or add a point. Read it against the original. This is one free model.",
    label: "Free tool",
    h1: "Summarize text you paste. Then check the original.",
    lede: "Paste a passage. You get a short summary that should stay inside it. Anything the passage did not say does not belong in the summary, including numbers.",
    sections: [
      { h2: "A faithful summary", paragraphs: ["It keeps the conclusion, the main reasons, and the limits the author stated. It does not upgrade “may” to “will,” and it does not add a citation the passage did not contain."] },
      { h2: "Length", paragraphs: ["The input is capped, and so is the reply. A book chapter needs Study mode or a series of smaller pastes. This page is for a passage you can read again in one sitting."] },
    ],
    example: { title: "What to paste", text: "A section of an article, a meeting note, or a spec paragraph. Do not paste customer data or a private email." },
    faq: [
      { q: "Will the summary be shorter and complete?", a: "Shorter, yes. Complete, not guaranteed. Compare it with the passage before you send it on." },
      { q: "Does Keplar store the text?", a: "This tool does not save it to an account. Free model hosts may log prompts." },
    ],
    notice: NOTICE_MODEL,
  },
  {
    slug: "writing-improver",
    kind: "model",
    clusterId: "writing",
    productPath: "/for-writers",
    productLabel: "Keplar for writers",
    title: "Writing improvement tool",
    description: "Get line edits on a paragraph you paste: clearer sentences, and a note when a claim has no support in the text. One free model. Not a grade.",
    label: "Free tool",
    h1: "See a clearer version of a paragraph you wrote.",
    lede: "Paste a paragraph. You get a revised version and a short list of what changed. The tool should not add facts. A change that adds a fact is a change to reject.",
    sections: [
      { h2: "What it looks for", paragraphs: ["Long sentences, a buried point, and a claim that the paragraph itself does not support. It is not a detector of truth. It cannot know whether your claim is right."] },
      { h2: "Keep your wording when it was doing work", paragraphs: ["A plain rewrite can sand off a distinction you meant. Keep the original sentence when the note does not say what was wrong with it."] },
    ],
    example: { title: "A muddy sentence", text: "“It is important to note that the results were significant in some ways.” A useful edit asks which result, and deletes “it is important to note.”" },
    faq: [
      { q: "Is this a grade or a score?", a: "No. There is no score. You get a revision and notes." },
      { q: "Will it match my style guide?", a: "Only if you paste the rule you care about. Otherwise it aims for shorter, direct sentences." },
    ],
    notice: NOTICE_MODEL,
  },
  {
    slug: "learning-plan",
    kind: "model",
    clusterId: "studying",
    productPath: "/app/study",
    productLabel: "Study mode",
    title: "Learning plan generator",
    description: "Draft a day-by-day plan from a topic and a date you provide. It does not know your course. Study mode builds a plan from your material.",
    label: "Free tool",
    h1: "Draft a study plan from a topic and a date.",
    lede: "Say what you are learning and when you need it. You get a simple sequence of sessions. It is a draft schedule, not a judgment of how prepared you are.",
    sections: [
      { h2: "What to include in the prompt", paragraphs: ["The subject, the date, how many days a week you can study, and what you already have (a textbook chapter, lecture notes, nothing). The plan should use only that. It should not assign a score to your chances."] },
      { h2: "A plan from your own files", paragraphs: ["Study mode builds a day-by-day plan from the notes or PDF you upload, and its questions stay inside that material. This page cannot see those files."] },
    ],
    example: { title: "A usable request", text: "“Organic chemistry, exam on 2 December, four evenings a week, I have lecture notes for chapters 1 to 6.” Expect sessions that name those chapters, not a new syllabus." },
    faq: [
      { q: "Does it know the exam?", a: "No. It only knows what you typed. Check dates and chapter numbers." },
      { q: "Can it quiz me?", a: "Not here. Quizzes are in Study mode." },
    ],
    notice: NOTICE_MODEL,
  },
];

const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
export function toolBySlug(slug: string): ToolDef | undefined {
  return bySlug.get(slug);
}
export const toolPaths = (): string[] => ["/tools", ...TOOLS.map((t) => `/tools/${t.slug}`)];

export type CitationInput = {
  style?: string;
  authors?: string;
  title?: string;
  year?: string;
  container?: string;
  url?: string;
  accessed?: string;
};

const STYLES = new Set(["apa", "mla", "chicago"]);

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function authorsOf(raw: string): { given: string; family: string }[] {
  return raw
    .split(/\s*(?:;| and )\s*/i)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const parts = name.split(" ").filter(Boolean);
      const family = parts.pop() ?? name;
      return { given: parts.join(" "), family };
    });
}

function apaAuthors(people: { given: string; family: string }[]): string {
  const one = (p: { given: string; family: string }) => {
    const initials = p.given.split(" ").filter(Boolean).map((w) => `${w[0]!.toUpperCase()}.`).join(" ");
    return initials ? `${p.family}, ${initials}` : p.family;
  };
  if (people.length === 1) return one(people[0]!);
  if (people.length === 2) return `${one(people[0]!)} & ${one(people[1]!)}`;
  return `${people.slice(0, -1).map(one).join(", ")}, & ${one(people[people.length - 1]!)}`;
}

function plainAuthors(people: { given: string; family: string }[]): string {
  const one = (p: { given: string; family: string }, i: number) => (i === 0 ? `${p.family}, ${p.given}`.replace(/, $/, "") : `${p.given} ${p.family}`.trim());
  if (people.length === 1) return one(people[0]!, 0);
  if (people.length === 2) return `${one(people[0]!, 0)}, and ${one(people[1]!, 1)}`;
  return `${people.slice(0, -1).map((p, i) => one(p, i)).join(", ")}, and ${one(people[people.length - 1]!, 1)}`;
}

/** Arrange fields the caller already has. Missing fields are omitted. The URL is not fetched. */
export function formatCitation(input: CitationInput): { ok: true; text: string } | { ok: false; error: string } {
  const style = clean(input.style, 16).toLowerCase() || "apa";
  if (!STYLES.has(style)) return { ok: false, error: "Style must be APA, MLA, or Chicago." };
  const title = clean(input.title, 300);
  const authors = clean(input.authors, 300);
  const year = clean(input.year, 12);
  const container = clean(input.container, 200);
  const url = clean(input.url, 400);
  const accessed = clean(input.accessed, 20);
  if (!title) return { ok: false, error: "Add a title." };
  if (!authors) return { ok: false, error: "Add at least one author." };
  if (year && !/^(\d{4}|n\.d\.)$/i.test(year)) return { ok: false, error: "Year should be four digits, or n.d." };
  if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: "URL should start with http:// or https://." };
  const people = authorsOf(authors);
  const y = year || "n.d.";
  let text: string;
  if (style === "apa") {
    text = [apaAuthors(people), `(${y}).`, `${title}.`, container ? `${container}.` : "", url].filter(Boolean).join(" ");
  } else if (style === "mla") {
    text = [`${plainAuthors(people)}.`, `"${title}."`, container ? `${container},` : "", y + ".", url].filter(Boolean).join(" ");
  } else {
    text = [`${plainAuthors(people)}.`, `"${title}."`, container ? `${container}.` : "", y + ".", url, accessed ? `Accessed ${accessed}.` : ""].filter(Boolean).join(" ");
  }
  return { ok: true, text: text.replace(/\s+/g, " ").trim() };
}

export type FreeToolResult = { ok: true; text: string; model: string } | { ok: false; status: number; error: string };

type Completion = { choices?: { message?: { content?: string | null } }[]; usage?: { cost?: number } };

/** The first catalogued $0 `:free` model, or null. Never a paid id. */
export function freeToolRoute(): { id: string; slug: string } | null {
  for (const id of FREE_TOOL_IDS) {
    const spec = catalogById.get(id);
    const slug = spec ? openRouterSlug(spec) : null;
    if (spec && slug && isFreeModel(spec) && slug.endsWith(":free")) return { id, slug };
  }
  return null;
}

const PROMPTS: Record<string, string> = {
  "prompt-optimizer": "Rewrite the user's prompt. Name the task, the inputs they supplied, the shape of the answer, and what they should check. Do not add facts they did not give. Do not claim the rewrite is more accurate. If the prompt is empty of a task, say what is missing.",
  "study-guide": "Turn the pasted notes into a short outline. Use only what is in the notes. Do not add outside facts, page numbers, or citations. End with one line on what the notes do not cover. If the notes are too thin, say so.",
  flashcards: "Write at most eight flashcards from the notes. Each card is 'Term: ' then 'Definition: '. Definitions must come from the notes. Do not add cards about topics the notes never mention. No scores.",
  "research-questions": "Propose at most six narrower questions about the topic, and name the kind of source that could answer each one. Do not answer the questions. Do not invent citations, statistics, or paper titles. Refuse 'best' and 'most accurate' as too broad.",
  "presentation-outline": "Draft six to ten slide titles from the notes or topic. For each: a title, one claim, and a speaker note. Do not generate images or a file. Do not add facts that are not in the input. Say that export is not part of this draft.",
  summarizer: "Summarize the passage in a short paragraph. Do not add facts, numbers, or citations that are not in the passage. Do not upgrade hedging ('may') into certainty. If the passage is too short to summarize, say so.",
  "writing-improver": "Return a revised paragraph and a short list of what you changed. Do not add facts. Do not give a grade or a score. If a sentence was fine, say you left it.",
  "learning-plan": "Draft a simple study schedule from the topic, date, and materials the user named. Do not invent chapters or predict a grade. If the date or the materials are missing, say what you need.",
};

export function toolSystemPrompt(slug: string): string | null {
  return PROMPTS[slug] ?? null;
}

/**
 * One completion on a free model. `key` and `fetchImpl` are injectable for tests.
 * A reported cost above zero discards the text: this path is not allowed to spend.
 */
export async function runFreeTool(
  slug: string,
  userText: string,
  deps: { fetchImpl?: typeof fetch; key?: string | null } = {},
): Promise<FreeToolResult> {
  const system = toolSystemPrompt(slug);
  const text = userText.replace(/\s+/g, " ").trim().slice(0, TOOL_LIMITS.maxInputChars);
  if (!system) return { ok: false, status: 404, error: "This tool does not call a model." };
  if (text.length < 12) return { ok: false, status: 400, error: "Add a bit more text. A few words is not enough to rewrite." };
  const route = freeToolRoute();
  if (!route) return { ok: false, status: 503, error: "No free model is available for this tool." };
  const key = deps.key === undefined ? liveEnv("free").openRouterKey : deps.key;
  if (!key) return { ok: false, status: 503, error: "This free tool is not available in this environment. The examples on the page still work, and no model was called." };
  const env = liveEnv("free");
  const res = await (deps.fetchImpl ?? fetch)(`${env.openRouterBase}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "http-referer": env.appUrl, "x-title": "Keplar free tool" },
    body: JSON.stringify({
      model: route.slug,
      messages: [{ role: "system", content: system }, { role: "user", content: text }],
      max_tokens: TOOL_LIMITS.maxOutputTokens,
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = (await res.json().catch(() => ({}))) as Completion;
  if (typeof data.usage?.cost === "number" && data.usage.cost > 0) {
    return { ok: false, status: 502, error: "The model host reported a cost, so the draft was discarded. This tool only uses free models." };
  }
  const out = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!res.ok || !out) return { ok: false, status: 502, error: "The free model did not answer. Try again in a moment." };
  return { ok: true, text: out, model: route.slug };
}
