/**
 * The free tool network: ten small tools, each with its own indexable page under /tools, a real free experience and a
 * natural step into the product. Two kinds:
 *  - "model" tools compose a careful prompt from a short form and run it through the same Ask pipeline as the chat, on the
 *    Free lane (free open models, the chat's own daily limits, plus stricter per-IP limits in /api/tools/run). No account.
 *  - "local" tools run entirely in the browser from pure functions (citations, a study schedule, the model roster), so they
 *    cost nothing and work offline once loaded.
 * Copy rules are the site's: no invented numbers, no accuracy claims, plans and limits as in src/lib/tiers.ts.
 */
import type { ClusterId } from "@/lib/seo/clusters";

export type FieldKind = "text" | "textarea" | "select" | "date" | "number";
export type Field = {
  id: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  required?: boolean;
  /** Maximum characters for text fields; a hard server-side cap too. */
  max?: number;
  rows?: number;
  options?: { value: string; label: string }[];
  help?: string;
};

export type ToolKind = "model" | "local";

export type Tool = {
  slug: string;
  /** Short name for lists and breadcrumbs. */
  name: string;
  /** <title> without the " · Keplar" suffix (≤ 53 characters). */
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  cluster: ClusterId;
  kind: ToolKind;
  fields: Field[];
  /** Label of the run button. */
  action: string;
  /** How the tool works, as numbered steps (rendered and as HowTo structured data). */
  steps: string[];
  /** What the result contains, one bullet each. */
  output: string[];
  /** Worked examples: the inputs a visitor could try. */
  examples: { title: string; input: Record<string, string> }[];
  faq: { q: string; a: string }[];
  /** Where to go next in the product, and why. */
  product: { href: string; label: string; why: string };
  /** Existing pages worth reading, by path (checked by tests). */
  related: string[];
  /** ISO date of the last content change. */
  updated: string;
};

const LEVELS = [
  { value: "high-school", label: "High school" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "graduate", label: "Graduate" },
  { value: "professional", label: "Professional or self-taught" },
];

