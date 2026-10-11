/**
 * Chat titles: what the conversation is ABOUT, in two to five neutral words, never the person's message copied.
 * Pure and client-safe. `topicTitle` is the instant, free fallback (also what runs when no model is available);
 * `cleanModelTitle` vets a title written by a free model; `modelEligible` says whether a model may even see the message.
 *  - self-harm or crisis talk  -> "Support"; low mood -> "Feeling low"; stress -> "Feeling stressed"
 *  - insults / profanity with no real topic -> "Casual chat"; profanity inside a real topic is dropped
 *  - questions about Keplar itself (conscious, human, who made you ...) -> "About Keplar"
 *  - greetings and thanks -> "Casual chat"; "what is my name" -> "Your name"; "my name is ..." -> "Introductions"
 * Messages in the sensitive groups never go to a model: they get these fixed titles.
 */
export const MAX_TITLE_CHARS = 36;
export const MAX_TITLE_WORDS = 5;

const CRISIS = /\b(kill(ing)? (my ?self|me)|suicid\w*|end(ing)? (my|this) life|want(ed)? to (die|be dead)|wanna die|don'?t want to (live|be alive|be here)|(hurt|harm|cut)(ting)? my ?self|self[- ]?harm\w*|no reason to (live|go on)|better off (dead|without me)|take my own life|not worth living)\b/i;
const LOW_MOOD = /\b(depress\w*|hopeless|worthless|lonely|so sad|feel(ing)? (sad|down|empty|numb|alone|low)|i'?m (sad|down|empty|miserable)|crying|heartbroken|grie(f|ving))\b/i;
const STRESS = /\b(stress\w*|anxi\w*|overwhelm\w*|panic\w*|burn(ed|t)? ?out|can'?t cope|worried sick)\b/i;
const PROFANITY = /\b(f+u+c+k\w*|sh[i1]+t\w*|b[i1]tch\w*|cunt\w*|assh?ole\w*|bastard\w*|d[i1]ck(head)?s?|p[i1]ss\w*|slut\w*|wh[o0]re\w*|retard\w*|n[i1]gg\w*|fagg?\w*|motherf\w*|bullshit|wtf|stfu|crap\w*|damn\w*|douche\w*|twat\w*|wank\w*|prick)\b/gi;
const INSULT = new Set("you your youre stupid idiot idiots dumb useless trash garbage worst suck sucks hate hated shut up loser moron pathetic terrible awful bad bot ai robot piece of".split(" "));
const ABOUT_KEPLAR = /\b(are you (a |an )?(conscious|sentient|alive|human|real|person|robot|bot|ai|self[- ]?aware|intelligent|a human|a real)|do you (have|feel) (feelings|emotions|consciousness)|who (are|made|created|built|developed|owns|trained) you|who (made|created|built|founded|developed|owns|started) keplar|who is behind (you|keplar)|what are you|what is keplar|who is keplar|what'?s keplar|your name|are you (chat ?gpt|gpt|claude|gemini|grok)|which (model|llm) are you|what model are you|are you (real|there))\b/i;
const OWN_NAME = /\b(what('?s| is) my name|do you (know|remember) my name|who am i|what do you (know|remember) about me|do you remember me)\b/i;
const INTRO = /^(hi|hello|hey)?[\s,!.]*(my name is|i'?m called|i am called|call me|this is)\b/i;
const GREETING = /^(hi+|hello+|hey+|hiya|yo|sup|good (morning|afternoon|evening|night)|thanks?( you)?|thank you|ty|bye|goodbye|see you|how are you|how'?s it going|what'?s up|ok(ay)?|cool|nice|lol|test(ing)?)[\s!.?,]*$/i;

const STOP = new Set((
  "a an the is are was were be been being am do does did to of in on at for with about my me i you your it its this that these those please can could would should will shall " +
  "just really very some any there here have has had get got want need like know tell show give let let's lets what whats what's how why who whom where when which whose also then so " +
  "if as by from into up out over than too much many more most make makes making use using i'm i've i'd i'll we our us they them their he she him her his hers or but not no yes " +
  "hey hi hello ok okay um uh well maybe kindly pls plz thanks thank anyone someone something anything everything best way ways good new " +
  // filler that never names a topic
  "thing things stuff").split(" "));
/** A title that is only one of these says nothing ("what about this one?" was titled "One"). */
const VAGUE = /^(one|ones|it|this|that|these|those|question|questions|bit|part|interesting)$/i;
/** Fenced code: its language names the chat ("```js … ``` why does this fail" was titled "Js"). */
const FENCE = /```\s*([\w#+.-]*)[^\n]*\n?[\s\S]*?(?:```|$)/g;
const LANGS: Record<string, string> = { js: "JavaScript", javascript: "JavaScript", jsx: "JavaScript", ts: "TypeScript", typescript: "TypeScript", tsx: "TypeScript", py: "Python", python: "Python", rb: "Ruby", ruby: "Ruby", go: "Go", rs: "Rust", rust: "Rust", java: "Java", kt: "Kotlin", swift: "Swift", c: "C", cpp: "C++", "c++": "C++", cs: "C#", csharp: "C#", php: "PHP", sql: "SQL", sh: "Shell", bash: "Shell", html: "HTML", css: "CSS", json: "JSON", yaml: "YAML", lua: "Luau", luau: "Luau" };
const LEAD = /^(?:(?:please|pls|hey|hi|hello|ok|okay|so|um|kindly|yo)\b[\s,]*)+/i;
const URLISH = /^(https?:|www\.)|@|^\d{5,}$|^[\w.-]+\.(com|org|net|io|ai|co|app|dev)\b/i;

// % $ € £ ° ^ stay: "What is 15% of 240?" was titled "15 240" and "x^3" became "x 3".
const words = (s: string) => s.replace(/https?:\/\/\S+/gi, " ").replace(/[^\p{L}\p{N}'’&+#./@:%$€£°^-]+/gu, " ").split(/\s+/).filter(Boolean);

function fit(tokens: string[]): string {
  const out: string[] = [];
  for (const t of tokens.slice(0, MAX_TITLE_WORDS)) {
    const next = [...out, t].join(" ");
    if (next.length > MAX_TITLE_CHARS) break;
    out.push(t);
  }
  while (out.length && /^(and|vs|or)$/i.test(out[out.length - 1])) out.pop();
  const s = out.join(" ").replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}+#%°]+$/gu, "");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

export type TitleKind = "crisis" | "low" | "stress" | "abuse" | "about" | "name" | "intro" | "greeting" | "topic";

/** Which group the first message falls in. Everything but "topic" is answered with a fixed neutral title and never reaches a model. */
export function titleKind(question: string): TitleKind {
  const q = question.replace(/\s+/g, " ").trim();
  if (CRISIS.test(q)) return "crisis";
  if (GREETING.test(q)) return "greeting";
  const stripped = q.replace(PROFANITY, " ");
  if (stripped.length !== q.length || PROFANITY.test(q)) {
    PROFANITY.lastIndex = 0;
    const rest = words(stripped.toLowerCase()).filter((w) => !INSULT.has(w) && !STOP.has(w));
    if (rest.length < 1) return "abuse";
  }
  PROFANITY.lastIndex = 0;
  if (OWN_NAME.test(q)) return "name";
  if (INTRO.test(q)) return "intro";
  if (ABOUT_KEPLAR.test(q)) return "about";
  if (LOW_MOOD.test(q)) return "low";
  if (STRESS.test(q) && q.split(" ").length <= 14) return "stress";
  return "topic";
}

const FIXED: Record<Exclude<TitleKind, "topic">, string> = {
  crisis: "Support", low: "Feeling low", stress: "Feeling stressed", abuse: "Casual chat", about: "About Keplar", name: "Your name", intro: "Introductions", greeting: "Casual chat",
};

/** May a model see this message to write the title? Only plain topics. */
export const modelEligible = (question: string) => titleKind(question) === "topic";

/** The instant title: fixed for the sensitive groups, otherwise the first few content words with profanity, links, emails and long numbers left out. */
export function topicTitle(question: string): string {
  const kind = titleKind(question);
  if (kind !== "topic" && kind !== "abuse") return FIXED[kind];
  if (kind === "abuse") return FIXED.abuse;
  // Code blocks are content, not the topic: title from the words around them, named by the language.
  let lang = "";
  let hadCode = false;
  const prose = question.replace(FENCE, (_, l: string) => { hadCode = true; lang ||= LANGS[l.toLowerCase()] ?? ""; return " "; }).trim();
  if (hadCode) {
    const around = prose ? topicTitle(prose) : "Quick question";
    const label = `${lang || "Code"} ${lang ? "code" : "help"}`;
    const lower = (w: string) => (w.length > 1 && w === w.toUpperCase() ? w : w[0].toLowerCase() + w.slice(1));
    if (around === "Quick question" || around === "Casual chat") return label;
    if (lang && around.toLowerCase().split(" ").includes(lang.toLowerCase())) return around;
    return lang ? fit([lang, ...around.split(" ").map((w, i) => (i ? w : lower(w)))]) : around;
  }
  // A message that is only a link: name the site.
  const link = /^\s*(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:[/?#]\S*)?\s*$/i.exec(question);
  if (link) return fit([link[1].toLowerCase(), "link"]);
  let q = question.split(/(?<=[.!?])\s+|\n/)[0].replace(PROFANITY, " ");
  PROFANITY.lastIndex = 0;
  q = q.replace(LEAD, "").replace(/^(?:what|how|why|who|where|when|which)(?:['’]s)?\s+(?:(?:is|are|was|were|do|does|did|can|could|would|should|to|many|much)\b)?\s*(?:(?:i|we|you|the)\b)?\s*/i, "");
  const toks = words(q).filter((w) => !URLISH.test(w) && !/^[%$€£°^]+$/.test(w));
  const kept: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    const lw = w.toLowerCase();
    if (lw === "and" || lw === "vs" || lw === "versus" || lw === "or") {
      if (kept.length && toks[i + 1] && !STOP.has(toks[i + 1].toLowerCase())) kept.push(lw === "versus" ? "vs" : lw);
      continue;
    }
    // "of" between two numbers is the math ("15% of 240"), not filler.
    if (lw === "of" && kept.length && /\d/.test(kept[kept.length - 1]) && /\d/.test(toks[i + 1] ?? "")) {
      kept.push(lw);
      continue;
    }
    if (STOP.has(lw)) continue;
    kept.push(w.length > 3 && w === w.toUpperCase() && !/\d/.test(w) && w.length > 5 ? w[0] + w.slice(1).toLowerCase() : w);
  }
  const title = fit(kept);
  return title && !VAGUE.test(title) ? title : "Quick question";
}

/** Vet a title a model wrote: returns the cleaned title, or null (then the caller uses `topicTitle`). */
export function cleanModelTitle(raw: unknown, question: string): string | null {
  if (typeof raw !== "string") return null;
  let t = raw.replace(/^[\s"'“”‘’`*#-]*(title\s*[:\-]\s*)?/i, "").split("\n")[0].replace(/["“”`*#]+/g, "").replace(/[.!?:;,\s]+$/, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const toks = t.split(" ");
  if (toks.length < 1 || toks.length > MAX_TITLE_WORDS || t.length > MAX_TITLE_CHARS) return null;
  PROFANITY.lastIndex = 0;
  if (PROFANITY.test(t) || CRISIS.test(t) || LOW_MOOD.test(t)) { PROFANITY.lastIndex = 0; return null; }
  PROFANITY.lastIndex = 0;
  if (toks.some((w) => URLISH.test(w))) return null;
  if (/\b(as an ai|i cannot|i can'?t|sorry|here is|here'?s)\b/i.test(t)) return null;
  // Not the message copied back (a long question repeated word for word is not a topic).
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (norm(question).length > t.length + 12 && norm(question).startsWith(norm(t))) return null;
  t = t[0].toUpperCase() + t.slice(1);
  return t;
}

/** The title the app used to give a new chat: the first message itself, shortened. Chats still carrying it get a topic title. */
export const legacyTitle = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 56 ? `${t.slice(0, 54).trimEnd()}…` : t;
};
