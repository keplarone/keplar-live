import { UNCLASSIFIED } from "../comparator";
import { frameLabel, type ImageInput } from "../media";
import type { Citation, Classification, GenerationParams, ModelSpec, ProviderResult } from "../types";
import { identityPrompt } from "@/lib/identity";
import { VOICE_PROMPT_SHORT } from "@/lib/persona";
import { HUMAN_TONE_SHORT } from "@/lib/persona-tone";
import { SAFETY_DEFAULTS_PROMPT } from "@/lib/safety/screen";
import { CLARITY_STYLE_SHORT, GROUNDING_STYLE } from "@/lib/style/clarity";

/** One delimiter convention for every model so the app can render math reliably (KaTeX); the same line goes to the synthesizer. */
export const MATH_STYLE =
  "When you write math, use LaTeX with \\( ... \\) for inline math and $$ ... $$ on its own lines for display math; never bare $...$, and never put math in code blocks. Write money in plain text (for example $5).";

/**
 * The shape of a good answer, the part people compare first: the answer comes first, the form follows the request (a list when they ask for N things
 * or steps, a fenced code block for every piece of code with the fix shown, a table only for a real comparison), and the length follows the question
 * (a sentence for a quick one, concrete specifics for a how-to), never one dense paragraph and never filler.
 */
export const FORMAT_STYLE =
  "Give the answer first, then only what helps. Follow the shape the request asks for: a numbered list when they ask for several things, options or steps (one bold lead and one concrete line each, with a number, example or price where it helps); every piece of code in a fenced code block with its language, complete enough to run, with the fix shown and not only described; a short table only for a real side-by-side comparison. Match the length to the question: a sentence or two for a quick one, concrete specifics for how-to and decision questions, and never one dense paragraph or padding.";

export const BASE_SYSTEM_PROMPT =
  "You are one of several independent models consulted by Keplar. Answer the user's request directly. State your position clearly, then the claims it rests on. Say when you are unsure of a fact. " + FORMAT_STYLE + " " + CLARITY_STYLE_SHORT + " " + GROUNDING_STYLE + " " + VOICE_PROMPT_SHORT + " " + HUMAN_TONE_SHORT + " A short follow-up (a name, \"according to X\", \"his net worth\") continues the conversation's last question rather than starting a new topic. Read questions with common sense: never give an answer that contradicts basic facts (for example, every person dies; no one lives for centuries). " + MATH_STYLE + " " + SAFETY_DEFAULTS_PROMPT;

/** Default system prompt for every model call: the base instructions plus who made Keplar (the age is computed per call). */
export const systemPrompt = (): string => `${BASE_SYSTEM_PROMPT}\n\n${identityPrompt()}`;
/** As of server start (tests/compat); calls use `systemPrompt()`. */
export const SYSTEM_PROMPT = systemPrompt();

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "high" | "auto" } };

/**
 * User message content. Text only without images; with images (vision models
 * on media questions): the preamble, then each image or video frame preceded by
 * its label (frames in time order), then the question. OpenAI-compatible
 * `image_url` parts with base64 data URLs (OpenRouter and OpenAI accept them;
 * no external storage).
 */
export function userContent(prompt: string, images?: ImageInput[], preamble?: string): string | ContentPart[] {
  if (!images?.length) return prompt;
  const parts: ContentPart[] = [];
  if (preamble) parts.push({ type: "text", text: preamble });
  for (const img of images) {
    parts.push({ type: "text", text: frameLabel(img) });
    parts.push({ type: "image_url", image_url: img.frame ? { url: img.dataUrl } : { url: img.dataUrl, detail: "high" } }); // stills at full detail; sampled video frames keep the default
  }
  parts.push({ type: "text", text: `Question: ${prompt}` });
  return parts;
}

/** OpenAI-compatible chat body with only the parameters the model accepts (already sanitised). */
export function chatBody(modelSlug: string, prompt: string, params: GenerationParams, system: string = systemPrompt(), images?: ImageInput[], preamble?: string) {
  const body: Record<string, unknown> = {
    model: modelSlug,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent(prompt, images, preamble) },
    ],
    max_tokens: params.maxOutputTokens ?? 2000,
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.topP !== undefined) body.top_p = params.topP;
  if (params.logprobs) body.logprobs = true;
  if (params.reasoningOff) body.reasoning = { enabled: false };
  else if (params.reasoningEffort) body.reasoning = { effort: params.reasoningEffort };
  return body;
}

type ChatResponse = {
  model?: string;
  provider?: string;
  choices?: {
    message?: {
      content?: string | null;
      refusal?: string | null;
      annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

const URL_RX = /https?:\/\/[^\s<>()\[\]"'`]+/g;
const MD_LINK_RX = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g;

/** Trim trailing punctuation a sentence leaves on a bare URL. */
const tidy = (u: string) => u.replace(/[.,;:!?*_]+$/, "");

/**
 * Sources a model cited itself: url_citation annotations plus markdown links and
 * bare URLs in its text. Only http(s) URLs with a real host; at most 8, de-duplicated.
 * Keplar never fetches or checks these; the UI labels them "Cited by models".
 */
export function extractCitations(text: string, annotations?: NonNullable<NonNullable<ChatResponse["choices"]>[number]["message"]>["annotations"]): Citation[] {
  const out = new Map<string, Citation>();
  const add = (url: string, title?: string) => {
    const u = tidy(url);
    try {
      const parsed = new URL(u);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.)/.test(parsed.hostname)) return;
    } catch {
      return;
    }
    const prev = out.get(u);
    if (!prev || (!prev.title && title)) out.set(u, { url: u, title: title?.trim() || prev?.title });
  };
  for (const a of annotations ?? []) if (a?.type === "url_citation" && a.url_citation?.url) add(a.url_citation.url, a.url_citation.title);
  for (const m of text.matchAll(MD_LINK_RX)) add(m[2], m[1]);
  for (const m of text.matchAll(URL_RX)) add(m[0]);
  return [...out.values()].slice(0, 8);
}

/** Map an OpenAI-compatible response to a ProviderResult. Refusals are missing votes. */
export function fromChat(model: ModelSpec, res: ChatResponse, started: number, via: string, c: Classification): ProviderResult {
  const choice = res.choices?.[0];
  // Some open-weight hosts inline their reasoning as <think>…</think>; it is never shown or compared.
  const text = (choice?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>\s*/g, "").replace(/^[\s\S]*?<\/think>\s*/, "");
  const latencyMs = Date.now() - started;
  if (choice?.message?.refusal || choice?.finish_reason === "refusal" || choice?.finish_reason === "content_filter") {
    return { ok: false, modelId: model.id, reason: "refusal", message: "The model declined to answer.", latencyMs };
  }
  if (!text.trim()) return { ok: false, modelId: model.id, reason: "error", message: choice?.finish_reason === "length" ? "Ran out of output tokens before answering." : "Empty response.", latencyMs };
  return {
    ok: true,
    modelId: model.id,
    stance: UNCLASSIFIED,
    claims: [],
    text,
    latencyMs,
    usage: {
      inputTokens: res.usage?.prompt_tokens ?? c.estimatedInputTokens,
      outputTokens: res.usage?.completion_tokens ?? 0,
    },
    actualCostUsd: typeof res.usage?.cost === "number" ? res.usage.cost : undefined,
    servedBy: { model: res.model ?? model.id, provider: res.provider, via },
    citations: extractCitations(text, choice?.message?.annotations),
  };
}

export type { ChatResponse };
