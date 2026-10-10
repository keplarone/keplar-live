/**
 * Follow-up resolution: a short message that only makes sense against the conversation so far.
 *
 *   "is AI going to kill everyone in the next decade"  →  "according to anthropic"
 *       → "According to Anthropic, is AI going to kill everyone in the next decade?"
 *   "do deep research on x"  →  "twitter"            → "Do deep research on Twitter/X."
 *   "how much money does elon musk have liquid"  →  "what is is net worth"  →  "elon"
 *       → "What is Elon Musk's net worth?" (twice: the typo'd pronoun, then the name fragment confirming who)
 *
 * Without this, each of those was read as a brand-new question and answered with an encyclopedia card ("I'm reading "elon" as a
 * request for a quick overview of elon"). The prior user turns are replayed in order, each one resolved against the ones before it,
 * so a chain of fragments ("what is is net worth" then "elon") still lands on the right question.
 *
 * Pure: no network, no model. Returns null whenever the message stands on its own or the conversation gives no clear referent;
 * the caller then keeps its usual handling. It never invents a subject: every name in a rewrite was typed by the person.
 */

export type Turn = { role: "user" | "keplar"; text: string };

export type FollowupKind = "source" | "pronoun" | "subject" | "attribute";

export type Followup = {
  kind: FollowupKind;
  /** The effective question, written out in full ("What is Elon Musk's net worth?"). */
  question: string;
  /** The subject the question is about, as displayed ("Elon Musk"), when there is one. */
  subject: string | null;
  /** The question continues a Deep Research request. */
  deep: boolean;
  /** The earlier question this one continues (as resolved), for the guidance block. */
  previous: string;
};

/* ───────────────────────────── text helpers ───────────────────────────── */

