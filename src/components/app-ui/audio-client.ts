"use client";
/**
 * Audio for the composer: the sound track of an attached video, or an audio file, decoded in the browser (Web Audio),
 * mixed to mono, resampled to 16 kHz and cut into ≤ 55 s WAV chunks that /api/keplar/transcribe turns into text.
 * Nothing is uploaded until the chunks are sent, and only the transcript travels with the question.
 */
import { AUDIO_CHUNK_SECONDS, AUDIO_SAMPLE_RATE } from "@/lib/attachments/kinds";
import { fmtClockLong } from "@/lib/attachments/time";

export class NoAudioError extends Error {}
export class AudioTooLongError extends Error {
  constructor(public seconds: number, public max: number) {
    super("too-long");
  }
}

/** 16-bit PCM mono WAV from float samples. */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Decode a file's audio track to 16 kHz mono. Throws NoAudioError when there is no (audible) audio. */
export async function decodeMono16k(file: File, maxSeconds: number): Promise<{ samples: Float32Array; seconds: number }> {
  const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC || typeof OfflineAudioContext === "undefined") throw new NoAudioError("unsupported");
  const ctx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new NoAudioError("no-track");
  } finally {
    void ctx.close().catch(() => undefined);
  }
  if (decoded.duration > maxSeconds + 1) throw new AudioTooLongError(decoded.duration, maxSeconds);
  const length = Math.ceil(decoded.duration * AUDIO_SAMPLE_RATE);
  const off = new OfflineAudioContext(1, Math.max(1, length), AUDIO_SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  const samples = out.getChannelData(0);
  // Silent track (screen recordings often have one): skip the model calls.
  let peak = 0;
  for (let i = 0; i < samples.length; i += 97) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 0.01) throw new NoAudioError("silent");
  return { samples, seconds: decoded.duration };
}

/** Transcribe a file's speech. Chunks run two at a time; progress reports finished chunks. Returns "[m:ss] text" lines. */
export async function transcribe(file: File, maxSeconds: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<{ text: string; seconds: number; failed: number }> {
  const { samples, seconds } = await decodeMono16k(file, maxSeconds);
  const per = AUDIO_CHUNK_SECONDS * AUDIO_SAMPLE_RATE;
  const chunks: { at: number; blob: Blob }[] = [];
  for (let i = 0; i < samples.length; i += per) chunks.push({ at: i / AUDIO_SAMPLE_RATE, blob: encodeWav(samples.subarray(i, Math.min(samples.length, i + per)), AUDIO_SAMPLE_RATE) });
  const results: (string | null)[] = new Array(chunks.length).fill(null);
  let done = 0, failed = 0, firstError: string | null = null;
  onProgress?.(0, chunks.length);
  const run = async (k: number) => {
    try {
      const res = await fetch("/api/keplar/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: chunks[k].blob, signal });
      const j = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok) { failed++; firstError ??= j?.error ?? null; return; }
      results[k] = (j?.text ?? "").trim();
    } catch (e) {
      if (signal?.aborted) throw e;
      failed++;
    } finally {
      done++;
      onProgress?.(done, chunks.length);
    }
  };
  for (let k = 0; k < chunks.length; k += 2) await Promise.all([run(k), k + 1 < chunks.length ? run(k + 1) : Promise.resolve()]);
  if (failed === chunks.length) throw new Error(firstError ?? "Speech-to-text is unavailable right now.");
  const text = results.map((t, k) => (t ? `[${fmtClockLong(chunks[k].at)}] ${t}` : "")).filter(Boolean).join("\n");
  return { text, seconds, failed };
}