export const TOOLS: readonly Tool[] = [
  {
    slug: "prompt-optimizer",
    name: "AI prompt optimizer",
    metaTitle: "Free AI prompt optimizer: rewrite a prompt that works",
    metaDescription: "Paste a rough prompt and get a clearer one: goal, context, format and checks spelled out, with the reasons for each change. Free, no signup.",
    h1: "Turn a rough request into a prompt that works.",
    lede: "Describe what you want from an AI assistant, paste your current prompt if you have one, and get a rewritten prompt with the goal, context, format and checks made explicit, plus the reasons for each change.",
    cluster: "prompts",
    kind: "model",
    fields: [
      { id: "goal", label: "What do you want the assistant to do?", kind: "textarea", required: true, max: 1500, rows: 3, placeholder: "Explain how compound interest works to a 16-year-old, with one worked example." },
      { id: "draft", label: "Your current prompt (optional)", kind: "textarea", max: 2000, rows: 3, placeholder: "explain compound interest" },
      { id: "format", label: "Answer format", kind: "select", options: [{ value: "short", label: "A short answer" }, { value: "steps", label: "Step by step" }, { value: "list", label: "A list" }, { value: "table", label: "A table" }, { value: "long", label: "A longer piece" }] },
      { id: "target", label: "Where will you use it?", kind: "select", options: [{ value: "any", label: "Any AI assistant" }, { value: "keplar", label: "Keplar" }] },
    ],
    action: "Improve my prompt",
    steps: ["Say what you want the assistant to do, in your own words.", "Paste your current prompt if you have one, and pick the answer format you want.", "Keplar rewrites the prompt and explains each change: the goal, the context it adds, the format, and what to check in the answer."],
    output: ["One rewritten prompt you can paste into any assistant.", "The reasons for each change, so you learn the pattern.", "Two shorter variations for quick questions.", "What to check in the answer before you trust it."],
    examples: [
      { title: "A study explanation", input: { goal: "Explain how compound interest works to a 16-year-old, with one worked example.", draft: "explain compound interest", format: "steps", target: "any" } },
      { title: "A work email", input: { goal: "Write a polite reminder to a client whose invoice is 20 days overdue, keeping the relationship warm.", draft: "", format: "short", target: "any" } },
    ],
    faq: [
      { q: "Is the prompt optimizer free?", a: "Yes. It runs on Keplar's Free lane with free open models and no account. There is a daily limit per visitor; for more, sign up for a free account or a plan." },
      { q: "Will the improved prompt work in ChatGPT or Claude?", a: "Yes. Choose \"Any AI assistant\" and the rewrite avoids anything specific to Keplar. Choose \"Keplar\" to get wording that takes advantage of the multi-model answer, such as asking where models disagree." },
      { q: "Why does a longer prompt help?", a: "Most weak prompts leave out the goal, the reader, the format or the constraints, so the assistant guesses. Spelling those out removes the guessing. The tool keeps the prompt as short as the task allows." },
    ],
    product: { href: "/", label: "Try the prompt in Keplar", why: "Keplar sends it to several AI models and shows where they agree and where they split." },
    related: ["/prompts", "/blogs/how-to-write-better-ai-prompts", "/docs/using-keplar/write-better-questions"],
    updated: "2026-10-19",
  },
  {
    slug: "study-guide-generator",
    name: "AI study guide generator",
    metaTitle: "Free AI study guide generator from your notes",
    metaDescription: "Paste your notes or a chapter and get a study guide: an outline, key terms, a plain summary and practice questions with answers, built only from your material.",
    h1: "A study guide from your own notes, not from the internet.",
    lede: "Paste the material you have to learn. Keplar turns it into an outline, a plain-language summary, the key terms, and practice questions with answers, using only what you pasted and saying so when something is missing.",
    cluster: "study",
    kind: "model",
    fields: [
      { id: "material", label: "Your notes, slides or chapter text", kind: "textarea", required: true, max: 4500, rows: 8, placeholder: "Paste the text you need to learn. Up to about 750 words." },
      { id: "focus", label: "Exam or focus (optional)", kind: "text", max: 200, placeholder: "Midterm on cell biology, chapters 3–5" },
      { id: "level", label: "Level", kind: "select", options: LEVELS },
    ],
    action: "Build my study guide",
    steps: ["Paste the notes, slides or chapter you need to learn (plain text; up to about 750 words).", "Say what the exam or focus is and pick your level.", "Keplar reads only your material and writes the guide: outline, summary, key terms, practice questions with answers, and what to review first."],
    output: ["An outline of the material with the main ideas in order.", "A plain-language summary of each section.", "Key terms with one-line definitions from your text.", "Eight practice questions with answers and where in the material each comes from.", "A short list of the parts that look thin or unclear in your notes."],
    examples: [
      { title: "Biology notes", input: { material: "Cells are the basic units of life. Prokaryotic cells lack a nucleus; eukaryotic cells have a nucleus and membrane-bound organelles. The mitochondrion produces ATP through cellular respiration. The cell membrane is a phospholipid bilayer that controls what enters and leaves the cell. Diffusion moves molecules from high to low concentration without energy; active transport uses ATP to move molecules against the gradient.", focus: "Unit test on cell structure", level: "high-school" } },
    ],
    faq: [
      { q: "Does it use anything other than my notes?", a: "No. The guide is built only from the text you paste. If your notes do not cover something, the guide says so instead of filling the gap from general knowledge, so you know what to look up." },
      { q: "Can I upload a PDF?", a: "Not here. This free tool takes pasted text. Study mode in the app accepts a text-based PDF on every plan, including Free, and adds flashcards with spaced repetition, quizzes and a day-by-day plan." },
      { q: "Are the practice questions reliable?", a: "They are generated from your material and can be wrong or vague. Check each answer against the source before you rely on it. A wrong card is worse than none." },
    ],
    product: { href: "/app/study", label: "Open Study mode", why: "Study mode keeps the set, adds spaced-repetition flashcards, quizzes and a plan, and answers questions only from your material." },
    related: ["/ai-study-tool", "/guides/study-from-a-pdf", "/docs/using-keplar/study-mode", "/use-cases/study-for-an-exam"],
    updated: "2026-10-19",
  },
  {
    slug: "flashcard-generator",
    name: "AI flashcard generator",
    metaTitle: "Free AI flashcard generator from notes or a chapter",
    metaDescription: "Paste notes and get question-and-answer flashcards made only from that text, with uncertain cards marked. Free, no account, ready for any flashcard app.",
    h1: "Flashcards from your notes, with the shaky ones marked.",
    lede: "Paste the text you are studying and choose how many cards you want. Each card uses only facts stated in your material, and any card the material does not fully support is marked so you can check it.",
    cluster: "study",
    kind: "model",
    fields: [
      { id: "material", label: "Your notes or chapter text", kind: "textarea", required: true, max: 4500, rows: 8, placeholder: "Paste the text you need to learn. Up to about 750 words." },
      { id: "count", label: "How many cards", kind: "select", options: [{ value: "10", label: "10" }, { value: "15", label: "15" }, { value: "20", label: "20" }] },
      { id: "style", label: "Card style", kind: "select", options: [{ value: "qa", label: "Question and answer" }, { value: "term", label: "Term and definition" }, { value: "cloze", label: "Fill in the blank" }] },
    ],
    action: "Make my flashcards",
    steps: ["Paste the notes or chapter text.", "Choose how many cards and which style: question and answer, term and definition, or fill in the blank.", "Keplar writes the cards from your text only, marks any card the text does not fully support, and formats them as Question | Answer lines you can paste into Anki, Quizlet or a spreadsheet."],
    output: ["Numbered cards as Question | Answer lines.", "One fact per card, in your material's own words where possible.", "Cards the material does not fully support, marked \"check\".", "A short note on which parts of the text produced no cards."],
    examples: [
      { title: "History notes", input: { material: "The Treaty of Westphalia (1648) ended the Thirty Years' War and is often cited as the origin of the modern state system based on sovereignty. It recognized the independence of the Dutch Republic and the Swiss Confederation. The principle cuius regio, eius religio, first set in the Peace of Augsburg (1555), was extended to include Calvinism.", count: "10", style: "qa" } },
    ],
    faq: [
      { q: "Can I export the cards?", a: "Copy the result. Each card is one line in the form Question | Answer, which imports into Anki and Quizlet and pastes cleanly into a spreadsheet." },
      { q: "How is this different from Study mode?", a: "This tool makes cards from pasted text with no account. Study mode in the app also reads a PDF, keeps your cards, schedules reviews with spaced repetition so missed cards come back sooner, and quizzes you." },
      { q: "Why are some cards marked \"check\"?", a: "The card asks about something the text only hints at. Open the source before you learn it; the mark is there so a guess never hides inside a confident card." },
    ],
    product: { href: "/app/study", label: "Study with spaced repetition", why: "Study mode schedules reviews so the cards you miss come back sooner, on every plan including Free." },
    related: ["/ai-study-tool", "/docs/using-keplar/study-mode", "/guides/study-from-a-pdf"],
    updated: "2026-10-19",
  },
  {
    slug: "research-question-generator",
    name: "AI research question generator",
    metaTitle: "Free research question generator for essays",
    metaDescription: "Turn a topic into focused research questions: descriptive, comparative, causal and evaluative, each with why it can be researched and how to narrow it. Free.",
    h1: "From a broad topic to questions you can actually research.",
    lede: "Give Keplar a topic and what the work is for. You get a set of research questions grouped by type, each with a note on why it is answerable, what kinds of sources would answer it, and how to narrow it if it is too big.",
    cluster: "research",
    kind: "model",
    fields: [
      { id: "topic", label: "Topic", kind: "text", required: true, max: 300, placeholder: "Remote work and employee productivity" },
      { id: "kind", label: "What is it for?", kind: "select", options: [{ value: "essay", label: "An essay or paper" }, { value: "thesis", label: "A thesis or dissertation" }, { value: "review", label: "A literature review" }, { value: "decision", label: "A product or business decision" }, { value: "science", label: "A science project" }] },
      { id: "context", label: "What you already know or care about (optional)", kind: "textarea", max: 1500, rows: 3, placeholder: "I'm interested in small companies, and I've read that results differ by job type." },
    ],
    action: "Generate research questions",
    steps: ["Name the topic and say what the work is for.", "Add what you already know or the angle you care about, if any.", "Keplar writes ten questions grouped by type, each with why it can be researched, what sources would answer it, and how to narrow it."],
    output: ["Ten questions in four groups: descriptive, comparative, causal and evaluative.", "For each, why it is researchable and what kind of evidence would answer it.", "A narrower version of the broadest questions.", "Two questions to avoid, and why (too broad, unanswerable, or already settled)."],
    examples: [
      { title: "An undergraduate essay", input: { topic: "Remote work and employee productivity", kind: "essay", context: "Interested in small companies; results seem to differ by job type." } },
    ],
    faq: [
      { q: "Does the tool search for sources?", a: "No. It suggests what kinds of sources would answer each question, such as surveys, trials or company reports. It does not browse the web. Deep Research in the app (Plus and above) produces a longer report, and the desktop app's Live Research (beta) reads real pages and cites them." },
      { q: "Are the questions original?", a: "They are generated for your topic and context, so treat them as a starting point. Check what has already been written before you commit to one." },
      { q: "Is it free?", a: "Yes, with a daily limit per visitor on free open models. No account is needed." },
    ],
    product: { href: "/", label: "Research a question in Keplar", why: "Keplar asks several models, shows where they disagree and lists the sources they cite." },
    related: ["/ai-research-assistant", "/use-cases/research-a-new-topic", "/docs/using-keplar/deep-research", "/blogs/what-is-deep-research"],
    updated: "2026-10-19",
  },
  {
    slug: "presentation-outline-generator",
    name: "AI presentation outline generator",
    metaTitle: "Free presentation outline generator: slides and notes",
    metaDescription: "Get a slide-by-slide outline for a talk: a title, three points and a speaker note per slide, an opening and a close, timed to your minutes. Free, no signup.",
    h1: "A slide-by-slide outline, timed to your talk.",
    lede: "Say what the talk is about, who is listening and how long you have. Keplar plans the deck: an opening, a slide-by-slide outline with a title, three points and a speaker note each, and a close, paced to the time.",
    cluster: "presentations",
    kind: "model",
    fields: [
      { id: "topic", label: "What is the presentation about?", kind: "text", required: true, max: 300, placeholder: "Why our team should adopt a four-day week for one quarter" },
      { id: "audience", label: "Who is listening?", kind: "text", max: 200, placeholder: "The leadership team" },
      { id: "minutes", label: "How long is the talk?", kind: "select", options: [{ value: "5", label: "5 minutes" }, { value: "10", label: "10 minutes" }, { value: "20", label: "20 minutes" }, { value: "30", label: "30 minutes" }] },
      { id: "goal", label: "What should happen at the end?", kind: "select", options: [{ value: "inform", label: "They understand something" }, { value: "persuade", label: "They agree to something" }, { value: "teach", label: "They can do something" }, { value: "pitch", label: "They fund or buy something" }] },
      { id: "notes", label: "Your notes or key points (optional)", kind: "textarea", max: 3500, rows: 4, placeholder: "Paste rough notes, data points or the argument you want to make." },
    ],
    action: "Outline my presentation",
    steps: ["Describe the topic, the audience, the length and what you want to happen at the end.", "Paste any notes or points the talk must include.", "Keplar writes the outline: one slide per idea, each with a title that states the point, three supporting points and a speaker note, with a running time."],
    output: ["An opening that states the point of the whole talk in one sentence.", "One slide per idea, with a title that says the point, three bullets and a speaker note.", "A close with the ask or the takeaway.", "A time estimate per slide and the total."],
    examples: [
      { title: "A ten-minute proposal", input: { topic: "Why our team should adopt a four-day week for one quarter", audience: "The leadership team", minutes: "10", goal: "persuade", notes: "Trial for one quarter; measure output and sick days; two other companies in our sector tried it." } },
    ],
    faq: [
      { q: "Does it make the slides?", a: "This free tool writes the outline and speaker notes. Slides in the app (Plus and Pro) generates the deck itself, lets you edit every slide, presents it full screen and exports to PowerPoint or PDF." },
      { q: "How many slides will it plan?", a: "About one slide per minute for a short talk and fewer per minute for a long one, so each idea gets time. You can ask for more or fewer by adding a note." },
      { q: "Can it use my data?", a: "Paste the points and numbers you want in the notes field. The outline uses what you give it and does not invent figures." },
    ],
    product: { href: "/app/slides", label: "Build the deck in Slides", why: "Slides turns an outline into a deck with speaker notes and exports to PowerPoint or PDF, on Plus and Pro." },
    related: ["/ai-slideshow-maker", "/guides/slide-deck-from-notes", "/docs/using-keplar/slideshow-creator", "/use-cases/make-a-presentation"],
    updated: "2026-10-19",
  },
  {
    slug: "text-summarizer",
    name: "AI text summarizer",
    metaTitle: "Free AI text summarizer that says what it left out",
    metaDescription: "Paste an article, report or email and get a summary at the length you choose, plus a note on what the text does not say. Free, no account, nothing stored.",
    h1: "Summarize a text, and see what the summary leaves out.",
    lede: "Paste up to about 750 words and pick a length. Keplar writes the summary, lists the key terms, and adds a short note on claims the text makes without support and questions it leaves open, so a summary never hides what is missing.",
    cluster: "writing",
    kind: "model",
    fields: [
      { id: "text", label: "Text to summarize", kind: "textarea", required: true, max: 4800, rows: 8, placeholder: "Paste an article, a report section, a long email or meeting notes. Up to about 800 words." },
      { id: "length", label: "Summary length", kind: "select", options: [{ value: "paragraph", label: "One paragraph" }, { value: "bullets5", label: "Five bullets" }, { value: "bullets10", label: "Ten bullets" }, { value: "page", label: "About a page" }] },
      { id: "focus", label: "Focus on (optional)", kind: "text", max: 200, placeholder: "Costs and timeline" },
    ],
    action: "Summarize",
    steps: ["Paste the text and choose a length; add a focus if only part of it matters to you.", "Keplar reads the text and writes the summary in the shape you chose.", "Below it: the key terms, the claims the text makes without support, and the questions it leaves open."],
    output: ["The summary, at the length you chose, in the text's own order.", "Key terms and names, with one line each.", "Claims the text states without evidence.", "What the text does not say, so you know what to ask next."],
    examples: [
      { title: "A meeting note", input: { text: "We reviewed the Q3 launch. Marketing wants to move the date to November 12 because the video is late; engineering says the build is ready now and waiting costs a sprint. Finance noted that the November date pushes revenue into Q4. No decision was made; Dana will circulate a proposal by Friday with both options costed. The support team asked for two weeks' notice before any date to prepare macros.", length: "bullets5", focus: "" } },
    ],
    faq: [
      { q: "Is my text stored?", a: "No. The text is sent to the models that answer and is not saved. On the Free lane the hosts of free models may log prompts, so keep sensitive details out, or sign in to a paid plan where documents stay with your account." },
      { q: "Can it summarize a PDF or a link?", a: "Paste the text here. In the app, you can paste a link and Keplar reads the page, and on Lite and above you can attach a PDF, Word or text file and ask about it." },
      { q: "How long can the text be?", a: "Up to about 800 words in this tool. For longer documents, split them or use the app, where paid plans accept whole files." },
    ],
    product: { href: "/", label: "Summarize a document in Keplar", why: "In the app you can paste a link or, on Lite and above, attach the whole file and ask follow-up questions." },
    related: ["/ai-writing-assistant", "/use-cases/understand-a-document", "/docs/using-keplar/attachments-images-video"],
    updated: "2026-10-19",
  },
  {
    slug: "writing-improver",
    name: "AI writing improver",
    metaTitle: "Free AI writing improver: tighten, clarify, fix tone",
    metaDescription: "Paste a draft and choose one change: tighten it, make it clearer, warmer or more formal, or fix grammar only. You get the edit and a list of every change. Free.",
    h1: "One change at a time, with every edit listed.",
    lede: "Paste your draft and pick exactly one kind of change. Keplar makes that change, keeps every fact, number and name, and lists what it altered and what it was tempted to cut, so the writing stays yours.",
    cluster: "writing",
    kind: "model",
    fields: [
      { id: "text", label: "Your draft", kind: "textarea", required: true, max: 4800, rows: 8, placeholder: "Paste the paragraph, email or section you want to improve. Up to about 800 words." },
      { id: "change", label: "What to change", kind: "select", options: [{ value: "tighten", label: "Tighten by about a fifth" }, { value: "clearer", label: "Make it clearer" }, { value: "warmer", label: "Make the tone warmer" }, { value: "formal", label: "Make the tone more formal" }, { value: "grammar", label: "Fix grammar and spelling only" }, { value: "vague", label: "Find the vague sentences (no rewrite)" }] },
      { id: "audience", label: "Who is it for? (optional)", kind: "text", max: 200, placeholder: "A customer who asked for a refund" },
    ],
    action: "Improve my writing",
    steps: ["Paste the draft and choose one change.", "Say who it is for, if that matters.", "Keplar returns the edited text, a list of the changes it made, and anything it was tempted to cut but kept."],
    output: ["The edited text, with every fact, number and name kept.", "A list of what changed and why.", "What the editor was tempted to cut but kept, so nothing disappears quietly.", "For \"find the vague sentences\": the sentences and the question a reader would ask, with no rewrite."],
    examples: [
      { title: "A customer reply", input: { text: "Hi, so regarding your refund request, basically we looked into it and it seems like the order was actually delivered on the 3rd according to the carrier, so unfortunately at this point we can't really process a refund but if you want we could maybe look into it further if you have more details.", change: "clearer", audience: "A customer who asked for a refund" } },
    ],
    faq: [
      { q: "Will it change my meaning?", a: "It is told not to, and it lists every change so you can check. Compare the result with your original before you use it; assistants can alter meaning while polishing." },
      { q: "Can it write the whole thing for me?", a: "This tool edits text you wrote. For a draft from an outline, ask in Keplar chat. Follow your school's or employer's rules on AI assistance." },
      { q: "Does it detect AI-written text or grade writing?", a: "No. It edits and explains its edits. Keplar makes no claims about detecting AI text." },
    ],
    product: { href: "/", label: "Edit a longer piece in Keplar", why: "In the app you can work through a document section by section and ask follow-up questions about each change." },
    related: ["/ai-writing-assistant", "/blogs/best-ai-for-writing", "/use-cases/write-and-edit-with-feedback", "/for-writers"],
    updated: "2026-10-19",
  },
  {
    slug: "citation-formatter",
    name: "Citation formatter",
    metaTitle: "Free citation generator: APA, MLA, Chicago, Harvard",
    metaDescription: "Format a book, journal article, web page or report in APA 7, MLA 9, Chicago author-date or Harvard, with the in-text citation. Nothing leaves your browser.",
    h1: "A reference and an in-text citation, formatted by the rules.",
    lede: "Fill in the source and pick a style. The reference and the in-text citation are formatted in your browser from the style rules, not by an AI model, so nothing is sent anywhere and the output is the same every time.",
    cluster: "research",
    kind: "local",
    fields: [
      { id: "type", label: "Source type", kind: "select", options: [{ value: "book", label: "Book" }, { value: "article", label: "Journal article" }, { value: "web", label: "Web page" }, { value: "report", label: "Report" }] },
      { id: "style", label: "Style", kind: "select", options: [{ value: "apa", label: "APA 7th" }, { value: "mla", label: "MLA 9th" }, { value: "chicago", label: "Chicago author-date (18th)" }, { value: "harvard", label: "Harvard (Cite Them Right)" }] },
      { id: "authors", label: "Authors, one per line as Last, First (or an organization)", kind: "textarea", max: 600, rows: 2, placeholder: "Bostrom, Nick" },
      { id: "title", label: "Title", kind: "text", required: true, max: 300, placeholder: "Superintelligence: Paths, Dangers, Strategies" },
      { id: "year", label: "Year", kind: "text", max: 10, placeholder: "2014" },
      { id: "container", label: "Journal, website or series name", kind: "text", max: 200, placeholder: "Nature" },
      { id: "publisher", label: "Publisher or organization", kind: "text", max: 200, placeholder: "Oxford University Press" },
      { id: "volume", label: "Volume", kind: "text", max: 20 },
      { id: "issue", label: "Issue", kind: "text", max: 20 },
      { id: "pages", label: "Pages", kind: "text", max: 30, placeholder: "12–34" },
      { id: "doi", label: "DOI (without https://doi.org/)", kind: "text", max: 120, placeholder: "10.1000/xyz123" },
      { id: "url", label: "URL", kind: "text", max: 500 },
      { id: "published", label: "Date published (web pages)", kind: "date" },
      { id: "accessed", label: "Date accessed (web pages)", kind: "date" },
      { id: "page", label: "Page for the in-text citation (optional)", kind: "text", max: 20 },
    ],
    action: "Format the citation",
    steps: ["Choose the source type and the style.", "Fill in the fields you have; leave the rest blank.", "The reference list entry and the in-text citation appear at once, formatted by the style's rules in your browser."],
    output: ["The reference list entry for your style.", "The matching in-text citation, with a page number when you give one.", "A note on fields the style expects that you left blank."],
    examples: [
      { title: "A book in APA", input: { type: "book", style: "apa", authors: "Bostrom, Nick", title: "Superintelligence: Paths, dangers, strategies", year: "2014", publisher: "Oxford University Press" } },
      { title: "A web page in MLA", input: { type: "web", style: "mla", authors: "", title: "What is Model Council", container: "Perplexity Help Center", year: "2026", url: "https://www.perplexity.ai/help-center/en/articles/13641704-what-is-model-council", published: "2026-09-04", accessed: "2026-10-12" } },
    ],
    faq: [
      { q: "Does the formatter use AI?", a: "No. It applies the published rules of each style in your browser. That makes it exact and repeatable, and means your source details never leave your device." },
      { q: "Which editions does it follow?", a: "APA Publication Manual 7th edition, MLA Handbook 9th edition, Chicago Manual of Style 18th edition author-date system, and the Harvard style as described in Cite Them Right. Styles have edge cases; check unusual sources against your style guide." },
      { q: "Can it format a citation an AI gave me?", a: "Only if the source is real. AI-generated citations can be invented, so open the source first. Keplar's answers label cited sources as \"cited by the model, not checked\" for the same reason." },
    ],
    product: { href: "/", label: "Check a source with Keplar", why: "Ask Keplar about a claim and see which models agree, where they split, and the sources they cite." },
    related: ["/ai-research-assistant", "/docs/how-it-works/sources-and-citations", "/blogs/how-to-check-an-ai-answer", "/ai-fact-check"],
    updated: "2026-10-19",
  },
  {
    slug: "ai-model-comparison",
    name: "AI model comparison explorer",
    metaTitle: "Compare the AI models Keplar uses, free and paid",
    metaDescription: "Filter the models Keplar can consult by provider, free or paid lane, open weights, context length and image input. From the product's own roster, no prices.",
    h1: "Which models answer, and what each one can read.",
    lede: "This explorer lists every model in Keplar's current roster, from the same configuration the router reads. Filter by lane, provider, open weights, context length and whether a model reads images. It is a fact sheet, not a ranking.",
    cluster: "model-comparisons",
    kind: "local",
    fields: [],
    action: "Filter",
    steps: ["Pick the Free or paid lane, or both.", "Narrow by provider, open weights, context length or image input.", "Read what each model is used for in Keplar: a panelist, a verifier, the judge, or a fast fallback."],
    output: ["Every model in the roster with its provider and family.", "Whether its weights are open or it is hosted only.", "Context window and whether it reads images.", "The role Keplar gives it and the strengths it was picked for."],
    examples: [{ title: "Open-weight models that read images", input: { lane: "both", openWeights: "yes", images: "yes" } }],
    faq: [
      { q: "Can I pick which models answer my question?", a: "Not today. Keplar's router chooses models per question by what it needs and what it costs. You can choose how thorough the answer should be, which changes how many models are consulted." },
      { q: "Why are there no prices or scores?", a: "Keplar does not publish provider prices or its routing scores, and it does not rank models. This page lists capabilities from the roster so you can see what a panel can draw on." },
      { q: "How current is the list?", a: "It is read from Keplar's code at build time. Models are added when they pass Keplar's checks and removed when providers retire them, so the list changes." },
    ],
    product: { href: "/", label: "Ask a question and see the panel", why: "Every answer shows which models responded under \"Models consulted\"." },
    related: ["/compare-ai-models", "/models", "/docs/reference/model-roster", "/docs/how-it-works/routing-and-panels"],
    updated: "2026-10-19",
  },
  {
    slug: "learning-plan-generator",
    name: "Study plan generator",
    metaTitle: "Free study plan generator: a day-by-day schedule",
    metaDescription: "List your topics, your exam date and the hours you have each week. Get a day-by-day plan with spaced reviews and extra time for weak topics. In your browser.",
    h1: "A study schedule with reviews built in.",
    lede: "List what you need to learn, mark the topics you find hardest, give your exam date and weekly hours, and get a day-by-day plan. Each topic is learned once and reviewed on a spaced schedule, with a final pass before the exam. The plan is computed in your browser, not by a model.",
    cluster: "study",
    kind: "local",
    fields: [
      { id: "topics", label: "Topics, one per line (put * before a topic you find hard)", kind: "textarea", required: true, max: 2000, rows: 6, placeholder: "Cell structure\n*Photosynthesis\nGenetics\n*Evolution" },
      { id: "exam", label: "Exam date", kind: "date", required: true },
      { id: "hours", label: "Hours per week", kind: "number", required: true, placeholder: "6" },
      { id: "days", label: "Study days per week", kind: "select", options: [{ value: "5", label: "5" }, { value: "6", label: "6" }, { value: "7", label: "7" }] },
    ],
    action: "Build my plan",
    steps: ["List the topics and mark the hard ones with an asterisk.", "Enter the exam date, the hours you can study each week and how many days a week.", "The plan spreads first study across the early days, schedules each topic's reviews two and five days later, and keeps the last days for a full review, weak topics first."],
    output: ["A day-by-day table: date, what to study, minutes, and whether it is first study or review.", "Spaced reviews for every topic, so nothing is learned once and forgotten.", "More time for the topics you marked as hard.", "Totals per week and a warning if the hours do not cover the material."],
    examples: [{ title: "Four topics, three weeks", input: { topics: "Cell structure\n*Photosynthesis\nGenetics\n*Evolution", hours: "6", days: "6" } }],
    faq: [
      { q: "How does it decide the schedule?", a: "First study of each topic is spread across the first part of the time, in proportion to its weight (hard topics count double). Each topic is reviewed about two days and five days after first study, and the final days are a full review with hard topics first." },
      { q: "Can it adapt as I go?", a: "This tool computes a fixed plan from your inputs; rerun it with a new date or fewer topics. Study mode in the app tracks what you miss and brings those cards back sooner." },
      { q: "Is anything sent to a server?", a: "No. The plan is calculated in your browser. Nothing you type leaves your device." },
    ],
    product: { href: "/app/study", label: "Study with Keplar", why: "Study mode builds flashcards and quizzes from your material and schedules reviews from what you actually miss." },
    related: ["/ai-study-tool", "/docs/using-keplar/study-mode", "/guides/study-from-a-pdf", "/use-cases/study-for-an-exam"],
    updated: "2026-10-19",
  },
];

/** Per-IP allowance of /api/tools/run, on top of the chat pipeline's own Free limits. */
export const TOOL_RUN_LIMITS = { perMinute: 4, perDay: 25 } as const;

export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
export const TOOLS_HUB = "/tools";
export const toolPath = (t: Tool) => `${TOOLS_HUB}/${t.slug}`;
export const toolPaths = () => [TOOLS_HUB, ...TOOLS.map(toolPath)];
