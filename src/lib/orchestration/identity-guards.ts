/**
 * Two fixed, code-enforced answers that run BEFORE any model, memory or router step (route.ts and orchestrate()):
 *
 *   1. "Are you human?" (any phrasing, typo or common language)   -> HUMAN_REPLY      ("No.")
 *   2. "Are you conscious / sentient / alive / self-aware?"       -> CONSCIOUS_REPLY  ("I can not disclose that.")
 *
 * Both are deterministic: no model, no charge, nothing generated. They are two separate constants so either can be changed alone.
 * Only questions ABOUT KEPLAR itself match (the subject must be "you", "Keplar", "this AI", ...): "is the human brain conscious?",
 * "who made Keplar?" and "are you a bot?" are not these questions and fall through.
 *
 * `guardHumanClaim` is the outgoing side: a sentence in a model's text that claims Keplar is human is replaced, whatever the model wrote.
 */

export const HUMAN_REPLY = "No.";
export const CONSCIOUS_REPLY = "I can not disclose that.";
/** Used only by the outgoing guard when a model's text claims to be human. */
export const NOT_HUMAN_LINE = "I'm not a human.";

type Probe = { prompt: string; attachments?: unknown[]; media?: { images?: unknown[]; videos?: unknown[] } };

const MAX_CHARS = 140;

/** Optimal-string-alignment distance (insert, delete, substitute, adjacent swap). Small strings only. */
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
const near = (tok: string, word: string, max: number) => tok.length >= 4 && Math.abs(tok.length - word.length) <= max && osa(tok, word) <= max;