/** Lowercase, straight quotes, single spaces, no trailing punctuation; keeps apostrophes. Fixes a few common chat typos. */
export function tidy(text: string): string {
  return ` ${text} `
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, " ")
    .replace(/[“”"]/g, " ")
    .replace(/[^\p{L}\p{N}\s'/.,-]/gu, " ")
    .replace(/[.,]+(?=\s)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ (?:wat|wht|whut) /g, " what ")
    .replace(/ (?:whats|what's|wats) /g, " what is ")
    .replace(/ (?:hows|how's) /g, " how is ")
    .replace(/ (?:whos|who's) /g, " who is ")
    .replace(/ (?:u) /g, " you ")
    .replace(/ (?:hes|hiz|hs) (?=net worth|age|wife|money|salary|income|company|companies|kids|children)/g, " his ")
    // "what is is net worth" / "how much is is net worth": a doubled "is" before an attribute is a typo for "his"
    .replace(/ (is|was) is (?=[a-z])/g, " $1 his ")
    .trim();
}

const ACRONYMS = new Set(["ai", "agi", "asi", "us", "usa", "uk", "eu", "un", "nasa", "fbi", "cia", "ceo", "ibm", "nba", "nfl", "gdp", "x", "xai", "tsla", "spacex", "llm", "llms", "ml"]);
const SPECIAL: Record<string, string> = { "twitter/x": "Twitter/X", "x/twitter": "X/Twitter", spacex: "SpaceX", openai: "OpenAI", xai: "xAI", tsla: "TSLA", deepmind: "DeepMind", youtube: "YouTube", tiktok: "TikTok", iphone: "iPhone", chatgpt: "ChatGPT", llms: "LLMs" };
const LOWER = new Set(["of", "the", "and", "de", "van", "von", "da", "on", "in", "for", "a", "an"]);

/** "elon musk" → "Elon Musk", "ai" → "AI", "x" → "X". */
export function display(phrase: string): string {
  return phrase
    .trim()
    .split(/\s+/)
    .map((w, i) => (SPECIAL[w] ? SPECIAL[w] : ACRONYMS.has(w) ? w.toUpperCase() : i > 0 && LOWER.has(w) ? w : w.replace(/^\p{L}/u, (c) => c.toUpperCase())))
    .join(" ");
}

const cap = (s: string) => s.replace(/^\s*\p{L}/u, (c) => c.toUpperCase());
const endQ = (s: string) => (/[?.!]$/.test(s.trim()) ? s.trim() : /^(?:do|tell|give|explain|write|research|describe|summari[sz]e|list)\b/i.test(s.trim()) ? `${s.trim()}.` : `${s.trim()}?`);
const lowerFirst = (s: string) => s.replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase());
const possessive = (s: string) => (/s$/i.test(s) ? `${s}'` : `${s}'s`);

/** Pronouns and placeholders that stand for "the thing we were talking about". */
const PLACEHOLDER = /^(?:it|this|that|him|her|them|he|she|they|something|someone|somebody|stuff|things?|a topic|some topic|the topic|the thing|this topic|that topic|[a-z])$/;
const PERSONAL = /\b(his|her|hers|he|she|him|their|theirs|they|them)\b/;

/** Words that start a request or question; a message beginning with one is not a bare name. */
const NOT_A_NAME = new Set(
  "what how why who when where which can could would should will do does did is are was were am write make create build fix explain tell show give list translate summarize define help solve calculate draw generate please thanks thank yes no ok okay sure hi hey hello stop cancel retry again more continue next yeah nope hmm test testing find search look check compare plan design code run open close add remove delete update set get let lets i im i'm my me you your we our it its this that these those there here so and but or not never always maybe".split(" "),
);
const STOP_TAIL = /\b(?:is|are|was|were|do|does|did|the|a|an|to|of|in|on|for|with|and|or|but)$/;

/** A short noun phrase that could be a name or topic: 1-4 plain words, not a request. */
export function bareName(t: string): string | null {
  const p = t.replace(/^(?:the|a|an)\s+/, "").replace(/\s+(?:please|pls|i mean|i meant|lol)$/, "").replace(/^(?:i mean|i meant|meant|no|nope|sorry|um|uh|oh|ah)\s+/, "").trim();
  const words = p.split(" ");
  if (!p || words.length > 4) return null;
  if (NOT_A_NAME.has(words[0]) || STOP_TAIL.test(p)) return null;
  if (!words.every((w) => /^[\p{L}][\p{L}\p{N}'/.-]{0,30}$/u.test(w))) return null;
  return p;
}

/** Two names refer to the same thing: one contains the other word for word ("elon" / "elon musk"), or a known rename (Twitter / X). */
const ALIASES: readonly (readonly string[])[] = [["twitter", "x", "x com", "x.com", "twitter/x", "x/twitter"], ["facebook", "meta"], ["google", "alphabet"]];
const aliasGroup = (s: string) => ALIASES.find((g) => g.includes(s.replace(/^the\s+/, "")));
export function sameReferent(a: string, b: string): boolean {
  const x = a.replace(/'s$/, "").trim(), y = b.replace(/'s$/, "").trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const ga = aliasGroup(x);
  if (ga && ga === aliasGroup(y)) return true;
  if (x.length < 3 || y.length < 3) return false;
  const wa = x.split(" "), wb = y.split(" ");
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.every((w) => long.includes(w));
}

/** The name to use once two forms are known to be the same thing: the fuller one, and "Twitter/X" for the rename. */
function merged(a: string, b: string): string {
  const g = aliasGroup(a) ?? aliasGroup(b);
  if (g && g[0] === "twitter") return "Twitter/X";
  return display(a.split(" ").length >= b.split(" ").length ? a : b);
}

/* ───────────────────────────── frames ───────────────────────────── */

/** A question shape with a slot for its subject, so the subject can be swapped or confirmed later. */
type Frame = { subject: string; build: (subjectDisplay: string) => string; deep?: boolean; overview?: boolean };

const ATTRIBUTE = "net worth|networth|worth|wealth|fortune|salary|income|age|height|weight|birthday|wife|husband|partner|girlfriend|boyfriend|kids|children|family|parents|nationality|religion|education|address|phone number|email|ceo|founder|owner|headquarters|stock price|share price|stock|market cap|valuation|revenue|profit|population|capital|gdp|president|leader|religion|biggest achievement|achievements|companies|company|business|job|career|house|houses|car|cars|plane|jet";
const RX_ATTR = new RegExp(`^(?:${ATTRIBUTE})$`);
const RESEARCH = "(?:deep|in depth|in-depth|thorough|detailed|full|proper|serious)\\s+(?:research|dive|analysis|report|investigation|look)";

const FRAMES: readonly ((t: string) => Frame | null)[] = [
  // "do deep research on x", "can you deep dive into twitter", "deep research about tesla"
  (t) => {
    const m = t.match(new RegExp(`^(?:(?:can|could|would|will) you\\s+|please\\s+|pls\\s+|i (?:want|need) you to\\s+|i (?:want|need)\\s+|let's\\s+|lets\\s+)?(?:do|run|start|make|conduct|perform|give me|write|go)?\\s*(?:a |an |some |me a )?${RESEARCH}\\s+(?:on|into|about|of|for|in)\\s+(.{1,80})$`))
      ?? t.match(/^(?:research|deep research|deep dive|investigate|look into)\s+(?:on\s+|into\s+|about\s+)?(.{1,80})$/);
    if (!m) return null;
    return { subject: m[1].trim(), deep: true, build: (s) => `Do deep research on ${s}` };
  },
  // "how much money does elon musk have liquid", "how rich is elon musk"
  (t) => {
    const m = t.match(/^how (?:much|rich)(?: money| cash| wealth)? (?:does|do|did|has|have) (.+?) (?:have|has|got|make|earn|own|made|earned|worth)(?:\s+(.{1,40}))?$/);
    if (m) {
      const rest = (m[2] ?? "").trim();
      const tail = rest === "liquid" || rest === "in liquid" ? " in liquid assets" : rest ? ` ${rest}` : "";
      return { subject: m[1], build: (s) => `How much money does ${s} have${tail}` };
    }
    const r = t.match(/^how (rich|wealthy|old|tall|famous|powerful) (?:is|was|are) (.+)$/);
    if (r) return { subject: r[2], build: (s) => `How ${r[1]} is ${s}` };
    return null;
  },
  // "what is elon musk's net worth", "what is his net worth", "the net worth of elon", "elon musk net worth"
  (t) => {
    let m = t.match(new RegExp(`^(?:what is|what was|what are|how much is|tell me|and|so)?\\s*(.+?)(?:'s|')? (${ATTRIBUTE})$`));
    if (m && m[1] && !/^(?:the|a|what is|what are)$/.test(m[1])) {
      const attr = m[2] === "networth" ? "net worth" : m[2];
      return { subject: m[1].replace(/^(?:what is|what are)\s+/, ""), build: (s) => `What is ${possessive(s)} ${attr}` };
    }
    m = t.match(new RegExp(`^(?:what is|what was|how much is|tell me)?\\s*(?:the )?(${ATTRIBUTE}) of (.+)$`));
    if (m) {
      const attr = m[1] === "networth" ? "net worth" : m[1];
      return { subject: m[2], build: (s) => `What is ${possessive(s)} ${attr}` };
    }
    return null;
  },
  // "is AI going to kill everyone in the next decade", "is elon musk projected to die in the next 400 years"
  (t) => {
    const m = t.match(/^(is|are|was|were) (.+?) (going to|gonna|projected to|expected to|likely to|predicted to|set to|about to|ever going to|ever gonna|supposed to|able to|really going to) (.+)$/);
    if (!m) return null;
    const verb = m[3] === "gonna" ? "going to" : m[3] === "ever gonna" ? "ever going to" : m[3];
    return { subject: m[2], build: (s) => `${cap(m[1])} ${s} ${verb} ${m[4]}` };
  },
  // "will ai take over", "does elon own twitter", "can ai kill us": only when the subject is short and names something
  (t) => {
    const m = t.match(/^(will|does|did|can|could|has|have) ((?:[a-z][\w'-]*)(?: [a-z][\w'-]*)?) (take|kill|own|replace|destroy|end|become|win|beat|have|make|run|control|wipe|surpass|overtake|buy|sell|lose|die|rule|go|cause|lead|leave|support|oppose|hate|love|believe|think|say|said|want|plan|plans) (.+)$/);
    if (!m || NOT_A_NAME.has(m[2].split(" ")[0])) return null;
    return { subject: m[2], build: (s) => `${cap(m[1])} ${s} ${m[3]} ${m[4]}` };
  },
  // "tell me about claude", "who is sam altman": an overview frame (a new name after it is a new topic, not a substitution)
  (t) => {
    const m = t.match(/^(?:tell me about|tell me more about|who is|who was|who are|what is|what are|explain|info on|overview of|define)\s+(.{1,60})$/);
    if (!m || m[1].split(" ").length > 5) return null;
    return { subject: m[1], overview: true, build: (s) => `Tell me about ${s}` };
  },
];

function frameOf(t: string): Frame | null {
  for (const f of FRAMES) {
    const hit = f(t);
    if (hit && hit.subject.trim()) return { ...hit, subject: hit.subject.trim().replace(/^the\s+(?=\S+\s+\S)/, "") };
  }
  return null;
}

/* ───────────────────────────── the walk ───────────────────────────── */

type State = { question: string | null; subject: string | null; frame: Frame | null; deep: boolean; keplarAsked: boolean };

/** Keplar's last reply asked which thing was meant (not just a closing "want me to...?" offer). */
const CLARIFYING = /\b(?:which (?:one|of (?:these|them|those))|do you mean|did you mean|are you (?:asking|referring|talking) about|could you (?:clarify|specify)|can you (?:clarify|specify)|what (?:topic|subject) (?:do|would) you|who do you mean|what do you mean by|which [\w\s]{1,30}(?:do you|did you|are you))\b/i;

const SOURCE_LEAD = /^(?:(?:and|but|ok|okay|so|well|no|hmm)\s+)?(?:according to|per|says|in the (?:view|opinion|words) of|from the (?:view|perspective|point of view) of|from (?:the )?perspective of|as per)\s+(.{2,60})$/;
const SOURCE_ASK = /^(?:(?:and|but|ok|okay|so|well)\s+)?(?:what (?:does|do|did|would|has|have)|how (?:does|do|did|would)|what is|what's)\s+(.{2,50}?)(?:'s)?\s+(?:say|think|believe|predict|claim|expect|estimate|forecast|position|view|take|stance|opinion|answer)(?:\s+(?:on|about|of)\s+(?:it|that|this|the question|this question))?$/;
const SWAP_LEAD = /^(?:(?:and|but|ok|okay|so|now)\s+)?(?:what about|how about|what of|and for|same for|same question for|same but for|now do|do the same for|ok now|and)\s+(.{1,60})$/;

/** Resolve one message against the state built from the turns before it. */
function resolveOne(raw: string, s: State): Followup | null {
  if (!s.question) return null;
  const t = tidy(raw);
  if (!t || t.split(" ").length > 14) return null;
  const prev = s.question;
  const prevFrame = s.frame;

  // 1 · "according to anthropic", "what does anthropic say": the same question, from that source's point of view
  const src = t.match(SOURCE_LEAD) ?? t.match(SOURCE_ASK);
  if (src) {
    const who = src[1].replace(/'s$/, "").trim();
    const core = who.replace(/^(?:the|a|an)\s+/, "");
    if (core && !PLACEHOLDER.test(core) && core.split(" ").length <= 5 && !NOT_A_NAME.has(core.split(" ")[0]) && !/^(?:the|a|an)$/.test(core)) {
      const named = core === who ? display(who) : `the ${display(core)}`;
      const q = `According to ${named}, ${lowerFirst(endQ(prev.replace(/^According to [^,]+, /, "")))}`;
      return { kind: "source", question: q, subject: s.subject ? display(s.subject) : null, deep: s.deep, previous: prev };
    }
  }

  // 2 · pronouns: "what is his net worth", "how did he get rich" (a message that names its own subject is left alone)
  if (s.subject && PERSONAL.test(t) && t.split(" ").length <= 10) {
    const own = frameOf(t);
    if (!own || PLACEHOLDER.test(own.subject) || PERSONAL.test(own.subject)) {
      const name = display(s.subject);
      const out = t
        .replace(/\b(?:his|her|hers|their|theirs)\b(?=\s+\w)/g, possessive(name))
        .replace(/\b(?:he|she|they|him|them|his|her|hers|their|theirs)\b/g, name);
      if (out !== t) {
        const f = frameOf(out);
        return { kind: "pronoun", question: endQ(cap(f ? f.build(name) : out)), subject: name, deep: s.deep, previous: prev };
      }
    }
  }

  // 3 · an attribute with no subject: "net worth", "what is the net worth", "and his age" (handled above), "how old"
  const attr = t.replace(/^(?:what is|what about|and|how about|the|so)\s+/, "").replace(/^(?:the|its)\s+/, "").replace(/\?$/, "");
  if (s.subject && RX_ATTR.test(attr)) {
    const name = display(s.subject);
    const a = attr === "networth" || attr === "worth" ? "net worth" : attr;
    return { kind: "attribute", question: `What is ${possessive(name)} ${a}?`, subject: name, deep: s.deep, previous: prev };
  }
  const how = t.match(/^how (old|tall|rich|wealthy)(?: is)?$/);
  if (s.subject && how) {
    const name = display(s.subject);
    return { kind: "attribute", question: `How ${how[1]} is ${name}?`, subject: name, deep: s.deep, previous: prev };
  }

  // 4 · "what about bill gates": the same question about someone else
  const swap = t.match(SWAP_LEAD);
  if (swap && prevFrame && !prevFrame.overview) {
    const name = bareName(swap[1]);
    if (name && !PLACEHOLDER.test(name)) {
      const disp = sameReferent(name, prevFrame.subject) ? merged(name, prevFrame.subject) : display(name);
      return { kind: "subject", question: endQ(cap(prevFrame.build(disp))), subject: disp, deep: Boolean(prevFrame.deep), previous: prev };
    }
  }

  // 5 · a bare name: "elon", "twitter"
  const name = bareName(t);
  if (!name) return null;
  if (RX_ATTR.test(name)) return null;
  // 5a · it names what we were already talking about ("elon" after a question about Elon Musk): the person is confirming the subject
  if (s.subject && sameReferent(name, s.subject)) {
    const disp = merged(name, s.subject);
    const q = prevFrame && !prevFrame.overview ? endQ(cap(prevFrame.build(disp))) : prev;
    if (prevFrame?.overview) return null; // "tell me about elon" then "elon": nothing to continue, an overview is right
    return { kind: "subject", question: q, subject: disp, deep: s.deep, previous: prev };
  }
  // 5b · the last question had a placeholder subject ("do deep research on x"), or was a Deep Research request, or Keplar just asked
  //      which one was meant: the name fills the slot
  if (prevFrame && !prevFrame.overview && (PLACEHOLDER.test(prevFrame.subject) || prevFrame.deep || s.keplarAsked)) {
    const disp = sameReferent(name, prevFrame.subject) ? merged(name, prevFrame.subject) : display(name);
    return { kind: "subject", question: endQ(cap(prevFrame.build(disp))), subject: disp, deep: Boolean(prevFrame.deep), previous: prev };
  }
  return null;
}

/** The state after one user turn: what was asked (as resolved) and what it was about. */
function advance(s: State, text: string, resolved: Followup | null): State {
  if (resolved) {
    const f = frameOf(tidy(resolved.question.replace(/^According to [^,]+, /, "")));
    return { question: resolved.question, subject: resolved.subject ? tidy(resolved.subject) : s.subject, frame: f ?? s.frame, deep: resolved.deep || Boolean(f?.deep), keplarAsked: false };
  }
  const t = tidy(text);
  const f = frameOf(t);
  if (f) {
    const keepOld = PLACEHOLDER.test(f.subject) || PERSONAL.test(f.subject);
    return { question: endQ(cap(f.build(display(f.subject)))), subject: keepOld ? s.subject ?? f.subject : f.subject, frame: f, deep: Boolean(f.deep), keplarAsked: false };
  }
  // A message we can't parse still counts as the latest question; a bare name becomes the subject.
  const name = bareName(t);
  const words = t.split(" ").length;
  if (words < 3 && !name) return { ...s, keplarAsked: false };
  // A new, unparsed question moves the conversation on: an old subject only carries over when this one points back at it.
  const subject = name ?? (PERSONAL.test(t) ? s.subject : null);
  return { question: endQ(cap(text.trim())), subject, frame: null, deep: false, keplarAsked: false };
}

/** Replays the last few turns (oldest first): each user turn resolved against the ones before it. */
function replay(history: readonly Turn[]): State & { users: number } {
  const turns = history.filter((h) => h && typeof h.text === "string" && h.text.trim()).slice(-12);
  let s: State = { question: null, subject: null, frame: null, deep: false, keplarAsked: false };
  let users = 0;
  for (const turn of turns) {
    if (turn.role === "user") {
      users++;
      const text = turn.text.trim().slice(0, 300);
      s = advance(s, text, text.length <= 160 ? resolveOne(text, s) : null);
    } else {
      const k = turn.text.trim();
      s = { ...s, keplarAsked: k.length < 600 && /\?\s*$/.test(k) && CLARIFYING.test(k) };
    }
  }
  return { ...s, users };
}

/**
 * Resolve the latest message against the conversation. Looks at the last few user turns and whether Keplar's last reply asked which
 * thing was meant. Returns null when the message stands on its own.
 */
export function resolveFollowup(prompt: string, history: readonly Turn[] = []): Followup | null {
  const raw = (prompt ?? "").trim();
  if (!raw || raw.length > 160) return null;
  const s = replay(history);
  if (!s.users) return null;
  return resolveOne(raw, s);
}

/** The rewritten prompt handed to the models: the effective question, plus how it was read. */
export function followupPrompt(f: Followup, typed: string): string {
  const said = typed.replace(/\s+/g, " ").trim().slice(0, 80);
  const lines = [f.question, ""];
  lines.push(`(Context: in the conversation above, the person's latest message was "${said}", which continues the earlier question "${f.previous.slice(0, 200)}". Answer the question above directly, in that context. Do not give a general overview of "${said}" or explain what the word means.)`);
  if (f.kind === "source") lines.push(`(Report what that source has actually said publicly, quoting or paraphrasing specific statements where you can, and keep it separate from other views. If you do not know of a statement on exactly this, say so plainly instead of guessing. Do not describe the source itself beyond a phrase.)`);
  if (f.deep) lines.push(`(This continues a Deep Research request: give a thorough, well-structured research answer on the clarified subject: background, the key facts and numbers, recent developments, competing views and open questions, and say where the evidence is thin.)`);
  return lines.join("\n");
}

/** One plain line for the reasoning summary: how the message was read. */
export function followupRead(f: Followup, typed: string): string {
  return `Going by the conversation, I took "${typed.replace(/\s+/g, " ").trim().replace(/[?!.]+$/, "").slice(0, 60)}" to mean: ${f.question}`;
}

/** The last user question in the conversation, as resolved, and whether it was an overview ("tell me about X"). Null with no user turn. */
export function previousQuestion(history: readonly Turn[] = []): { question: string; overview: boolean } | null {
  const s = replay(history);
  if (!s.users || !s.question) return null;
  return { question: s.question, overview: Boolean(s.frame?.overview) };
}
