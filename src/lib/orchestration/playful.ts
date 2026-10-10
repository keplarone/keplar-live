/**
 * Playfulness: jokes, riddles, puns, knock-knock, banter. Understanding intent "playful" (understand.ts).
 *
 * "knock knock" used to get an overview of the joke format and "what do you call a white fish" a lesson on cooking. A person who
 * plays wants a partner, not an explanation: short, quick, with a real laugh in it, one fast free model (never a panel, no sections,
 * no "Details"), and no charge. Three layers, all decided here in code before any model is called:
 *
 *   1. Knock-knock is a game with turns. It is a small state machine read from the conversation itself (the last Keplar turn says
 *      which step we are on), so it needs no stored state and survives a reload: "Knock knock" -> "Who's there?"; Keplar leads with
 *      "Knock knock." -> "Who's there?" -> "Lettuce." -> "Lettuce who?" -> the punchline; the person leads and Keplar asks "<name> who?"
 *      and then reacts to their punchline. Every one of these replies is fixed text: instant, no model.
 *   2. Classic riddles and one-liners with a known punchline ("why did the chicken cross the road", "what do you call a fake noodle")
 *      are answered from a table (typos and loose wording tolerated), also instantly.
 *   3. Everything else playful (a new setup like "what do you call a white fish", "tell me a joke", "make me laugh", "write a joke
 *      about cats", "that was terrible") goes to ONE fast free model with a playful voice, short answers only. If every model is busy a
 *      curated line is used, so a joke never turns into an error.
 */
import { normalizeGuard } from "./identity-guards";
import { smallTalkModels, firstClean, cleanSmallTalk } from "./smalltalk";
import type { createRegistry } from "./providers";
import type { Classification, KeplarAnswer, KeplarEvent, KeplarRequest, ModelSpec } from "./types";
import { identityPrompt } from "@/lib/identity";
import { guardVoice } from "@/lib/persona";
import { HUMAN_TONE_SHORT, polish } from "@/lib/persona-tone";

type Turn = { role: "user" | "keplar"; text: string };

export type PlayKind = "knock" | "joke" | "riddle" | "banter";
export type PlayRead = { kind: PlayKind; /** Set: reply with exactly this, no model. */ fixed?: string; /** For the model: what is being asked. */ hint?: string };

/* ───────────────────────────── helpers ───────────────────────────── */

