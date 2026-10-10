"use client";
/**
 * Voice mode "Talk" button (BETA). Ask by voice, hear the answer.
 *  - Hold the button (pointer, or Space/Enter held) to talk, release to send: push-to-talk.
 *  - Quick tap: keep listening hands-free; tap again to send. (Holding is hard for some people, so a tap works too.)
 *  - While an answer is being read aloud the button is "Stop": one tap stops playback. Escape also stops it, or cancels listening.
 *  - The microphone is asked for only when the button is pressed. A blocked microphone is explained, never retried silently.
 *  - Recognition and playback are the browser's. Keplar records and stores no audio.
 * Without SpeechRecognition (e.g. Firefox) the button explains that, honestly, and typing keeps working.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_ERRORS } from "@/lib/voice";
import { isTap, unsupportedMessage, voiceSupport, type VoiceSupport } from "@/lib/voice-mode";
import { IconStopSquare, IconTalk } from "./icons";
import { setMicOpen, stopSpeaking, useSpeech } from "./speech";
import type { useVoice } from "./useVoice";

type Voice = ReturnType<typeof useVoice>;

export function VoiceTalk({ voice, className, labelClass, disabled, onNote, onAsk }: { voice: Voice; className: string; labelClass: string; disabled?: boolean; onNote: (text: string | null) => void; /** The session ended with a result: send it. */ onAsk: () => void }) {
  const sp = useSpeech();
  // Client-only tree (AppLoader is ssr:false): read support on the first render so the button never pops in and shifts the tools row.
  const [support] = useState<VoiceSupport | null>(() => (typeof window === "undefined" ? null : voiceSupport(window as never)));
  const [latched, setLatched] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [live, setLive] = useState("");
  const active = useRef(false); // a talk session was started by this button
  const askAfter = useRef(false);
  const press = useRef({ at: 0, stopped: false, finishing: false, via: 0 });
  const onAskRef = useRef(onAsk);
  useEffect(() => { onAskRef.current = onAsk; });

  // Ask the permission state without prompting (Chrome/Edge/Firefox expose it; Safari may not, which is fine).
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const apply = () => setBlocked(status?.state === "denied");
    (async () => {
      try {
        status = await navigator.permissions.query({ name: "microphone" as PermissionName });
        apply();
        status.onchange = apply;
      } catch { /* not supported: we learn about a block when recognition starts */ }
    })();
    return () => { if (status) status.onchange = null; };
  }, []);

  const listeningNow = voice.state === "listening" || latched;
  useEffect(() => {
    setMicOpen(listeningNow);
    return () => setMicOpen(false);
  }, [listeningNow]);

  const { onEnd } = voice;
  useEffect(() => {
    onEnd((ok) => {
      const was = active.current && askAfter.current;
      active.current = false;
      setLatched(false);
      if (ok && was) { askAfter.current = false; onAskRef.current(); }
      askAfter.current = false;
    });
    return () => onEnd(null);
  }, [onEnd]);

  // Escape while listening cancels (nothing is sent).
  useEffect(() => {
    if (!active.current && !latched && voice.state !== "listening") return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !active.current) return;
      askAfter.current = false;
      active.current = false;
      voice.abort();
      setLatched(false);
      setLive("Canceled. Nothing was sent.");
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [voice, voice.state, latched]);

  const begin = useCallback(() => {
    onNote(null);
    setLive("");
    if (sp.speakingId) { stopSpeaking(); press.current.stopped = true; setLive("Stopped reading."); return; } // tap-to-stop
    if (active.current && (voice.state === "listening" || latched)) { press.current.finishing = true; askAfter.current = true; voice.stop(); setLive("Sending what I heard."); return; }
    if (voice.state === "processing") return;
    if (blocked) { onNote(VOICE_ERRORS.denied); return; }
    askAfter.current = true;
    active.current = true;
    press.current = { at: Date.now(), stopped: false, finishing: false, via: Date.now() };
    voice.start();
    setLive("Listening. Release to send, or tap once to keep listening and tap again to send. Escape cancels.");
  }, [sp.speakingId, voice, latched, blocked, onNote]);

  const release = useCallback(() => {
    const p = press.current;
    if (p.stopped || p.finishing) { press.current = { ...p, stopped: false, finishing: false }; return; }
    if (!active.current) return;
    if (isTap(Date.now() - p.at)) { setLatched(true); setLive("Still listening. Tap again to send."); return; }
    voice.stop();
    setLive("Sending what I heard.");
  }, [voice]);

  if (!support) return null;

  if (!support.recognition) {
    const msg = unsupportedMessage(support);
    return (
      <button type="button" className={className} aria-label="Voice mode (beta): not available in this browser" title={msg} onClick={() => onNote(msg)}>
        <IconTalk size={15} />
        <span className={labelClass}>Talk (beta)</span>
      </button>
    );
  }

  const speaking = sp.speakingId !== null;
  const listening = voice.state === "listening" || latched;
  const label = speaking ? "Stop" : listening ? (latched ? "Tap to send" : "Listening…") : voice.state === "processing" ? "Sending…" : "Talk (beta)";
  const aria = speaking ? "Stop reading the answer aloud" : listening ? (latched ? "Listening. Tap to send what you said" : "Listening. Release to send") : "Talk to Keplar (beta). Hold to talk and release to send, or tap once to keep listening";
  return (
    <>
      <button
        type="button"
        className={className}
        data-voice-btn={listening ? "listening" : voice.state === "processing" ? "processing" : speaking ? "speaking" : "idle"}
        data-talk=""
        aria-pressed={listening || speaking}
        aria-label={aria}
        title={blocked ? "Microphone is blocked for this site. Allow it in your browser's site settings." : "Voice mode (beta). Hold to talk, release to send; or tap once to keep listening. Your browser's speech service turns speech into text; Keplar doesn't record or store audio."}
        disabled={disabled || voice.state === "processing"}
        onPointerDown={(e) => { if (e.button !== 0 && e.pointerType === "mouse") return; e.currentTarget.setPointerCapture?.(e.pointerId); press.current.via = Date.now(); begin(); }}
        onPointerUp={() => { press.current.via = Date.now(); release(); }}
        onPointerCancel={() => { press.current.via = Date.now(); release(); }}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) { press.current.via = Date.now(); begin(); } } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); press.current.via = Date.now(); release(); } }}
        onClick={() => {
          // Assistive technology can activate a button with a bare click (no pointer or key events): treat it as a tap.
          if (Date.now() - press.current.via < 800) return;
          begin();
          if (active.current) setLatched(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {speaking ? <IconStopSquare size={15} /> : <IconTalk size={15} />}
        <span className={labelClass}>{label}</span>
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">{live}</span>
    </>
  );
}
