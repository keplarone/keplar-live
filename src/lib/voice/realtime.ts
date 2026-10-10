/**
 * Live voice (real-time speech to speech), behind a provider switch. Off unless the owner opts in:
 *   KEPLAR_REALTIME_VOICE=openai   and   OPENAI_API_KEY set   (optional: KEPLAR_REALTIME_MODEL, KEPLAR_REALTIME_VOICE_NAME)
 * Paid plans only: Free must stay on OpenRouter :free models, and a hosted voice model is neither free nor on OpenRouter.
 * The browser sends its WebRTC offer to Keplar; Keplar forwards it with its server key (the key never reaches the browser) and returns
 * the answer. Audio then flows browser <-> provider directly. Nothing is recorded by Keplar. A live voice reply is ONE model, not the
 * cross-checked panel: the UI says so and offers to send the transcript to the panel for checking.
 */
import { createHash } from "node:crypto";

export type RealtimeAvailability = { available: true; provider: "openai"; model: string } | { available: false; reason: "not_configured" | "plan" | "signin" };

export const REALTIME_LIMITS = { sdpBytes: 20_000, sessionsPerHour: 12, maxMinutes: 10 } as const;
export const OPENAI_REALTIME_CALLS = "https://api.openai.com/v1/realtime/calls";

export function realtimeProvider(env: Record<string, string | undefined> = process.env): { provider: "openai"; model: string; voice: string } | null {
  if ((env.KEPLAR_REALTIME_VOICE ?? "").trim().toLowerCase() !== "openai" || !env.OPENAI_API_KEY) return null;
  return { provider: "openai", model: env.KEPLAR_REALTIME_MODEL?.trim() || "gpt-realtime", voice: env.KEPLAR_REALTIME_VOICE_NAME?.trim() || "marin" };
}

export function realtimeAvailability(ws: { plan: string; anonymous?: boolean; userId?: string | null }, env: Record<string, string | undefined> = process.env): RealtimeAvailability {
  if (ws.anonymous || !ws.userId) return { available: false, reason: "signin" };
  const p = realtimeProvider(env);
  if (!p) return { available: false, reason: "not_configured" };
  if (ws.plan === "free") return { available: false, reason: "plan" };
  return { available: true, provider: p.provider, model: p.model };
}

/** A WebRTC offer from the browser: plain SDP text, bounded, starting with the version line. */
export function validOffer(sdp: unknown): sdp is string {
  return typeof sdp === "string" && sdp.length > 20 && sdp.length <= REALTIME_LIMITS.sdpBytes && sdp.startsWith("v=0") && /\r?\nm=audio /.test(sdp);
}

export const VOICE_INSTRUCTIONS = [
  "You are Keplar's live voice. Speak briefly and plainly, like a careful expert on a call.",
  "You are one model answering in real time, not Keplar's cross-checked panel. Say so if the person relies on you for something important,",
  "and suggest they send the question to Keplar in text so several models can check it. Say when you are unsure. Never invent sources.",
].join(" ");

export function sessionConfig(p: { model: string; voice: string }): string {
  return JSON.stringify({
    type: "realtime",
    model: p.model,
    instructions: VOICE_INSTRUCTIONS,
    audio: { input: { transcription: { model: "gpt-4o-mini-transcribe" }, turn_detection: { type: "semantic_vad" } }, output: { voice: p.voice } },
  });
}

/** A stable, non-reversible id for the provider's abuse tooling (no email or account id is sent). */
export const safetyId = (userId: string) => createHash("sha256").update(`keplar-voice:${userId}`).digest("hex").slice(0, 32);