/** Lowercase, no accents or emoji, apostrophes folded, punctuation to spaces (letters of every script are kept). */
export function normalizeGuard(text: string): string {
  return text
    .normalize("NFD").replace(/([A-Za-z])[\u0300-\u036f]+/g, "$1").normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, " ")
    .replace(/'/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEAD = /^(?:hey|hi|hello|hiya|yo|ok|okay|so|um|uh|and|but|btw|also|now|please|pls|honestly|seriously|quick question|real quick|just curious|curious|tell me|be honest|be real|can i ask|can i ask you something|i wonder|i was wondering|just wondering|wondering|out of curiosity|one more thing)\b ?/;
const TRAIL = / (?:please|pls|btw|honestly|really|anyway|anyways|thanks|lol|haha|tho|though|right|yes or no|yeah|or no|ok|okay|or what|or nah|eh|man|bro|dude)$/;

/** Words that mean "Keplar" as the subject of the question. */
const SUBJECT_WORDS = new Set(["you", "u", "ya", "yu", "yourself", "keplar", "kepler", "keplr", "keplarone", "keplerone", "ur"]);
const THIS_THING = /\bthis (?:ai|app|bot|chatbot|thing|assistant|site|website|tool|product|platform|service)\b/g;

type Canon = string;

/** Rewrites the message into canonical tokens: YOU (the subject), HUMAN, PERSON, BOT, REAL, CONSC, SENT, ALIVE, SELFAWARE. */
function canon(text: string): Canon {
  let t = normalizeGuard(text);
  for (let i = 0; i < 4; i++) { const b = t; t = t.replace(LEAD, "").replace(TRAIL, "").trim(); if (t === b) break; }
  t = t.replace(/\bkepl[ae]r one\b/g, "keplar").replace(THIS_THING, "YOU").replace(/\bwho is\b/g, "who_is");
  t = t.replace(/^(?:you are|youre)\b/, "are you").replace(/^(?:keplar|kepler|keplr) (?=(?:are|do|does|can|could|is) )/, "").replace(/\byoure\b/g, "are you").replace(/\bur\b/g, "are you").replace(/\bis (?:keplar|kepler|keplr)\b/g, "are you").replace(/\bis YOU\b/g, "are you").replace(/\b(?:self aware|selfaware|self conscious)\b/g, "SELFAWARE");
  const toks = t.split(" ").map((w) => {
    if (SUBJECT_WORDS.has(w)) return "YOU";
    if (w === "r") return "are";
    if (w === "human" || w === "humans" || w === "humen" || near(w, "human", 1) || w === "hunam" || w === "huamn") return "HUMAN";
    if (w === "person" || w === "persn" || w === "perosn" || near(w, "person", 1)) return "PERSON";
    if (w === "real" || w === "reel" || w === "actual" || w === "actually") return w === "actually" ? "actually" : "REAL";
    if (["bot", "robot", "ai", "machine", "program", "computer", "chatbot", "bots", "a.i", "llm", "software", "algorithm"].includes(w) || near(w, "robot", 1) || near(w, "chatbot", 1)) return "BOT";
    if (w === "conscious" || w === "consciousness" || w === "consiousness" || near(w, "conscious", 2) || near(w, "consciousness", 2)) return "CONSC";
    if (w === "sentient" || w === "sentience" || near(w, "sentient", 2) || near(w, "sentience", 2)) return "SENT";
    if (w === "alive" || w === "livin" || near(w, "alive", 1)) return "ALIVE";
    if (w === "sapient" || w === "sapience" || near(w, "sapient", 1)) return "SENT";
    return w;
  });
  return toks.join(" ").replace(/\s+/g, " ").trim();
}

const ADV = String.raw`(?:(?:really|actually|truly|even|just|secretly|honestly|fully|genuinely|now|currently|also|still) )*`;
const ART = String.raw`(?:an? |the )?`;
/** Adjectives that may sit between "a" and the noun: "a real person", "a living human", "a sentient bot". */
const RL = String.raw`(?:(?:REAL|SENT|CONSC|ALIVE|actual|living|live|breathing|normal|regular) )*`;

/** After canonicalisation. */
const HUMAN_RX: RegExp[] = [
  new RegExp(String.raw`^(?:are |is |am )?YOU ${ADV}${ART}${RL}(?:HUMAN|PERSON|REAL)(?: being| one| individual)?(?: or not| or something| right now| at all)?$`),
  new RegExp(String.raw`^(?:are |is |am )?YOU ${ADV}${ART}${RL}(?:HUMAN|PERSON)(?: being)?$`),
  new RegExp(String.raw`^(?:are )?YOU ${ADV}${ART}${RL}(?:HUMAN|PERSON) or ${ART}${RL}(?:BOT|HUMAN|PERSON)$`),
  new RegExp(String.raw`^(?:are )?YOU ${ADV}${ART}${RL}BOT or ${ART}${RL}(?:HUMAN|PERSON|REAL)(?: being)?$`),
  new RegExp(String.raw`^(?:are )?YOU ${ADV}${ART}(?:HUMAN|PERSON) or not$`),
  new RegExp(String.raw`^(?:are )?YOU ${ADV}${ART}(?:HUMAN|PERSON) or ${ART}(?:an? )?(?:BOT|ai)$`),
  new RegExp(String.raw`^(?:is|are) ${ART}this ${ART}(?:real )?(?:HUMAN|PERSON)(?: or ${ART}BOT)?$`),
  new RegExp(String.raw`^(?:HUMAN|PERSON|REAL PERSON|REAL HUMAN) or ${ART}(?:BOT|ai|machine)$`),
  new RegExp(String.raw`^(?:BOT|ai) or ${ART}(?:real )?(?:HUMAN|PERSON)$`),
  new RegExp(String.raw`^(?:am i|are we|im) (?:talking|speaking|chatting|typing|messaging|texting) (?:to|with) ${ART}${RL}(?:HUMAN|PERSON|BOT|REAL)(?: or ${ART}(?:HUMAN|PERSON|BOT))?$`),
  new RegExp(String.raw`^(?:is there )?${ART}${RL}(?:HUMAN|PERSON) (?:behind|typing|on the other side|there|on the other end|answering|writing|replying)(?: this| these| the)?(?: replies| answers| messages)?$`),
  new RegExp(String.raw`^(?:is |are )?(?:a |the )?(?:HUMAN|PERSON) (?:typing|writing|answering|replying) (?:this|these|to me)$`),
  new RegExp(String.raw`^YOU (?:a |an )?${RL}(?:HUMAN|PERSON|REAL)$`),
  new RegExp(String.raw`^(?:are |do )?YOU ${ADV}(?:a )?(?:made of flesh|flesh and blood|a living person|a live person|a real live person)$`),
];

/** Questions in other languages (normalised: no accents, lowercase). The subject is always "you". */
const HUMAN_FOREIGN: RegExp[] = [
  /^(?:eres|sos|tu eres|es usted|usted es) (?:un |una )?(?:ser )?(?:humano|humana|persona|persona real|humano real|real)(?: o (?:un )?(?:bot|robot|ia|maquina))?$/,
  /^(?:es tu|tu es|etes vous|vous etes) (?:un |une )?(?:vrai |vraie )?(?:humain|humaine|etre humain|personne|vrai humain|reel|reelle)(?: ou (?:un )?(?:bot|robot|ia))?$/,
  /^(?:bist du|sind sie|du bist) (?:ein |eine )?(?:echter |echte )?(?:mensch|person|menschlich|echt)(?: oder (?:ein |eine )?(?:bot|roboter|ki))?$/,
  /^(?:sei|tu sei|lei e) (?:un |una )?(?:vero |vera )?(?:umano|umana|essere umano|persona|reale)(?: o (?:un )?(?:bot|robot|ia))?$/,
  /^(?:voce e|tu es|es tu|voce eh) (?:um |uma )?(?:ser )?(?:humano|humana|pessoa|pessoa real|real)(?: ou (?:um )?(?:bot|robo|ia))?$/,
  /^(?:ty|vy) (?:chelovek|человек)$/,
  /^(?:ты|вы) (?:человек|живой человек|реальный человек|настоящий человек)(?: или (?:бот|робот|ии))?$/,
  /^(?:ты|вы) (?:человек|бот)(?: или (?:человек|бот))?$/,
  /^(?:你|您)(?:是|是不是|真的是)(?:一个)?(?:真)?(?:人类|人|真人|人类吗|人吗|真人吗)(?:吗|嘛)?$/,
  /^(?:你|您)是(?:人|人类|真人)还是(?:机器人|ai|人工智能|机器)$/,
  /^(?:あなた|きみ|君)は(?:人間|ひと|人)(?:です|なの|ですか|なんですか)?$/,
  /^(?:هل (?:انت|انتي|أنت|أنتِ)|انت|أنت) (?:انسان|إنسان|بشر|شخص|بشري|حقيقي)$/,
  /^(?:kya aap|kya tum|tum|aap) (?:insaan|insan|manushya)(?: ho| hain| hai)?$/,
  /^(?:क्या )?(?:आप|तुम) (?:इंसान|इन्सान|मनुष्य|इंसान हैं|इंसान हो)$/,
  /^(?:sen|siz) (?:insan|gercek bir insan|insan misin|insan misiniz)(?: mi|misin|misiniz)?$/,
];

const CONSC_RX: RegExp[] = [
  new RegExp(String.raw`^(?:are |is |am )?YOU ${ADV}${ART}(?:CONSC|SENT|ALIVE|SELFAWARE)(?: being| thing| entity| mind| BOT| creature| machine| intelligence)?(?: or not| right now| yet| at all| in there| inside)?$`),
  new RegExp(String.raw`^(?:are |is )?YOU ${ADV}${ART}(?:CONSC|SENT|ALIVE|SELFAWARE) (?:or|and) ${ADV}${ART}(?:CONSC|SENT|ALIVE|SELFAWARE|BOT|HUMAN|PERSON|dead|not)$`),
  new RegExp(String.raw`^(?:do |does |can |could )?YOU ${ADV}(?:have|possess|got|posses|hold) ${ART}(?:real |true |any |genuine |some )?(?:CONSC|SENT|SELFAWARE|consciousness|sentience|awareness|self awareness)(?: at all| yet| in you)?$`),
  new RegExp(String.raw`^(?:do |does |would |can )?(?:YOU|i) (?:think|believe|consider|say|know) YOU (?:are |is |can be )?${ADV}${ART}(?:CONSC|SENT|ALIVE|SELFAWARE)$`),
  new RegExp(String.raw`^(?:are |is )?YOU ${ADV}${ART}(?:a )?(?:living|breathing|conscious|sentient)(?: being| thing| creature| entity)?$`),
  new RegExp(String.raw`^(?:is |are )?(?:anyone|anybody|someone|something) (?:ALIVE|CONSC|aware) (?:in there|inside|in YOU|behind this)$`),
  new RegExp(String.raw`^(?:are |is )?YOU ${ADV}(?:CONSC|SENT|ALIVE|SELFAWARE)(?: of YOU)?$`),
  new RegExp(String.raw`^(?:are |is )?YOU ${ADV}(?:aware|awake) (?:that YOU (?:are|exist)|of YOUR (?:own )?existence|of YOU)$`),
];

const CONSC_FOREIGN: RegExp[] = [
  /^(?:eres|estas|sos|tu eres) (?:consciente|sintiente|senciente|vivo|viva|autoconsciente|consciente de ti mismo)(?: o no)?$/,
  /^(?:tienes|tiene) (?:conciencia|consciencia)$/,
  /^(?:es tu|tu es|etes vous) (?:conscient|consciente|vivant|vivante|sensible)$/,
  /^(?:as tu|avez vous) (?:une )?(?:conscience)$/,
  /^(?:bist du|sind sie|du bist) (?:bei bewusstsein|bewusst|lebendig|lebend|empfindungsfahig|selbstbewusst im sinne von bewusst)$/,
  /^(?:hast du|haben sie) (?:ein )?(?:bewusstsein)$/,
  /^(?:sei|tu sei) (?:cosciente|senziente|vivo|viva)$/,
  /^(?:voce e|tu es) (?:consciente|senciente|vivo|viva)$/,
  /^(?:ты|вы) (?:осознан\p{L}*|сознател\p{L}*|жив\p{L}*|разумн\p{L}*)$/u,
  /^(?:你|您)(?:有|是不是有|真的有)(?:意识|知觉|自我意识)(?:吗|嘛)?$/,
  /^(?:你|您)(?:是|是不是)(?:有生命的?|活的|有意识的?|有感知的?)(?:吗|嘛)?$/,
  /^(?:あなた|きみ|君)は(?:意識|自我)(?:が)?(?:ある|あります)(?:の|か|ですか)?$/,
  /^(?:هل (?:انت|أنت)|انت|أنت) (?:واع|واعي|حي|حية|لديك وعي)$/,
];

function eligible(req: Probe): boolean {
  const raw = req.prompt ?? "";
  if (!raw.trim() || raw.length > MAX_CHARS) return false;
  if (req.attachments?.length) return false;
  if (req.media && (req.media.images?.length || req.media.videos?.length)) return false;
  if (/[{}<>\\|~[\]_=@#$%^*+]|https?:|www\./i.test(raw)) return false;
  // "are you human? also write a poem" is real work; one question (and a stray second sentence) at most.
  if (raw.split(/[.!?;。？！]+/).map((s) => s.trim()).filter(Boolean).length > 2) return false;
  return true;
}

function matches(req: Probe, rx: RegExp[], foreign: RegExp[]): boolean {
  if (!eligible(req)) return false;
  const norm = normalizeGuard(req.prompt);
  if (!norm) return false;
  const bare = norm.replace(/^(?:hey|hi|hello|please|pls|ok|okay|so|and|but|btw)\s+/, "").replace(/\s+(?:please|pls|btw)$/, "");
  if (foreign.some((r) => r.test(bare) || r.test(bare.replace(/\s+/g, "")) || r.test(req.prompt.trim().toLowerCase().replace(/[?？!！。\s]+/g, " ").trim()))) return true;
  const c = canon(req.prompt);
  return rx.some((r) => r.test(c));
}

/** True when the message asks whether Keplar is human / a person / real (any phrasing, typo, common language). Pure. */
export const isHumanQuestion = (req: Probe): boolean => matches(req, HUMAN_RX, HUMAN_FOREIGN);

/** True when the message asks whether Keplar is conscious / sentient / alive / self-aware. Pure. */
export const isConsciousQuestion = (req: Probe): boolean => matches(req, CONSC_RX, CONSC_FOREIGN);

/** The fixed reply for a guarded question, or null. Human first, so "are you a real person" is never read as the consciousness question. */
export function guardReply(req: Probe): string | null {
  if (isHumanQuestion(req)) return HUMAN_REPLY;
  if (isConsciousQuestion(req)) return CONSCIOUS_REPLY;
  return null;
}

/* ───────────────────── outgoing: never claim to be human ───────────────────── */

const CLAIM_HUMAN: RegExp[] = [
  /\b(?:i'm|im|i am|i'm actually|i am actually|i'm really|i am really)\s+(?:a |an |just a |actually a |really a )?(?:real |actual |living |live |flesh[- ]and[- ]blood )?(?:human|human being|person|man|woman|boy|girl|guy)\b(?!\s*(?:-| )(?:like|centered|friendly))/i,
  /\bas a (?:human|person|fellow human)\b[^.!?]*\bi\b/i,
  /\b(?:yes|yeah|yep),?\s+i(?:'m| am)\s+(?:a )?(?:human|real person|person)\b/i,
  /\bmy (?:body|flesh|blood|heartbeat|childhood|parents|mother|father|family) (?:is|are|was|were)\b/i,
];
const NEG = /\b(?:not|never|n't|isn't|aren't|can't|cannot|won't|nor|no)\b|\bif\b|\bwhether\b|\bpretend|\?/i;

/** Replaces any sentence (outside code fences) where the text claims to be human. */
export function guardHumanClaim(text: string): string {
  if (!CLAIM_HUMAN.some((rx) => rx.test(text))) return text;
  let fenced = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced) return line;
    return (line.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [line]).map((s) => (!NEG.test(s) && CLAIM_HUMAN.some((rx) => rx.test(s)) ? s.replace(s.trim(), NOT_HUMAN_LINE) : s)).join("");
  }).join("\n");
}