function osa(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
/** Same word, allowing typos (1 for 4-6 letters, 2 for longer). */
const near = (tok: string, word: string) => tok === word || (word.length >= 4 && Math.abs(tok.length - word.length) <= 2 && osa(tok, word) <= (word.length >= 7 ? 2 : 1));
const toks = (n: string) => (n ? n.split(" ") : []);
const hasNear = (n: string, ...words: string[]) => toks(n).some((t) => words.some((w) => near(t, w)));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pick = <T,>(xs: readonly T[], seed?: number): T => xs[(seed !== undefined ? Math.abs(Math.floor(seed)) : Math.floor(Math.random() * xs.length)) % xs.length];

const LEAD = /^(?:hey|hi|hello|hiya|yo|ok|okay|so|um|uh|and|but|btw|well|oh|ooh|ha|haha|lol|please|pls|can you|could you|would you|will you|can u|go on|alright|aight|now|then|ready|one more)\b ?/;
/** Strip greeting/politeness lead-ins ("hey, so ...") from a normalized message, repeatedly. */
function stripLead(n: string): string {
  let t = n, prev = "";
  while (t !== prev) { prev = t; t = t.replace(LEAD, "").trim(); }
  return t;
}

/* ───────────────────────────── knock-knock ───────────────────────────── */

export const KNOCKS: readonly { name: string; punch: string }[] = [
  { name: "Lettuce", punch: "Lettuce in, it's cold out here!" },
  { name: "Boo", punch: "Don't cry, it's only a knock-knock joke." },
  { name: "Orange", punch: "Orange you glad I didn't say banana?" },
  { name: "Cash", punch: "No thanks, I prefer peanuts." },
  { name: "Atch", punch: "Bless you!" },
  { name: "Tank", punch: "You're welcome!" },
  { name: "Olive", punch: "Olive you and I don't care who knows it!" },
  { name: "Honey bee", punch: "Honey bee a dear and open the door." },
  { name: "Dishes", punch: "Dishes the police, open up!" },
  { name: "Who", punch: "Is there an owl in here?" },
  { name: "Dozen", punch: "Dozen anybody want to let me in?" },
  { name: "Needle", punch: "Needle little help getting in here." },
  { name: "Ice cream", punch: "Ice cream if you don't let me in!" },
  { name: "Banana", punch: "Banana split, the door's still shut." },
];
/** What Keplar says when the person lands their own punchline. */
export const KNOCK_REACTIONS: readonly string[] = [
  "Ha! I walked right into that one.",
  "Okay, that's a good one. I groaned and laughed.",
  "Nicely done. You've clearly done this before.",
  "Ha, you got me. Want to go another round?",
  "That's terrible, and I love it.",
  "Well played. I'll be thinking about that one.",
];

const nm = (s: string) => normalizeGuard(s);
const WHOS_THERE = /^(?:whos|whose|whoz|who is|who s|whos that|who is that|who is it|whos it|who|wh?o)\s*(?:there|ther|thre|thare|theer|that|it)\w*$/;
const KNOCK_WORD = (t: string) => near(t, "knock") || t === "nock" || t === "knok" || t === "knk" || t === "nok";

/** "knock knock", with typos, repeats and punctuation. */
function isKnockOpen(n: string): boolean {
  const t = toks(stripLead(n));
  return t.length >= 2 && t.length <= 4 && t.every((x) => KNOCK_WORD(x));
}
/** Asking Keplar to tell a knock-knock joke. */
function asksForKnock(n: string): boolean {
  const t = toks(n);
  if (!t.some(KNOCK_WORD) || t.length > 14) return false;
  if (!hasNear(n, "joke", "jokes", "one", "game", "riddle")) return false;
  return /\b(?:tell|say|give|know|got|have|do|try|play|crack|hit|want|wanna|another|more|one|start|go|lets|let s|me)\b/.test(n) || t.length <= 4;
}

/** Seed for picking a knock-knock name; tests pass their own. */
let knockSeed: number | undefined;
export const setKnockSeedForTests = (s: number | undefined) => { knockSeed = s; };

/** Last turn of a role, normalized. */
function lastOf(history: readonly Turn[], role: Turn["role"], back = 0): string | null {
  const xs = history.filter((h) => h.role === role && h.text?.trim());
  const h = xs[xs.length - 1 - back];
  return h ? nm(h.text) : null;
}

function knockTurn(prompt: string, history: readonly Turn[]): PlayRead | null {
  const n = nm(prompt);
  const k1 = lastOf(history, "keplar");
  const k2 = lastOf(history, "keplar", 1);
  const t = stripLead(n);
  // Keplar led: "Knock knock." / "<Name>." / punchline
  if (k1 === "knock knock" && WHOS_THERE.test(t)) return { kind: "knock", fixed: `${pick(KNOCKS, knockSeed).name}.` };
  const named = KNOCKS.find((j) => nm(j.name) === k1);
  if (named) {
    const want = `${nm(named.name)} who`;
    if (t === "who" || t === want || (t.length >= 6 && osa(t, want) <= 2) || (t.endsWith(" who") && near(t.slice(0, -4), nm(named.name)))) return { kind: "knock", fixed: named.punch };
  }
  // The person leads.
  if (k1 === "whos there" && !isKnockOpen(n)) {
    const words = toks(t);
    if (words.length >= 1 && words.length <= 5 && !/[?]/.test(prompt) && !/^(?:i|idk|no|nobody|not|dont|stop|why|what|how|huh|nope|nah|never|nothing)\b/.test(t) && !/\bwho$/.test(t)) {
      const name = prompt.trim().replace(/[.!?…"“”]+$/g, "").replace(/^[\s"“”]+/, "");
      return { kind: "knock", fixed: `${cap(name)} who?` };
    }
  }
  // They delivered the punchline to our "<name> who?".
  if (k1 && /\bwho$/.test(k1) && k2 === "whos there" && t.split(" ").length >= 2) return { kind: "knock", fixed: pick(KNOCK_REACTIONS, knockSeed) };
  // New game.
  if (isKnockOpen(n)) return { kind: "knock", fixed: "Who's there?" };
  if (asksForKnock(n)) return { kind: "knock", fixed: "Knock knock." };
  // "another one" while a knock-knock game is going.
  if (/^(?:another(?: one)?|one more|again|next(?: one)?|more|go again|another round|once more)$/.test(t)) {
    const recent = history.slice(-6).some((h) => /knock,? ?knock/i.test(h.text ?? ""));
    if (recent) return { kind: "knock", fixed: "Knock knock." };
  }
  return null;
}

/* ───────────────────────────── riddles with a known punchline ───────────────────────────── */

export const CLASSICS: readonly { q: string; a: string }[] = [
  { q: "why did the chicken cross the road", a: "To get to the other side." },
  { q: "what do you call a fake noodle", a: "An impasta." },
  { q: "what do you call a fish with no eyes", a: "A fsh." },
  { q: "what do you call a bear with no teeth", a: "A gummy bear." },
  { q: "why did the scarecrow win an award", a: "He was outstanding in his field." },
  { q: "what do you call cheese that isn t yours", a: "Nacho cheese." },
  { q: "why dont scientists trust atoms", a: "Because they make up everything." },
  { q: "what do you call a sleeping dinosaur", a: "A dino-snore." },
  { q: "why was the math book sad", a: "It had too many problems." },
  { q: "what do you call a dog magician", a: "A labracadabrador." },
  { q: "why did the bicycle fall over", a: "It was two tired." },
  { q: "what do you call a boomerang that doesn t come back", a: "A stick." },
  { q: "why did the tomato turn red", a: "Because it saw the salad dressing." },
  { q: "what did the ocean say to the beach", a: "Nothing, it just waved." },
  { q: "what do you call a pile of cats", a: "A meowntain." },
  { q: "why cant you trust stairs", a: "They're always up to something." },
  { q: "what do you call a factory that makes okay products", a: "A satisfactory." },
  { q: "why did the golfer bring two pairs of pants", a: "In case he got a hole in one." },
  { q: "what has keys but cant open locks", a: "A piano." },
  { q: "what has hands but cant clap", a: "A clock." },
  { q: "what gets wetter the more it dries", a: "A towel." },
  { q: "what has a head and a tail but no body", a: "A coin." },
  { q: "what has to be broken before you can use it", a: "An egg." },
  { q: "what has a neck but no head", a: "A bottle." },
  { q: "what goes up but never comes down", a: "Your age." },
  { q: "what has many teeth but cant bite", a: "A comb." },
  { q: "what s black and white and read all over", a: "A newspaper." },
  { q: "why did the computer go to the doctor", a: "It had a virus." },
  { q: "what did one wall say to the other wall", a: "I'll meet you at the corner." },
  { q: "why do programmers prefer dark mode", a: "Because light attracts bugs." },
];
const classicKey = (n: string) => n.replace(/^(?:riddle|joke|question)\b\s*/, "").replace(/\bwhats\b/g, "what s").replace(/\bisnt\b/g, "isn t").replace(/\bdoesnt\b/g, "doesn t").replace(/\bdont\b/g, "dont").trim();
function classic(n: string): string | null {
  const q = classicKey(stripLead(n).replace(/^(?:tell me|ask me|guess|solve|answer|riddle me)\b\s*/, ""));
  if (q.length < 12) return null;
  let best: { a: string; d: number } | null = null;
  for (const c of CLASSICS) {
    const ck = c.q.replace(/ s /g, " s ");
    const d = osa(q.replace(/\bwhats\b/, "what s"), ck);
    const lim = Math.max(2, Math.floor(ck.length * 0.14));
    if (d <= lim && (!best || d < best.d)) best = { a: c.a, d };
  }
  return best?.a ?? null;
}

/* ───────────────────────────── setups the model finishes ───────────────────────────── */

const JOKE_SUBJECTS = "chicken|duck|cow|scarecrow|skeleton|tomato|banana|bicycle|programmer|developer|computer|math book|golfer|cookie|student|teacher|elephant|penguin|monkey|fish|bear|frog|pig|horse|dog|cat|ghost|vampire|mushroom|egg|bee|spider|turkey|teddy bear|snowman|coffee|robot|atom|phone|zombie|pirate|ninja|giraffe|llama|sheep|goat|duckling|kangaroo|octopus|lion|crab|clock|calendar|banker|baker|farmer|cow|rooster|hen|coin|pencil|sun|moon|cloud|stove|fridge|sandwich|pizza|taco|donut|noodle|cheese|nurse|doctor|lawyer|painter|magician|clown|snail|worm|bug|bird|owl|crow|parrot|whale|shark|dolphin|seal|walrus|camel|hippo|rhino|mouse|rabbit|bunny";
const SETUP = new RegExp(
  "^(?:" +
    "what do you call (?:a|an|the|my|your|some)? ?\\w[\\w ]{0,40}" +
    "|what did (?:the|one|a|an) [\\w ]{2,24} say to (?:the|another|a|an|its|his|her|their|other)[\\w ]{0,24}" +
    "|why (?:did|do|does|was|is|are|can t|cant|don t|dont|wont|won t|couldn t|wouldn t) (?:the|a|an) (?:" + JOKE_SUBJECTS + ")s?(?: [\\w ]{1,40})?" +
    "|why (?:did|do|does|was|is|are|dont|can t|cant) (?:the|a) [\\w]+ (?:cross|go|walk|wear|bring|win|turn|fall|get|take|need|have|sit|stand|hide|run|jump|eat|drink|sleep)[\\w ]{0,30}" +
    "|how many [\\w ]{2,24} does it take to [\\w ]{2,40}" +
    "|what s (?:black|white|red|green|blue|yellow|orange|brown|purple|pink|gr[ae]y)(?: and (?:black|white|red|green|blue|yellow|orange|brown|purple|pink|gr[ae]y))?(?: and [\\w ]{2,20})?" +
    "|what s (?:brown|green|yellow|orange|red|blue) and [\\w ]{2,24}" +
    "|knock knock who s there" +
  ")$",
);
/** Things that look like a setup but are real questions. */
const REAL_Q = /\b(?:someone who|somebody who|a person who|people who|person from|someone from|people from|study of|group of|collection of|called when|it when|fear of|when you|when a|when an|when the|meaning|define|definition|difference|history|origin|etymology|stand for|translate|word for|in spanish|in french|in german|in latin|scientific name|species|breed|recipe|cook|bake|calories|healthy|safe to|how to|nutrition|price|cost|price of)\b/;

function setupOf(n: string): boolean {
  const t = classicKey(stripLead(n).replace(/\bwhats\b/, "what s")).replace(/\bwhat s\b/, "what s");
  if (!t || t.length > 90) return false;
  return SETUP.test(t.replace(/\bwhats\b/, "what s")) && !REAL_Q.test(t);
}

/* ───────────────────────────── jokes, banter ───────────────────────────── */

const NOT_A_JOKE_ASK = /\b(?:explain|analy[sz]e|analysis|why is|why are|why do|history|origin|origins|essay|article|paper|translate|summari[sz]e|code|program|script|python|javascript|bug|meaning of|define|definition|difference|psychology|science of|research|how (?:do|does|did|to|can|should)|what (?:is|are|makes) (?:a|an|the)? ?(?:joke|pun|humou?r)|write (?:me )?(?:an? )?(?:essay|story|poem|speech|email|letter|report)|stand up (?:routine|set|comedy)? ?(?:script)?|joke (?:theory|structure|format|types?)|types? of jokes?|is it (?:ok|okay|rude|offensive))\b/;
const JOKE_WORDS = ["joke", "jokes", "pun", "puns", "riddle", "riddles", "punchline", "oneliner"];
const REQUEST_VERB = /\b(?:tell|say|give|got|know|have|hit|crack|drop|share|another|more|one|me|a|an|any|some|want|wanna|hear|please|pls|make|write|do|try|funny|about|new|good|best|favou?rite|your|dad|bad|cheesy|silly|clean|short|quick|random|surprise)\b/;
const LAUGH_ASK = /\b(?:make me laugh|make us laugh|cheer me up|say something (?:funny|silly|dumb|random)|tell me something (?:funny|silly)|be funny|be silly|say something fun|got something funny|something to (?:laugh|smile) about|crack me up|lighten the mood|entertain me|amuse me|make me smile|brighten my day|funny story|do something funny|be a comedian|stand up for me)\b/;
const BANTER = new RegExp(
  "^(?:(?:lol|haha+|hehe|lmao|lmfao|rofl|omg|ok|okay|wow|ha|hah|oh|damn|bro|dude|nice|nah|man) ?)*(?:" +
    "(?:youre|you are|ur|u r|u are|thats|that was|that is|this is|thats so|so|you were|that joke was|ur so|youre so) (?:so |really |very |pretty |quite |too |kinda |a bit |actually |just )?(?:funny|hilarious|good|bad|terrible|awful|great|cringe|corny|cheesy|lame|dumb|stupid|silly|clever|witty|savage|brilliant|bad joke|a riot|a clown|a comedian|a joker|the worst|the best|a dad|goofy|ridiculous|amazing|awesome|cute|nuts|crazy|wild|weird)(?: one| joke| lol| haha| though| tho)?" +
    "|(?:that|you) (?:made me|had me) (?:laugh|smile|giggle|chuckle|snort|cackle)(?: out loud)?" +
    "|i (?:laughed|chuckled|giggled|smiled|snorted|cackled)(?: out loud| a little| so hard)?" +
    "|good one|nice one|great one|best one|bad one|worst one|terrible one|that s a good one|that s a bad one|that one was (?:good|bad|great|terrible|awful)|i m dying|i m dead|im dying|im dead|i can t|i cant|stop it|stop|you re killing me|ba dum tss|badum tss|ba dum tish|rimshot|drum roll|groan|oh no|oh god|ugh that s bad|that s so bad|that s awful|so bad it s good|dad joke much|good joke|bad joke|nice joke|funny joke|best joke|worst joke|great joke|terrible joke|love it|love that|i love that one|that s hilarious|hilarious|that s funny|so funny|too funny|ha ha ha|ha ha|hahaha+" +
    "|(?:are|r) (?:you|u) (?:funny|a comedian|good at jokes|a joker|silly)|do (?:you|u) have (?:a )?sense of humou?r|(?:what s|whats) your (?:favou?rite|best) (?:joke|pun|riddle)|roast me|insult me|you re a (?:funny|silly) (?:bot|ai|guy|thing)|being silly|just kidding|jk|kidding|just joking|just playing|i was joking|i m kidding|im kidding|im joking|i m joking|joking|pun intended|no pun intended|pun" +
  ")(?: lol| haha| though| tho| man| bro| dude| lmao| ha| \\w{0,4})?$",
);
const LAUGH_EMOJI = /^[\s\p{Extended_Pictographic}\u200d\ufe0f]*(?:😂|🤣|😆|😄|😁|😹|😀|😅|😜|😝|🤪|😎)[\s\p{Extended_Pictographic}\u200d\ufe0f]*$/u;
const REAL_ASK = /\b(?:explain|why|how|what|who|when|where|which|list|write|summari[sz]e|translate|code|calculate|define|can you|could you|please|help|show|compare|fix|build|create|make me an?|draft|plan|recommend|should i|is it|are there|tell me about|give me a (?:list|summary|plan|breakdown)|steps)\b/;

const topicOf = (n: string): string | null => {
  const m = n.match(/\b(?:about|on|for|involving|with|using)\s+(.{2,40})$/);
  return m ? m[1].replace(/\b(?:please|pls|thanks|again)$/, "").trim() || null : null;
};

function jokeAsk(n: string): { topic: string | null; riddle: boolean } | null {
  const t = stripLead(n);
  if (!t || toks(t).length > 12) return null;
  if (NOT_A_JOKE_ASK.test(t) && !/\bwrite (?:me )?(?:an? )?(?:short |quick |funny |clean |dad )?(?:joke|pun|riddle|one liner)\b/.test(t)) return null;
  if (LAUGH_ASK.test(t)) return { topic: null, riddle: false };
  const w = toks(t);
  const jokeTok = w.find((x) => JOKE_WORDS.some((j) => near(x, j)) || /^(?:joek|jokee|jkoe|jok|jokes?|dadjoke|dadjokes|oneliner)$/.test(x));
  if (jokeTok && (REQUEST_VERB.test(t) || w.length <= 3)) {
    // "what is a joke", "joke about X is offensive" etc. were excluded above; a bare "joke"/"jokes" is a request.
    return { topic: topicOf(t), riddle: /^(?:ri\w+|rid\w+)/.test(jokeTok) || near(jokeTok, "riddle") || near(jokeTok, "riddles") };
  }
  if (/^(?:funny|something funny|a funny one|make it funny|be funnier|funnier|something silly|pun|a pun|puns|got puns|dad jokes?)$/.test(t)) return { topic: null, riddle: false };
  return null;
}


/** Did the previous exchange play? (a joke/riddle/banter turn from the person) */
function previousWasPlay(history: readonly Turn[]): boolean {
  const lastUser = [...history].reverse().find((h) => h.role === "user" && h.text?.trim());
  if (!lastUser) return false;
  const rest = history.slice(0, history.lastIndexOf(lastUser));
  return playfulRead(lastUser.text, rest, { mood: "neutral", depth: 1 }) !== null;
}

/* ───────────────────────────── the read ───────────────────────────── */

export type PlayOptions = { mood?: string; depth?: number };

/**
 * Is this message play? Returns what to do, or null. `fixed` replies need no model. Cheap and pure: safe to call on every message.
 */
export function playfulRead(prompt: string, history: readonly Turn[] = [], opts: PlayOptions = {}): PlayRead | null {
  const raw = (prompt ?? "").trim();
  if (!raw || raw.length > 160 || opts.mood === "crisis") return null;
  if (/[`{}<>\\|~[\]_=@#$%^*+]|https?:|www\./i.test(raw)) return null;
  const hist = history.slice(-12);

  const knock = knockTurn(raw, hist);
  if (knock) return knock;

  if (LAUGH_EMOJI.test(raw)) return { kind: "banter", hint: "They sent only a laughing emoji. Answer in kind: one short, warm, playful line." };
  const n = nm(raw);
  if (!n) return null;

  if (/^(?:i have|ive got|got) a (?:joke|riddle|pun)(?: for you)?$|^(?:wanna|want to|do you want to|d you wanna) hear (?:a|my) (?:joke|riddle|pun)$|^(?:lets|let s) (?:play|do) (?:a )?(?:game|riddles|jokes)$|^(?:ask|tell) me (?:a )?riddle$/.test(stripLead(n))) {
    if (/riddle/.test(n) && /(?:ask|tell) me/.test(n)) return { kind: "riddle", hint: "They want a riddle. Ask one short, classic riddle (do not give the answer). One or two lines." };
    return { kind: "banter", fixed: pick(["Always. Go ahead.", "Hit me.", "I'm listening. Make it a good one.", "Go on, I'm ready."]) };
  }

  const known = classic(n);
  if (known) return { kind: "riddle", fixed: known };

  if (setupOf(n)) {
    return { kind: "riddle", hint: `They told you the setup of a joke or riddle: "${raw.replace(/\s+/g, " ").slice(0, 120)}". Play along like a friend would: give the punchline in a few words if you know one, or if it really has a factual answer, give that in a few words. If you do not know the punchline, say "I give up, ..." and repeat their setup as a question, nothing else.` };
  }

  const ask = jokeAsk(n);
  if (ask) {
    const again = /^(?:another|one more|more|again|next)\b/.test(stripLead(n));
    return {
      kind: ask.riddle ? "riddle" : "joke",
      hint: ask.riddle
        ? "They want a riddle. Ask one short riddle (do not give the answer yet). One or two lines."
        : `They asked for a joke${ask.topic ? ` about ${ask.topic}` : ""}${again ? " (another one)" : ""}. Tell one short, genuinely funny joke (a pun, a one-liner or a dad joke), one or two lines, with the punchline last. Do not repeat a joke that is already in the conversation.`,
    };
  }

  // A bare "another one" after a joke or a riddle.
  const t = stripLead(n);
  if (/^(?:another(?: one)?|one more|again|next(?: one)?|more|do another|got another|go again|tell another)$/.test(t) && hist.slice(-4).some((h) => h.role === "keplar") && previousWasPlay(hist)) {
    return { kind: "joke", hint: "They want another joke. Tell one short, different, genuinely funny joke. One or two lines." };
  }

  // "now do one about dogs", "how about a darker one" while the conversation is playing.
  if (/^(?:do|tell|give|make|try|say|got|how about|what about|now do|now tell)\b.*\b(?:one|another|more)\b/.test(t) && toks(t).length <= 10 && hist.length >= 2 && previousWasPlay(hist)) {
    const topic = topicOf(t);
    return { kind: "joke", hint: `They want another joke${topic ? ` about ${topic}` : ""}. Tell one short, different, genuinely funny joke, one or two lines, punchline last.` };
  }
  if (opts.mood && opts.mood !== "neutral") return null;
  if (BANTER.test(n)) return { kind: "banter", hint: "They are joking around with you or reacting to a joke. Answer in one short, quick-witted line that matches their energy. Do not explain anything and do not offer a list of options." };

  // A short, non-question follow-up while the conversation is playing.
  if ((opts.depth ?? 0) < 1 && toks(n).length <= 10 && !REAL_ASK.test(n) && !/\d/.test(n) && hist.length >= 2 && previousWasPlay(hist)) {
    return { kind: "banter", hint: "You are in the middle of playing around. Reply in one short, quick-witted line that keeps the game going." };
  }
  return null;
}

/* ───────────────────────────── the reply ───────────────────────────── */

export const JOKE_FALLBACK: readonly string[] = [
  "I told my computer I needed a break. It said no problem, it'll go to sleep.",
  "Why don't skeletons fight each other? They don't have the guts.",
  "I used to hate facial hair, but then it grew on me.",
  "What do you call a fish wearing a bowtie? Sofishticated.",
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "Why did the coffee file a police report? It got mugged.",
  "I would tell you a construction joke, but I'm still working on it.",
  "Parallel lines have so much in common. It's a shame they'll never meet.",
];
export const BANTER_FALLBACK: readonly string[] = [
  "Ha, I'll take it.",
  "Thank you, I'll be here all week.",
  "I have about forty more where that came from. Don't tempt me.",
  "My comedy career is going great, thank you for asking.",
  "Glad that landed.",
];

/** A line that always works when no model answers: a joke from the pool, or "I give up, <setup>?" for a setup. */
export function playfulFallback(prompt: string, read: PlayRead, seed?: number): string {
  if (read.fixed) return read.fixed;
  if (read.kind === "riddle" && setupOf(nm(prompt))) {
    const q = prompt.trim().replace(/[?.!\s]+$/g, "");
    return `I give up, ${q.charAt(0).toLowerCase()}${q.slice(1)}?`;
  }
  if (read.kind === "banter") return pick(BANTER_FALLBACK, seed);
  return pick(JOKE_FALLBACK, seed);
}

/** The voice for a model-written playful reply. */
export const PLAYFUL_SYSTEM =
  "You are Keplar, quick-witted and a little cheeky, playing along with someone. Reply the way a funny friend would: very short (one or two lines, under 35 words), a real laugh in it (a pun, a twist, dry wit), natural and human. " +
  "Plain text only: no headings, no lists, no markdown, no \"Here's a joke:\" or \"Sure!\" preamble, no explaining the joke, no disclaimers, never show reasoning. Keep it kind: no jokes at anyone's expense, nothing crude. " +
  "Match their energy: looser and sillier if they use lol, haha or emoji, drier if they are deadpan. " + HUMAN_TONE_SHORT;

const CLASSIFICATION: Classification = { kind: "general", complexity: "simple", capabilities: [], estimatedInputTokens: 160, estimatedOutputTokens: 60, needsWeb: false, rationale: "A playful message." };

/** Remove "Sure! Here's a joke:" style preambles and wrapping quotes; reject replies that are too long or have scaffolding. */
export function cleanPlayful(raw: string): string {
  let t = cleanSmallTalk(raw);
  t = t.replace(/^(?:sure|okay|ok|certainly|absolutely|of course|alright)[,!.:]?\s+/i, "").replace(/^here(?:'s| is) (?:a|an|one|another|my)[^:.!?]{0,40}[:\-]\s*/i, "").trim();
  if (t.split(/\s+/).length > 60) return "";
  return t;
}

/** Last few turns as context for the model (the route skips the memory/context step for small talk). */
function contextOf(history: readonly Turn[] | undefined, prompt: string): string {
  const lines = (history ?? []).slice(-6).map((h) => `${h.role === "user" ? "Them" : "You"}: ${h.text.replace(/\s+/g, " ").slice(0, 200)}`);
  return lines.length ? `The conversation so far:\n${lines.join("\n")}\n\nTheir latest message: ${prompt}` : prompt;
}

export type PlayfulDeps = {
  /** A free-only registry (the one small talk uses). Never a paid one. */
  registry: ReturnType<typeof createRegistry>;
  models?: ModelSpec[];
  timeoutMs?: number;
  perModelMs?: number;
  staggerMs?: number;
};

function playAnswer(markdown: string, durationMs: number): KeplarAnswer {
  return {
    id: `ans_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    smalltalk: true,
    markdown,
    consensus: { level: "single", score: null, agree: 0, disagree: 0, missing: 0, responded: 1, consulted: 1, summary: "" },
    models: [],
    sources: [],
    disagreements: [],
    verification: { mode: "not-needed", summary: "", checks: [], notes: [] },
    reasoning: "",
    capabilities: [],
    compute: { units: 0, level: "low" },
    durationMs,
  };
}

/** One fast free model answers in a playful voice, a curated line stands in if none does. A plain reply, never charged. */
export async function* runPlayful(req: KeplarRequest, deps: PlayfulDeps, signal?: AbortSignal): AsyncGenerator<KeplarEvent> {
  const started = Date.now();
  yield { type: "smalltalk" };
  const read = (req.understanding as { play?: PlayRead } | undefined)?.play ?? playfulRead(req.prompt, req.history ?? [], { mood: "neutral" }) ?? { kind: "banter" as const };
  const models = (deps.models ?? smallTalkModels()).slice(0, 4);
  const prompt = req.prompt.trim().slice(0, 200);
  const total = new AbortController();
  const timer = setTimeout(() => total.abort(), deps.timeoutMs ?? 10_000);
  const outer = signal ? AbortSignal.any([signal, total.signal]) : total.signal;
  let text = "";
  try {
    text = read.fixed ?? (await firstClean(models, outer, deps.perModelMs ?? 5_000, deps.staggerMs ?? 1_500, async (m, sig) => {
      const r = await deps.registry.once({ model: m, prompt: contextOf(req.history, prompt), classification: CLASSIFICATION, params: { maxOutputTokens: 120 }, slot: "panel", system: `${PLAYFUL_SYSTEM} ${read.hint ?? ""} ${identityPrompt()}`, signal: sig });
      return r.ok ? cleanPlayful(r.text) : "";
    }, prompt));
  } catch (e) {
    if (signal?.aborted) throw e;
  } finally {
    clearTimeout(timer);
  }
  const markdown = polish(guardVoice(text || playfulFallback(req.prompt, read)));
  const words = markdown.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 6) yield { type: "delta", text: words.slice(i, i + 6).join("") };
  yield { type: "answer", answer: playAnswer(markdown, Date.now() - started) };
}
