"use client";
/**
 * Dictation into the composer with the browser's Web Speech API. Real states: idle / listening / processing / error.
 * - Permission is requested only when the mic is clicked (recognition.start()).
 * - Live transcript is written into the same text state the keyboard uses; typing while listening is never blocked:
 *   if the text changed under us we re-base on what the user typed instead of overwriting it.
 * - No audio is recorded or sent by Keplar; the browser's own speech service does the recognition.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { classifyVoiceError, joinDictation, splitResults, voiceLang, VOICE_ERRORS, VOICE_MAX_SECONDS, type VoiceErrorKind, type VoiceState } from "@/lib/voice";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type Ctor = new () => Rec;

const ctor = (): Ctor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function useVoice(opts: { getText: () => string; setText: (t: string) => void }) {
  // The Ask app only renders on the client (see AppLoader, ssr:false), so support is known on the very first render. Deferring it to an
  // effect inserted the Voice and Talk buttons a beat later and shoved the other tools sideways (a layout shift on every /app load).
  const [supported] = useState(() => Boolean(ctor()));
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<{ kind: VoiceErrorKind; message: string } | null>(null);
  const rec = useRef<Rec | null>(null);
  const timer = useRef<number | null>(null);
  const live = useRef({ base: "", written: "", lastInterim: "", baked: 0 });
  const endCb = useRef<((ok: boolean) => void) | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const clearTimer = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    setState("processing");
    try {
      r.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  /** Immediately drop the session (on send, unmount): no further text is written. */
  const abort = useCallback(() => {
    clearTimer();
    const r = rec.current;
    rec.current = null;
    if (r) {
      r.onresult = r.onend = r.onerror = r.onstart = null;
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    }
    setState("idle");
  }, []);

  useEffect(() => abort, [abort]);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) {
      setError({ kind: "unsupported", message: VOICE_ERRORS.unsupported });
      setState("error");
      return;
    }
    if (rec.current) return;
    setError(null);
    const r = new C();
    r.lang = voiceLang(typeof navigator === "undefined" ? undefined : navigator);
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    const cur = optsRef.current.getText();
    live.current = { base: cur, written: cur, lastInterim: "", baked: 0 };
    let failed = false;

    r.onstart = () => {
      setState("listening");
      clearTimer();
      timer.current = window.setTimeout(() => stop(), VOICE_MAX_SECONDS * 1000);
    };
    r.onresult = (e) => {
      const L = live.current;
      const now = optsRef.current.getText();
      if (now !== L.written) {
        // The user typed or edited while we were listening: keep their text, continue after it.
        L.base = L.lastInterim && now.endsWith(L.lastInterim) ? now.slice(0, now.length - L.lastInterim.length).trimEnd() : now;
        L.baked = e.resultIndex;
      }
      const { final, interim } = splitResults(e.results, L.baked);
      const next = joinDictation(joinDictation(L.base, final), interim);
      L.lastInterim = interim.trim();
      L.written = next;
      optsRef.current.setText(next);
    };
    r.onerror = (e) => {
      const kind = classifyVoiceError(e.error);
      if (!kind) return;
      failed = true;
      setError({ kind, message: VOICE_ERRORS[kind] });
      setState("error");
    };
    r.onend = () => {
      clearTimer();
      rec.current = null;
      setState((s) => (failed ? s : "idle"));
      endCb.current?.(!failed); // Voice mode: a finished session (not an error) can send what was heard
    };
    rec.current = r;
    try {
      r.start(); // the browser asks for microphone permission here, because of the user's click
    } catch {
      rec.current = null;
      setError({ kind: "other", message: VOICE_ERRORS.other });
      setState("error");
    }
  }, [stop]);

  const toggle = useCallback(() => {
    if (state === "listening") stop();
    else if (state === "idle" || state === "error") start();
  }, [state, start, stop]);

  /** Voice mode registers one listener that runs when a session ends (ok = it ended without an error). */
  const onEnd = useCallback((fn: ((ok: boolean) => void) | null) => { endCb.current = fn; }, []);

  return { supported, state, error, toggle, start, stop, abort, onEnd, dismissError: () => { setError(null); setState((s) => (s === "error" ? "idle" : s)); } };
}
