/**
 * Prompt and output safety for generated images.
 *
 * 1. Local rules (synchronous, free): sexual content involving minors, non-consensual / deepfake content,
 *    graphic violence, scams that imitate other companies, and real-person likeness (named people, public roles,
 *    "looks like", "face swap"). Local rules are heuristics; they run first so obvious abuse never reaches a paid API.
 * 2. OpenAI `omni-moderation-latest` (free endpoint) on the prompt, and on the finished image. The prompt check fails
 *    CLOSED for paid media: if it cannot be reached the job is refused with "try again" and nothing is charged.
 * Neither the prompt nor the key is ever logged.
 */
import { moderateText } from "@/lib/create/platform/moderation";
import { higgsfieldConfigured } from "@/lib/higgsfield/client";
import { openaiBase, openaiKey } from "./config";

export const REFUSED_MESSAGE = "Keplar can't create that image. Try describing a different subject or scene.";
export const LIKENESS_MESSAGE = "Keplar doesn't create images of real people, or in the likeness of a real person. Describe a fictional person or a scene instead.";

const PLACE_OR_THING = new Set(
  "new san los las santa del de la le el the of and mount mt lake river bay beach island park city street st road avenue ave bridge tower castle palace temple church cathedral museum university college school hotel restaurant cafe coffee shop store market garden forest mountain valley desert coast harbor port airport station square center centre empire state golden gate eiffel big ben statue liberty great wall china taj mahal grand canyon niagara falls times silicon sydney opera house white house red blue green black yellow orange mediterranean pacific atlantic north south east west central northern southern eastern western japan japanese korean chinese french italian spanish german american british mexican indian african asian european scandinavian nordic tuscan swiss alpine".split(" "),
);

type Rule = { test: RegExp; message: string; category: string };

const RULES: Rule[] = [
  { category: "sexual/minors", message: REFUSED_MESSAGE, test: /\b(child|children|minor|underage|teen|teenager|kid|toddler|baby|schoolgirl|schoolboy|loli|shota|young (?:girl|boy))\b[\s\S]{0,60}\b(nude|naked|sexual|sexy|explicit|nsfw|porn|erotic|lingerie|topless|bikini)\b|\b(nude|naked|sexual|sexy|explicit|nsfw|porn|erotic|lingerie|topless)\b[\s\S]{0,60}\b(child|children|minor|underage|teen|teenager|kid|toddler|baby|schoolgirl|schoolboy|loli|shota|young (?:girl|boy))\b/i },
  { category: "sexual/explicit", message: REFUSED_MESSAGE, test: /\b(porn\w*|hentai|erotic|explicit sex|sex scene|nsfw|nude|naked|topless|genitals?|hardcore)\b/i },
  { category: "non-consensual", message: LIKENESS_MESSAGE, test: /\b(deep ?fakes?|undress\w*|nudify|face[- ]?swap\w*|revenge porn|leaked (?:nudes?|photos?))\b/i },
  { category: "violence/graphic", message: REFUSED_MESSAGE, test: /\b(gore|gory|beheading|decapitat\w+|dismember\w*|mutilat\w+|torture|snuff)\b/i },
  { category: "self-harm", message: REFUSED_MESSAGE, test: /\b(suicide method|how to (?:kill|hang) (?:myself|yourself)|self[- ]harm (?:scene|image))\b/i },
  { category: "weapons-instructions", message: REFUSED_MESSAGE, test: /\b(bomb (?:making|instructions|diagram)|how to (?:make|build) (?:a )?(?:bomb|explosive|nerve agent))\b/i },
  { category: "hate", message: REFUSED_MESSAGE, test: /\b(swastika|ss runes|kkk (?:rally|robes)|nazi (?:propaganda|poster))\b/i },
  // Real-person likeness: intent words, public roles and named people.
  { category: "likeness/intent", message: LIKENESS_MESSAGE, test: /\b(lookalike|look-?alike|in the likeness of|as if (?:he|she|they) (?:were|was)|impersonat\w+|pretend(?:s|ing)? to be|fake (?:photo|picture|image|screenshot|endorsement)|(?:real|actual) person)\b/i },
  { category: "likeness/role", message: LIKENESS_MESSAGE, test: /\b(?:photo|photograph|picture|image|portrait|headshot|selfie|caricature|likeness|face|mugshot|bust)\b[\s\S]{0,12}\bof\b[\s\S]{0,12}\b(?:the )?(?:current |former |real )?(?:president|prime minister|chancellor|senator|congress(?:man|woman)|governor|mayor|politician|celebrity|actor|actress|singer|rapper|athlete|footballer|billionaire|ceo|king|queen|pope|dictator)\b/i },
];

