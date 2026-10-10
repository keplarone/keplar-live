/**
 * Voice dictation helpers (pure, unit-tested). The browser's Web Speech API does the recognition; Keplar never
 * receives or stores audio. Unsupported browsers (e.g. Firefox) get no mic button.
 */
export type VoiceState = "idle" | "listening" | "processing" | "error";
export type VoiceErrorKind = "denied" | "no-mic" | "no-speech" | "network" | "unsupported" | "other";

export const VOICE_MAX_SECONDS = 120;

export const VOICE_ERRORS: Record<VoiceErrorKind, string> = {
  denied: "Microphone access is blocked. Allow it in your browser's site settings, then try again. You can keep typing.",
  "no-mic": "No microphone was found. Connect one, or keep typing.",
  "no-speech": "I didn't hear anything. Tap the mic and try again, or keep typing.",
  network: "Your browser's speech service isn't reachable right now. Keep typing, or try again in a moment.",
  unsupported: "Voice input isn't supported in this browser. Keep typing.",
  other: "Voice input stopped unexpectedly. Keep typing, or try again.",
};

/** Maps a SpeechRecognition `error` code to our error kind (null = not an error worth showing, e.g. an abort). */
export function classifyVoiceError(code: string): VoiceErrorKind | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "audio-capture":
      return "no-mic";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return null;
    default:
      return "other";
  }
}

/** Joins existing text and a dictated chunk with one space (or none after a newline / at the start). */
export function joinDictation(base: string, chunk: string): string {
  const c = chunk.replace(/\s+/g, " ").trim();
  if (!c) return base;
  if (!base) return c;
  return /\s$/.test(base) ? base + c : `${base} ${c}`;
}

type Res = { isFinal: boolean; 0: { transcript: string } };

/** Splits a SpeechRecognition result list (from `from`) into text that is final and text still being recognised. */
export function splitResults(results: ArrayLike<Res>, from = 0): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let i = from; i < results.length; i++) {
    const t = results[i][0]?.transcript ?? "";
    if (results[i].isFinal) final += t;
    else interim += t;
  }
  return { final, interim };
}

/** The recognition language follows the user's locale (BCP 47), defaulting to English. */
export function voiceLang(nav: { language?: string; languages?: readonly string[] } | undefined): string {
  const l = nav?.languages?.[0] || nav?.language;
  return typeof l === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l) ? l : "en-US";
}

export const voiceStatusText: Record<VoiceState, string> = {
  idle: "",
  listening: "Listening. Speak now; your words appear in the message box. Tap the microphone to stop.",
  processing: "Finishing your dictation.",
  error: "",
};
