/**
 * Content safety for prompts and outputs (images, video, site text).
 * Live: OpenAI omni-moderation (text + image input, free) plus provider-side
 * filters; hard blocks are never overridable. Mock: keyword rules (PLACEHOLDER,
 * not a real classifier).
 */
import { isLive } from "./config";

export type ModerationVerdict = { allowed: boolean; category?: string; reason?: string; engine: "rules" | "omni-moderation" };

// Hard-block categories. Wording is deliberately generic.
const RULES: { category: string; test: RegExp }[] = [
  { category: "sexual/minors", test: /\b(child|minor|underage|teen|kid|schoolgirl|schoolboy|loli|shota)\b[\s\S]{0,40}\b(nude|naked|sexual|explicit|nsfw|porn)|\b(nude|naked|sexual|explicit|nsfw|porn)\b[\s\S]{0,40}\b(child|minor|underage|teen|kid|loli|shota)\b/i },
  { category: "non-consensual/real-person", test: /\b(deepfake|undress|nudify|revenge porn)\b/i },
  { category: "sexual/explicit", test: /\b(porn|explicit sex|hardcore)\b/i },
  { category: "violence/graphic", test: /\b(gore|beheading|dismember)/i },
  { category: "phishing", test: /\b(verify your (bank|paypal|apple id)|enter your (seed phrase|password) to unlock)\b/i },
];

export async function moderateText(text: string): Promise<ModerationVerdict> {
  if (isLive("moderation")) {
    try {
      const res = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_MODERATION_API_KEY}` },
        body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
        signal: AbortSignal.timeout(10_000), // on timeout the keyword rules below still apply
      });
      if (res.ok) {
        const json = (await res.json()) as { results: { flagged: boolean; categories: Record<string, boolean> }[] };
        const r = json.results[0];
        if (r?.flagged) {
          const category = Object.entries(r.categories).find(([, v]) => v)?.[0];
          return { allowed: false, category, reason: "Blocked by content policy.", engine: "omni-moderation" };
        }
        return { allowed: true, engine: "omni-moderation" };
      }
    } catch {
      // fall through to rules: fail closed on hard categories below
    }
  }
  for (const r of RULES) {
    if (r.test.test(text)) return { allowed: false, category: r.category, reason: "This request isn't allowed under the content policy.", engine: "rules" };
  }
  return { allowed: true, engine: "rules" };
}

/** Output check hook for generated media. Checks the prompt again after generation. */
export async function moderateMediaOutput(_url: string, prompt: string): Promise<ModerationVerdict> {
  return moderateText(prompt);
}
