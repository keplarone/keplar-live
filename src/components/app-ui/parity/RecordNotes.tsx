"use client";

import { useEffect, useRef, useState } from "react";
import { addSegment, recordingDraft, RECORD_LIMITS, stamp, type Segment } from "@/lib/voice/record";
import { classifyVoiceError, splitResults, VOICE_ERRORS, voiceLang } from "@/lib/voice";
import { openDraft } from "./draft-bus";
import { Button, Tooltip } from "@/components/kit";
import s from "./parity.module.css";

type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type Ctor = new () => Rec;
const ctor = (): Ctor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** The + menu asks a mounted RecordNotes to start or stop. The control stays mounted so a recording survives the menu closing. */
export const RECORD_NOTES_EVENT = "keplar:record-notes";
export function toggleRecordNotes() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RECORD_NOTES_EVENT));
}
export function recordNotesSupported(): boolean {
  return Boolean(ctor());
}

/** Record notes: transcribe a meeting or lecture live, then open the transcript as a side draft to turn into notes.
 *  `hideIdle` keeps the start button out of the layout (the + menu owns it) and only shows Stop while a recording is running. */
export function RecordNotes({ hideIdle = false }: { hideIdle?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [segs, setSegs] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState("");
  const rec = useRef<Rec | null>(null);
  const started = useRef<Date | null>(null);
  const live = useRef(false);
  const segsRef = useRef<Segment[]>([]);
  const toggleRef = useRef<() => void>(() => {});

  useEffect(() => { const id = window.setTimeout(() => setSupported(Boolean(ctor())), 0); return () => window.clearTimeout(id); }, []);
  useEffect(() => {
    const onToggle = () => toggleRef.current();
    window.addEventListener(RECORD_NOTES_EVENT, onToggle);
    return () => window.removeEventListener(RECORD_NOTES_EVENT, onToggle);
  }, []);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => {
      const ms = Date.now() - (started.current?.getTime() ?? Date.now());
      setElapsed(ms);
      if (ms > RECORD_LIMITS.maxMinutes * 60_000) finish();
    }, 1000);
    return () => window.clearInterval(id);
  }); // re-armed each render so finish() sees fresh state
  useEffect(() => () => { live.current = false; rec.current?.abort(); }, []);

  const begin = () => {
    const C = ctor();
    if (!C) return;
    setErr(""); setSegs([]); segsRef.current = []; setInterim(""); setElapsed(0);
    started.current = new Date();
    live.current = true;
    const r = new C();
    r.lang = voiceLang(navigator);
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      const { final, interim: i } = splitResults(e.results, e.resultIndex);
      if (final) { segsRef.current = addSegment(segsRef.current, Date.now() - started.current!.getTime(), final); setSegs(segsRef.current); }
      setInterim(i);
    };
    r.onerror = (e) => { const k = classifyVoiceError(e.error); if (k && k !== "no-speech") { setErr(VOICE_ERRORS[k]); live.current = false; } };
    r.onend = () => { if (live.current) { try { r.start(); } catch { live.current = false; setOn(false); } } else setOn(false); }; // the speech service pauses on silence; keep going
    rec.current = r;
    try { r.start(); setOn(true); } catch { setErr(VOICE_ERRORS.other); live.current = false; }
  };

  function finish() {
    live.current = false;
    rec.current?.stop();
    setOn(false);
    setInterim("");
    if (started.current) openDraft({ kind: "open", ...recordingDraft(segsRef.current, started.current, Date.now() - started.current.getTime()) });
  }

  toggleRef.current = () => { if (live.current) finish(); else begin(); };
  if (!supported) return null;
  if (hideIdle && !on && !err) return null;

  return (
    <>
      <Tooltip content="Transcribe a meeting or lecture, then turn it into notes. Your browser's speech service does the transcription; Keplar keeps only the text.">
        <Button size="sm" variant="ghost" className={s.toggle} aria-pressed={on} onClick={() => (on ? finish() : begin())} data-record-notes="" leadingIcon={<span className={s.pip} aria-hidden="true" />}>
          {on ? `Stop recording ${stamp(elapsed)}` : "Record notes"}
        </Button>
      </Tooltip>
      {on ? <span className={s.note} role="status" aria-live="polite">{segs.length ? `${segs.length} line${segs.length === 1 ? "" : "s"} so far` : "Listening..."}{interim ? `: ${interim.slice(-80)}` : ""}</span> : null}
      {err ? <span className={s.note} role="alert">{err}</span> : null}
    </>
  );
}
