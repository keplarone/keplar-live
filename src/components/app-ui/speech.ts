"use client";
/**
 * Read-aloud for answers (Voice mode, BETA) with the browser's speechSynthesis. One answer speaks at a time; the store is shared so
 * every answer card's Listen button, the Talk button and Escape agree on what is playing.
 * - Text is turned into short utterances (see src/lib/voice-mode.ts) so stopping is instant and long answers are not cut off.
 * - Prefers an on-device voice in the user's language. Nothing is sent to Keplar: the text is already on the page.
 * - No audio is recorded or stored; the browser plays it.
 * - Auto-read: a question asked by voice "arms" the next answer card to read itself (once, within 3 minutes).
 */
import { useSyncExternalStore } from "react";
import { voiceLang } from "@/lib/voice";
import { chunkForSpeech, pickVoice, speakableText, voiceSupport } from "@/lib/voice-mode";

export type SpeechSnapshot = { speakingId: string | null; truncated: boolean; error: string | null; armedAt: number; /** The microphone is open (Voice mode Talk): nothing starts speaking meanwhile, so it can't hear itself. */ micOpen: boolean };

const ARM_MS = 3 * 60_000;
let snap: SpeechSnapshot = { speakingId: null, truncated: false, error: null, armedAt: 0, micOpen: false };
let token = 0;
const subs = new Set<() => void>();
const set = (p: Partial<SpeechSnapshot>) => { snap = { ...snap, ...p }; subs.forEach((f) => f()); };

const synth = (): SpeechSynthesis | null => {
  if (typeof window === "undefined") return null;
  return voiceSupport(window as never).synthesis ? window.speechSynthesis : null;
};
export const speechSupported = () => synth() !== null;

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && snap.speakingId) stopSpeaking();
}
let wired = false;
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pagehide", () => stopSpeaking());
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopSpeaking(); }); // never talk from a background tab
}

export function stopSpeaking() {
  token++;
  try { synth()?.cancel(); } catch { /* ignore */ }
  if (snap.speakingId) set({ speakingId: null, truncated: false });
}

/** Starts reading `markdown` as answer `id`. Returns false when this browser can't. */
export function speakAnswer(id: string, markdown: string): boolean {
  const s = synth();
  if (!s) return false;
  wire();
  stopSpeaking();
  const { text, truncated } = speakableText(markdown);
  const chunks = chunkForSpeech(text);
  if (!chunks.length) return false;
  const my = ++token;
  const lang = voiceLang(typeof navigator === "undefined" ? undefined : navigator);
  const voices = s.getVoices();
  const vi = pickVoice(voices.map((v) => ({ lang: v.lang, localService: v.localService, default: v.default, name: v.name })), lang);
  set({ speakingId: id, truncated, error: null });
  const next = (i: number) => {
    if (token !== my) return; // stopped or replaced
    if (i >= chunks.length) { set({ speakingId: null }); return; }
    const u = new SpeechSynthesisUtterance(chunks[i]);
    u.lang = lang;
    if (vi >= 0) u.voice = voices[vi];
    u.onend = () => next(i + 1);
    u.onerror = (e) => {
      if (token !== my) return;
      const code = (e as SpeechSynthesisErrorEvent).error;
      if (code === "canceled" || code === "interrupted") return;
      token++;
      set({ speakingId: null, error: code === "not-allowed" ? "Your browser blocked audio until you interact with the page. Tap Listen to start." : "Couldn't play the answer aloud in this browser." });
    };
    try { s.speak(u); } catch { token++; set({ speakingId: null, error: "Couldn't play the answer aloud in this browser." }); }
  };
  next(0);
  return true;
}

export const armReadback = () => set({ armedAt: Date.now() });
export const disarmReadback = () => { if (snap.armedAt) set({ armedAt: 0 }); };
/** True when an answer card that appeared at `mountedAt` should read itself: a voice question armed it just before, and no one used it yet. */
export const shouldAutoRead = (mountedAt: number) => !snap.micOpen && snap.armedAt > 0 && mountedAt >= snap.armedAt && Date.now() - snap.armedAt < ARM_MS;
export const setMicOpen = (micOpen: boolean) => { if (snap.micOpen !== micOpen) set({ micOpen }); };

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => snap;
const server = (): SpeechSnapshot => ({ speakingId: null, truncated: false, error: null, armedAt: 0, micOpen: false });
export const useSpeech = () => useSyncExternalStore(subscribe, get, server);
export const clearSpeechError = () => set({ error: null });
