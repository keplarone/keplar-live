/**
 * Speech → text for the audio track of an attached video and for audio files (server only).
 *
 * The browser decodes the audio and sends ≤ 55 s chunks of 16 kHz mono 16-bit WAV (~1.8 MB each), so no request comes near
 * the body cap and no file is stored. Validation is strict (RIFF/WAVE, PCM 16-bit, mono, 8–48 kHz, ≤ 60 s).
 *
 * Models:
 *  - Free plan: OpenRouter `:free` models with audio input only (FREE_AUDIO_MODELS), never a priced model.
 *  - Paid plans: OpenAI speech-to-text (gpt-4o-mini-transcribe, then whisper-1) when OPENAI_API_KEY is set, then a low-cost
 *    OpenRouter audio model, then the free ones.
 */
import { liveEnv } from "@/lib/orchestration/config";

export const FREE_AUDIO_MODELS = ["nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "thinkingmachines/inkling-small:free", "thinkingmachines/inkling:free"] as const;
export const PAID_AUDIO_MODELS = ["google/gemini-3.1-flash-lite", "mistralai/voxtral-small-24b-2507"] as const;

export class AudioError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}

export type WavInfo = { sampleRate: number; channels: number; bits: number; seconds: number; dataOffset: number; dataBytes: number };

/** Parse and validate a PCM WAV header. */
export function wavInfo(b: Uint8Array): WavInfo {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length < 44 || s(0, 4) !== "RIFF" || s(8, 4) !== "WAVE") throw new AudioError("That audio isn't a WAV chunk.");
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 12, fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (p + 8 <= b.length) {
    const id = s(p, 4), size = dv.getUint32(p + 4, true);
    if (id === "fmt ") fmt = { format: dv.getUint16(p + 8, true), channels: dv.getUint16(p + 10, true), rate: dv.getUint32(p + 12, true), bits: dv.getUint16(p + 22, true) };
    if (id === "data") {
      if (!fmt) break;
      if (fmt.format !== 1 || fmt.bits !== 16 || fmt.channels !== 1 || fmt.rate < 8000 || fmt.rate > 48000) throw new AudioError("Audio must be 16-bit mono PCM.");
      const dataBytes = Math.min(size, b.length - p - 8);
      return { sampleRate: fmt.rate, channels: 1, bits: 16, seconds: dataBytes / (fmt.rate * 2), dataOffset: p + 8, dataBytes };
    }
    p += 8 + size + (size % 2);
  }
  throw new AudioError("That WAV chunk is damaged.");
}

/** Root-mean-square level of the samples (0..1): silence detection without a model call. */
export function rmsLevel(b: Uint8Array, info: WavInfo): number {
  const dv = new DataView(b.buffer, b.byteOffset + info.dataOffset, info.dataBytes - (info.dataBytes % 2));
  const n = dv.byteLength / 2;
  if (!n) return 0;
  let sum = 0;
  const step = Math.max(1, Math.floor(n / 50_000));
  let count = 0;
  for (let i = 0; i < n; i += step) { const v = dv.getInt16(i * 2, true) / 32768; sum += v * v; count++; }
  return Math.sqrt(sum / count);
}

const PROMPT = "Transcribe the speech in this audio exactly as spoken, in the language spoken. Output only the transcript text, with normal punctuation. Do not summarize, translate or add commentary. If there is no intelligible speech, output exactly: [no speech]";

/** Model replies sometimes wrap the transcript; keep only the words. */
export function cleanTranscript(t: string): string {
  return t.replace(/^```\w*\n?|\n?```$/g, "").replace(/^(here is|here's) (the )?transcript(ion)?:?\s*/i, "").replace(/^transcript(ion)?:\s*/i, "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function openAiTranscribe(wav: Uint8Array, key: string, signal: AbortSignal): Promise<string | null> {
  for (const model of ["gpt-4o-mini-transcribe", "whisper-1"]) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "chunk.wav");
    form.append("model", model);
    form.append("response_format", "json");
    try {
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form, signal });
      if (!r.ok) continue;
      const j = (await r.json()) as { text?: string };
      if (typeof j.text === "string") return j.text.trim();
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }
  return null;
}

async function openRouterTranscribe(wav: Uint8Array, models: readonly string[], key: string, base: string, appUrl: string, free: boolean, signal: AbortSignal): Promise<{ text: string; model: string } | null> {
  const data = Buffer.from(wav).toString("base64");
  for (const model of models) {
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "HTTP-Referer": appUrl, "X-Title": "Keplar" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "input_audio", input_audio: { data, format: "wav" } }] }],
          max_tokens: 1800,
          temperature: 0,
          ...(free ? { reasoning: { effort: "none", exclude: true }, provider: { data_collection: "allow" } } : {}),
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(40_000)]),
      });
      if (!r.ok) continue;
      const j = (await r.json()) as { choices?: { message?: { content?: string | null } }[] };
      const text = cleanTranscript(j.choices?.[0]?.message?.content ?? "");
      if (text) return { text, model };
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }
  return null;
}

/** Transcribe one validated WAV chunk. Returns "" for silence. */
export async function transcribeChunk(wav: Uint8Array, plan: string, signal: AbortSignal): Promise<{ text: string; engine: string }> {
  const info = wavInfo(wav);
  if (info.seconds > 62) throw new AudioError("Each audio chunk can be up to 60 seconds.");
  if (info.seconds < 0.3 || rmsLevel(wav, info) < 0.004) return { text: "", engine: "silence" };
  const free = !plan || plan === "free";
  const env = liveEnv(free ? "free" : "paid");
  if (!free) {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (key) {
      const t = await openAiTranscribe(wav, key, signal);
      if (t !== null) return { text: t, engine: "openai" };
    }
  }
  if (!env.openRouterKey) throw new AudioError("Speech-to-text isn't connected yet.", 503);
  const models = free ? FREE_AUDIO_MODELS : [...PAID_AUDIO_MODELS, ...FREE_AUDIO_MODELS];
  const r = await openRouterTranscribe(wav, models, env.openRouterKey, env.openRouterBase, env.appUrl, free, signal);
  if (!r) throw new AudioError(free ? "The free speech-to-text models are busy right now. Keplar used the video frames only. Try again in a minute." : "Speech-to-text is unavailable right now. Keplar used the video frames only.", 503);
  return { text: /^\[no speech\]$/i.test(r.text) ? "" : r.text, engine: r.model };
}
