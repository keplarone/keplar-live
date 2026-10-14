"use client";
/**
 * Voice Live Create theater: editor, terminal and live preview are ALL visible at once while the owner speaks.
 * Web Speech fills the prompt; this paints a cinematic coding session from theaterFromTranscript (not the final build).
 * Pauses keep the last frame. Revision phrases reshape the scaffold. Build runs the real Create pipeline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVoice } from "@/components/app-ui/useVoice";
import {
  applyRevision,
  highlightLine,
  theaterFromTranscript,
  VOICE_LIVE_DEBOUNCE_MS,
  VOICE_LIVE_MIN_CHARS,
  VOICE_LIVE_PAUSE_BUILD_MS,
  type TheaterFrame,
} from "@/lib/create/voice-live";
import s from "./VoiceLiveTheater.module.css";
import { Button } from "@/components/kit";

type Props = {
  /** Current prompt text (shared with the text Create field). */
  getText: () => string;
  setText: (t: string) => void;
  /** Kick off the real app build with the current prompt. */
  onBuild: (prompt: string) => void;
  disabled?: boolean;
};

export function VoiceLiveTheater({ getText, setText, onBuild, disabled }: Props) {
  const [frame, setFrame] = useState<TheaterFrame>(() => theaterFromTranscript(""));
  const [tick, setTick] = useState(0);
  /**
   * A tab the owner clicked, remembered together with the file the writer was on at that moment. The editor follows the file
   * being written (frame.activePath); a click pins another file only until the writer moves on to its next file.
   */
  const [pinned, setPinned] = useState<{ path: string; writer: string } | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [opened, setOpen] = useState(false);
  const pauseTimer = useRef<number | null>(null);
  const debounce = useRef<number | null>(null);
  const tickRef = useRef(0);
  const listening = useRef(false);

  const paint = useCallback((text: string, paused: boolean) => {
    const { text: brief, revised } = applyRevision(text);
    const next = theaterFromTranscript(brief, { tick: tickRef.current, paused, revised });
    setFrame(next);
    // Drop the pin once the writer has moved to another file (or the pinned file is gone after a revision).
    setPinned((p) => (p && p.writer === next.activePath && next.files.some((f) => f.path === p.path) ? p : null));
  }, []);

  const voice = useVoice({
    getText,
    setText: (t) => {
      setText(t);
      if (debounce.current) window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(() => paint(t, false), VOICE_LIVE_DEBOUNCE_MS);
      if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
      pauseTimer.current = window.setTimeout(() => paint(getText(), true), VOICE_LIVE_PAUSE_BUILD_MS);
    },
  });

  const open = opened || voice.state === "listening";

  useEffect(() => {
    listening.current = voice.state === "listening";
  }, [voice.state]);

  // Typewriter clock only while listening (or briefly after) — respects reduced motion by jumping reveal.
  useEffect(() => {
    if (voice.state !== "listening" && voice.state !== "processing") return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      tickRef.current += 80;
      setTick(tickRef.current);
      paint(getText(), false);
      return;
    }
    const id = window.setInterval(() => {
      tickRef.current += 1;
      setTick(tickRef.current);
      paint(getText(), false);
    }, 90);
    return () => window.clearInterval(id);
  }, [voice.state, getText, paint]);

  useEffect(() => () => {
    if (debounce.current) window.clearTimeout(debounce.current);
    if (pauseTimer.current) window.clearTimeout(pauseTimer.current);
  }, []);

  const activePath = pinned && pinned.writer === frame.activePath ? pinned.path : frame.activePath;
  const file = useMemo(() => frame.files.find((f) => f.path === activePath) ?? frame.files[0], [frame, activePath]);

  // Keep the active tab in view inside the tab strip (scrolls the strip only, never the page).
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !tab) return;
    const left = tab.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + tab.offsetWidth - strip.clientWidth;
  }, [activePath, frame.files.length]);

  const shown = file ? file.content.slice(0, frame.activePath === file.path ? frame.reveal : file.content.length) : "";
  const lines = shown.split("\n");
  const canBuild = getText().trim().length >= VOICE_LIVE_MIN_CHARS && !disabled;

  if (!voice.supported && !open) {
    return (
      <p className={s.hint} style={{ margin: "6px 0 0" }}>
        Voice Live Create needs Chrome, Edge or Safari (built-in speech recognition). You can keep typing.
      </p>
    );
  }

  return (
    <div className={s.wrap} data-voice-live="">
      <div className={s.head}>
        <span className={s.phase} data-on={voice.state === "listening" ? "true" : undefined}>
          {voice.state === "listening" ? "Listening — watch the build" : frame.phase === "paused" ? "Paused — last frame held" : frame.phase === "ready" ? "Ready to build" : open ? "Voice Live Create" : "Voice"}
        </span>
        {voice.supported ? (
          <Button
            variant="secondary"
            size="sm"
            className={s.mic}
            data-live={voice.state === "listening" ? "true" : undefined}
            onClick={() => { setOpen(true); voice.toggle(); }}
            disabled={disabled || voice.state === "processing"}
            aria-pressed={voice.state === "listening"}
            aria-label={voice.state === "listening" ? "Stop voice create" : "Start Voice Live Create"}
            title="Speak your app into existence. Keplar does not record audio; your browser turns speech into text."
          >
            <i className={s.dot} aria-hidden="true" />
            {voice.state === "listening" ? "Listening…" : voice.state === "processing" ? "Finishing…" : "Speak to create"}
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          disabled={!canBuild}
          onClick={() => { voice.abort(); onBuild(getText().trim()); }}
        >
          Build this
        </Button>
        <p className={s.hint}>
          Editor, terminal and preview update together as you talk. Pauses keep the last frame. Say “actually…” to revise. Build runs the real Create pipeline (tested app) — the theater is the live scaffold.
        </p>
        {voice.error ? <p className={s.err} role="alert">{voice.error.message}</p> : null}
      </div>

      {open ? (
        <div className={s.stage} data-voice-stage="" aria-label="Voice Live Create workspace">
          <section className={`${s.pane} ${s.editor}`} aria-label="Editor">
            <div className={s.paneHead}>
              <span className={s.paneTitle}>Editor</span>
              <div className={s.tabs} role="tablist" aria-label="Open files" ref={tabsRef}>
                {frame.files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    role="tab"
                    className={s.tab}
                    title={f.path}
                    aria-selected={f.path === activePath}
                    data-writing={f.path === frame.activePath ? "true" : undefined}
                    onClick={() => setPinned(f.path === frame.activePath ? null : { path: f.path, writer: frame.activePath })}
                  >
                    {f.path.split("/").pop()}
                  </button>
                ))}
              </div>
            </div>
            <pre className={s.code} aria-live="off">
              {lines.map((ln, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: highlightLine(ln, file?.language ?? "js") || "&nbsp;" }} />
              ))}
              {voice.state === "listening" ? <span className={s.caret} aria-hidden="true" /> : null}
            </pre>
          </section>

          <section className={`${s.pane} ${s.term}`} aria-label="Terminal">
            <div className={s.paneHead}><span className={s.paneTitle}>Terminal</span></div>
            <div className={s.termBody} aria-live="polite">
              {frame.terminal.map((l, i) => (
                <span key={`${i}-${l.text}`} className={s.line} data-k={l.kind}>{l.text}</span>
              ))}
            </div>
          </section>

          <section className={`${s.pane} ${s.preview}`} aria-label="Live preview">
            <div className={s.paneHead}><span className={s.paneTitle}>Preview · {frame.blueprint.label}</span></div>
            <iframe className={s.frame} title="Live preview of forming app" sandbox="" srcDoc={frame.previewHtml} />
          </section>
        </div>
      ) : null}
      {/* tick kept for effect deps / future meters */}
      <span className="visually-hidden" aria-hidden="true">{tick}</span>
    </div>
  );
}
