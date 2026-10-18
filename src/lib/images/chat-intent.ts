/**
 * Does this chat message ask Keplar to MAKE a picture? Pure and conservative: a wrong "yes" would spend the person's credits
 * on something they only wanted to talk about, so anything unclear stays a normal question. Questions ("how do I generate an image in Python?"), code and diagrams are never
 * treated as image requests.
 */
import type { ImageSize } from "./config";

export type ImageIntent = {
  /** What to draw, with the "draw me an image of" wrapper taken off. */
  prompt: string;
  /** True when a picture is attached and the request is to change it or to make something from it. */
  edit: boolean;
  size?: ImageSize;
  /** The person asked for several ("make 4 images"). Chat makes one at a time and says so. */
  asked?: number;
};

const NOUN = "(?:images?|pictures?|photos?|photographs?|illustrations?|drawings?|paintings?|artworks?|art|portraits?|wallpapers?|posters?|logos?|icons?|avatars?|cartoons?|sketch(?:es)?|renders?|renderings?|mockups?|thumbnails?|banners?|stickers?|pics?)";
const CREATE_VERB = "(?:draw|paint|sketch|illustrate|render|generate|create|make|produce|design|show\\s+me|give\\s+me|get\\s+me)";
const DRAW_VERB = "(?:draw|paint|sketch|illustrate)";
const LEAD = /^(?:(?:hey|hi|hello|ok(?:ay)?|so|please|pls|kindly|keplar)[,\s]+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i(?:'d|\s+would)\s+(?:like|love|want)\s+(?:you\s+to\s+|to\s+)?|i\s+(?:want|need)\s+(?:you\s+to\s+)?|let'?s\s+|go\s+ahead\s+and\s+|please\s+)?/i;

/** Questions about images, code, charts and prompts are talk, not a request to make one. */
const NOT_MAKING = /\b(?:code|python|javascript|typescript|java|script|function|api|sdk|css|html|svg|canvas|ascii|react|regex|sql|prompt\s+(?:for|to)|prompts?\b.*\b(?:midjourney|dall-?e)|how\s+(?:do|can|should|would|to|does)|what(?:'s|\s+is|\s+are)|why\b|explain|tutorial|which\s+(?:tool|app|model)|write\s+(?:me\s+)?(?:a|an|the)|diagram|flow\s?chart|chart|graph|spreadsheet|table|plot|slide|presentation|essay|poem|story|caption|alt\s+text)\b/i;
const IDIOM = /\b(?:conclusions?|comparisons?|parallels?|distinctions?|attention|inferences?|lessons?|analogy|analogies|inspiration|from\s+(?:memory|scratch)|a\s+line|the\s+line|blank|breath|curtains?|bath|blood|salary|pension|water|lots)\b/i;
const QUESTION_START = /^(?:how|what|why|when|where|which|who|is|are|does|do|did|was|were|should|has|have)\b/i;

const EDIT_VERB = "(?:edit|change|modify|restyle|redraw|recolou?r|retouch|remix|transform|turn|convert|make|put|add|remove|replace|swap|erase|cartoonify|animate|enhance|upscale|colou?rize|fix|clean\\s+up|crop|extend|outpaint|blur)";
const THIS_PIC = `(?:this|these|the\\s+attached|the\\s+above|my|that|the)\\s+(?:\\w+\\s+)?${NOUN}`;
const NOT_EDIT = /\b(?:describe|what(?:'s|\s+is|\s+are)|who|where|explain|analy[sz]e|read|ocr|translate|caption|rate|critique|review|identify|tell\s+me|how\s+many|is\s+(?:this|it|there)|summari[sz]e|count|transcribe|extract)\b/i;

const SIZE_HINTS: [RegExp, ImageSize][] = [
  [/\b(?:square|1\s*:\s*1|profile\s+(?:picture|photo|pic))\b/i, "1024x1024"],
  [/\b(?:portrait\s+(?:orientation|mode|format|aspect)|vertical|tall|9\s*:\s*16|2\s*:\s*3|phone\s+wallpaper|story\s+format)\b/i, "1024x1536"],
  [/\b(?:landscape|widescreen|horizontal|16\s*:\s*9|3\s*:\s*2|banner|desktop\s+wallpaper)\b/i, "1536x1024"],
];

const COUNTS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1, one: 1 };

export function detectImageIntent(raw: string, opts: { hasImage?: boolean } = {}): ImageIntent | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length < 6 || text.length > 700) return null;
  const hasImage = opts.hasImage === true;
  const body = text.replace(LEAD, "");
  // A request, not a question: "can you draw..." and "i want you to draw..." were already unwrapped above.
  if (QUESTION_START.test(body)) return null;
  if (NOT_MAKING.test(text)) return null;

  const size = SIZE_HINTS.find(([re]) => re.test(text))?.[1];
  const out = (prompt: string, edit: boolean): ImageIntent | null => {
    const p = prompt.replace(/^[\s,:;-]+|[\s.?!]+$/g, "").trim();
    if (p.length < 4) return null;
    const asked = text.match(new RegExp(`\\b(\\d{1,2}|two|three|four|five|six)\\s+(?:\\w+\\s+){0,2}${NOUN}\\b`, "i"));
    const n = asked ? Number(asked[1]) || COUNTS[asked[1].toLowerCase()] : 1;
    return { prompt: p, edit, ...(size ? { size } : {}), ...(n && n > 1 ? { asked: n } : {}) };
  };

  if (hasImage && !NOT_EDIT.test(body)) {
    const edit = new RegExp(`^${EDIT_VERB}\\b.*\\b${THIS_PIC}\\b`, "i").test(body) || new RegExp(`^${EDIT_VERB}\\s+(?:it|this|that)\\b`, "i").test(body) || /\b(?:variations?|remix|similar\s+(?:image|picture|one)|in\s+the\s+style\s+of\s+(?:this|the\s+attached))\b/i.test(body);
    if (edit && !IDIOM.test(body)) return out(body, true);
  }

  // "draw me an image of ...", "generate a picture of ...", "make a logo for my bakery", "create 4 posters about ..."
  const withNoun = new RegExp(`^(${CREATE_VERB})\\s+(?:me\\s+|us\\s+)?(?!(?:this|that|these|those|it|them|my|your)\\b)(?:(?:a|an|the|some|another|one|\\d{1,2}|two|three|four|five|six)\\s+)?(?:[\\w-]+\\s+){0,3}?(${NOUN})\\b\\s*(.*)$`, "i").exec(body);
  if (withNoun) {
    const rest = withNoun[3].trim();
    // "an image" alone is not enough to draw; the person has to say of what.
    if (rest.length < 3 || /^(?:to|that|which|so)\b/i.test(rest)) return null;
    // "an image of X" is just X; "a poster about X", "a photo of X" and "a logo for X" keep the kind of picture, which matters.
    const generic = /^(?:images?|pictures?|pics?)$/i.test(withNoun[2]);
    const of = /^(?:of|showing|depicting|featuring)\s+(.+)$/i.exec(rest);
    return out(generic && of ? of[1] : body.replace(new RegExp(`^${CREATE_VERB}\\s+(?:me\\s+|us\\s+)?`, "i"), ""), hasImage);
  }

  // "draw a fox in the snow", "paint me a sunset": the verb alone is clear enough, unless it is an idiom.
  const drawn = new RegExp(`^${DRAW_VERB}\\s+(?:me\\s+|us\\s+)?((?:a|an|the|some|my|our|this|that)\\s+\\S.*)$`, "i").exec(body);
  if (drawn && !IDIOM.test(body)) return out(drawn[1], hasImage);
  return null;
}
