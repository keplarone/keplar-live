/**
 * Does this chat message ask Keplar to MAKE a video? Pure and conservative: a wrong "yes" would spend credits on a clip
 * the person only wanted to talk about. Questions, recommendations, scripts and "video game / editor" are never video jobs.
 * Shape and length are read when the words state them; anything unstated is asked in the thread before a clip starts.
 */
export type ChatAspect = "16:9" | "9:16";

export type VideoIntent = {
  /** What to show, with the "make a video of" wrapper taken off when that leaves a real subject. */
  prompt: string;
  /** Set only when the message names one shape. Both, or neither, stays null so the card asks. */
  aspect: ChatAspect | null;
  /** Seconds named in the message, before the plan's allowed list is applied. */
  durationSec: number | null;
};

const VERB = "(?:make|create|generate|produce|render|animate|film)";
const NOUN = "(?:videos?|clips?|animations?|movies?|films?)";
const LEAD = /^(?:(?:hey|hi|hello|ok(?:ay)?|so|please|pls|kindly|keplar)[,\s]+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i(?:'d|\s+would)\s+(?:like|love|want)\s+(?:you\s+to\s+|to\s+)?|i\s+(?:want|need)\s+(?:you\s+to\s+)?|let'?s\s+|go\s+ahead\s+and\s+|please\s+)?/i;
const QUESTION_START = /^(?:how|what|why|when|where|which|who|whose|is|are|does|do|did|was|were|should|has|have|recommend|suggest|explain|describe|compare|review|write|draft|script|list|find|search)\b/i;
const NOT_MAKING = /\b(?:how\s+(?:do|can|should|would|to|does)|what(?:'s|\s+is|\s+are)|why\b|explain|tutorial|recommend|suggestion|script\s+for|write\s+(?:me\s+)?(?:a|an|the)|essay|poem|story|caption|editor|editing|edit\s+(?:a|the|my|this)\s+(?:video|clip)|compress|codec|bitrate|resolution\s+mean)\b/i;
const NOT_A_CLIP = new RegExp(`\\b(?:${NOUN})\\s+(?:games?|editors?|players?|calls?|chats?|meetings?|conferences?|platforms?|sites?|websites?|apps?|courses?|tutorials?|essays?|scripts?|ideas?|titles?|lengths?|formats?)\\b`, "i");
const SITE_BUILD = /^(?:build|make|create|design|code)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|the\s+|my\s+)?(?:new\s+|simple\s+|small\s+)?(?:website|web\s?site|site|landing page|web\s?app|app)\b/i;

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

const VERTICAL = /\b(?:9\s*:\s*16|vertical|portrait|tik\s?tok|reels?|shorts|instagram story|ig story)\b/i;
const LANDSCAPE = /\b(?:16\s*:\s*9|landscape|widescreen|wide\s*screen|youtube)\b/i;

function statedAspect(text: string): ChatAspect | null {
  const ratio16 = /\b16\s*:\s*9\b/.test(text);
  const ratio9 = /\b9\s*:\s*16\b/.test(text);
  if (ratio16 && ratio9) return null;
  if (ratio16) return "16:9";
  if (ratio9) return "9:16";
  const vertical = VERTICAL.test(text);
  const landscape = LANDSCAPE.test(text);
  if (vertical && landscape) return null;
  if (vertical) return "9:16";
  if (landscape) return "16:9";
  return null;
}

function statedDuration(text: string): number | null {
  const num = /\b(\d{1,2})\s*(?:-\s*)?(?:seconds?|secs?)\b/i.exec(text) ?? /\b(\d{1,2})\s*s\b/i.exec(text);
  if (num) {
    const n = Number(num[1]);
    return n >= 1 && n <= 60 ? n : null;
  }
  const word = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\s*(?:-\\s*)?(?:seconds?|secs?)\\b`, "i").exec(text);
  return word ? NUMBER_WORDS[word[1].toLowerCase()] : null;
}

export function detectVideoIntent(raw: string): VideoIntent | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > 700) return null;
  const body = text.replace(LEAD, "");
  if (QUESTION_START.test(body) || NOT_MAKING.test(text) || NOT_A_CLIP.test(body) || SITE_BUILD.test(body)) return null;
  if (/\b(?:this|the attached|my)\s+(?:image|photo|picture|video|clip)\b/i.test(body)) return null;

  const verbThenNoun = new RegExp(`^(?:${VERB})\\b.{0,80}?\\b(?:${NOUN})\\b`, "i").test(body);
  const startsWithNoun = new RegExp(`^(?:(?:a|an|the|short|quick|brief)\\s+)?(?:${NOUN})\\s+of\\b`, "i").test(body);
  if (!verbThenNoun && !startsWithNoun) return null;

  const of = new RegExp(`\\b(?:${NOUN})\\b(?:\\s+[\\w:'’-]+){0,6}?\\s+(?:of|about|showing)\\s+(.+)$`, "i").exec(body);
  const prompt = (of ? of[1] : body).replace(/^[\s,:;-]+|[\s.?!]+$/g, "").trim();
  if (prompt.length < 4) return null;
  return { prompt, aspect: statedAspect(text), durationSec: statedDuration(text) };
}
