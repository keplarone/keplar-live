/**
 * Create references: a link, a document or an image turned into a compact, original-safe brief the app builder can use
 * as inspiration (structure, palette, type, tone), never as content to copy. Images are read by a vision model
 * (free `:free` vision models on Free); links and documents are summarised in code from what the readers extracted.
 */
import { liveEnv } from "@/lib/orchestration/config";
import { HttpError } from "@/lib/create/platform/http";

export const FREE_VISION_MODELS = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "dots-studio/dots-3-note-preview:free", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"] as const;
export const PAID_VISION_MODELS = ["google/gemini-3.1-flash-lite", "google/gemini-3.5-flash"] as const;

const PROMPT = "You are a senior product designer. Describe this image as a design reference for building an app or website, in at most 110 words, as short labeled lines: Layout, Palette (4-6 hex values you can see), Type, Mood, Components. Describe style only. Do not transcribe brand names, logos or long text from the image.";

export async function describeReference(dataUrl: string, plan: string, signal: AbortSignal): Promise<string> {
  const free = !plan || plan === "free";
  const env = liveEnv(free ? "free" : "paid");
  if (!env.openRouterKey) throw new HttpError(503, "Image references aren't connected yet.", "not_configured");
  const models = free ? FREE_VISION_MODELS : [...PAID_VISION_MODELS, ...FREE_VISION_MODELS];
  for (const model of models) {
    try {
      const r = await fetch(`${env.openRouterBase}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.openRouterKey}`, "content-type": "application/json", "HTTP-Referer": env.appUrl, "X-Title": "Keplar" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }], max_tokens: 400, temperature: 0.2, ...(free ? { reasoning: { effort: "none", exclude: true } } : {}) }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { choices?: { message?: { content?: string | null } }[] };
      const t = (j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (t.length > 20) return t.slice(0, 900);
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }
  throw new HttpError(503, free ? "The free vision models are busy. Try the image again in a minute." : "Couldn't read that image right now. Try again.", "vision_busy");
}

export { linkBrief, referenceBlock } from "./reference-brief";