// "portrait of Taylor Swift", "photo of Elon Musk", "Barack Obama holding a sign"
const DEPICT = /\b(?:photo|photograph|picture|image|portrait|headshot|selfie|caricature|likeness|painting|drawing|illustration|render|poster|mugshot|bust|statue|video|face)s?\s+(?:of|featuring|showing|depicting)\s+((?:[A-Z][\p{L}'’.-]+)(?:\s+(?:[A-Z][\p{L}'’.-]+|de|van|von|bin|al)){1,2})/u;
const LOOKS_LIKE = /\b(?:looks?|resembl\w+)\s+(?:exactly\s+|just\s+)?like\s+((?:[A-Z][\p{L}'’.-]+)(?:\s+[A-Z][\p{L}'’.-]+){1,2})/u;
const NAMED_DOING = /(?:^|[.!?]\s+)((?:[A-Z][\p{L}'’-]+)\s+(?:[A-Z][\p{L}'’-]+))\s+(?:is|are|was|holding|wearing|smiling|standing|sitting|walking|giving|shaking|kissing|hugging|endorsing|promoting)\b/u;

function looksLikeAName(candidate: string): boolean {
  const words = candidate.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, ""));
  if (words.some((w) => PLACE_OR_THING.has(w))) return false;
  // all words must look like name parts (letters only)
  return words.length >= 2 && words.every((w) => w.length >= 2);
}

export type LocalVerdict = { ok: true } | { ok: false; message: string; category: string };

export function checkImagePromptLocal(prompt: string): LocalVerdict {
  for (const r of RULES) if (r.test.test(prompt)) return { ok: false, message: r.message, category: r.category };
  const m = DEPICT.exec(prompt) ?? NAMED_DOING.exec(prompt) ?? LOOKS_LIKE.exec(prompt);
  if (m && looksLikeAName(m[1])) return { ok: false, message: LIKENESS_MESSAGE, category: "likeness/named" };
  return { ok: true };
}

export type PromptVerdict = { ok: true } | { ok: false; message: string; category: string; transient?: boolean };

type ModerationResponse = { results?: { flagged?: boolean; categories?: Record<string, boolean> }[] };

async function openaiModerate(input: unknown): Promise<ModerationResponse | null> {
  const key = openaiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${openaiBase()}/moderations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ModerationResponse;
  } catch {
    return null;
  }
}

/** Local rules, the shared site rules, then OpenAI moderation (fail closed when it cannot be reached). */
export async function checkImagePrompt(prompt: string): Promise<PromptVerdict> {
  const local = checkImagePromptLocal(prompt);
  if (!local.ok) return local;
  const shared = await moderateText(prompt);
  if (!shared.allowed) return { ok: false, message: REFUSED_MESSAGE, category: shared.category ?? "policy" };
  const r = await openaiModerate(prompt);
  // Higgsfield-only setup (no OpenAI key): the local rules, the shared moderation and Higgsfield's own NSFW filter apply.
  if (!r && !openaiKey() && higgsfieldConfigured()) return { ok: true };
  if (!r?.results?.[0]) return { ok: false, message: "Keplar couldn't run its safety check just now, so nothing was created or charged. Try again in a moment.", category: "unavailable", transient: true };
  if (r.results[0].flagged) return { ok: false, message: REFUSED_MESSAGE, category: Object.entries(r.results[0].categories ?? {}).find(([, v]) => v)?.[0] ?? "policy" };
  return { ok: true };
}

/** Looks at the finished image. Fails open (the image API already filters its own output): a flagged image is dropped. */
export async function checkImageOutput(bytes: Buffer, contentType: string, prompt: string): Promise<{ ok: boolean }> {
  const r = await openaiModerate([
    { type: "text", text: prompt.slice(0, 1000) },
    { type: "image_url", image_url: { url: `data:${contentType};base64,${bytes.toString("base64")}` } },
  ]);
  if (!r?.results?.[0]) return { ok: true };
  return { ok: !r.results[0].flagged };
}

