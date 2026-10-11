"use client";

import { useEffect, useRef, useState } from "react";
import s from "./cursor.module.css";

export type HomeMode = "ask" | "research" | "reason";
type Project = { id: string; name: string };

const MODES: { id: HomeMode; label: string; model: string; placeholder: string }[] = [
  { id: "ask", label: "Ask", model: "Keplar One · Auto", placeholder: "Ask, plan, research. Shift+Tab switches mode" },
  { id: "research", label: "Deep Research", model: "Keplar One · Research", placeholder: "What should Keplar research? It reads the web and cites every page" },
  { id: "reason", label: "Reason", model: "Keplar One · Thorough", placeholder: "Describe the decision. Attach documents in the next step" },
];

/**
 * The Business workspace's home (Cursor-style): one centered composer with the project and mode pickers above it, quick starts
 * below, and a tip at the foot. Sending opens a chat (Ask) or starts Deep Research / Reason with the text.
 */
export function Home({ projects, onSend, onNewProject }: { projects: Project[]; onSend: (mode: HomeMode, text: string, projectId: string | null) => void; onNewProject: () => void }) {
  const [mode, setMode] = useState<HomeMode>("ask");
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<{ stop(): void } | null>(null);
  const m = MODES.find((x) => x.id === mode)!;

  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);

  const send = () => { if (text.trim()) onSend(mode, text.trim(), projectId || null); };
  const cycle = () => setMode((cur) => MODES[(MODES.findIndex((x) => x.id === cur) + 1) % MODES.length]!.id);

  // Dictation with the browser's own speech recognition where available (Chromium, so the desktop app); nothing is uploaded by us.
  const SpeechCtor = typeof window === "undefined" ? null : ((window as unknown as { webkitSpeechRecognition?: new () => SpeechLike; SpeechRecognition?: new () => SpeechLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition ?? null);
  const dictate = () => {
    if (!SpeechCtor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SpeechCtor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.onresult = (e) => { const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" "); setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${said}`.trimStart()); };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className={s.home}>
      <div className={s.composeWrap}>
        <div className={s.pickers}>
          <label className={s.picker}>
            <span className={s.srOnly}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className={s.picker}>
            <span className={s.srOnly}>Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as HomeMode)}>
              {MODES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        </div>
        <form className={s.composer} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="biz-compose" className={s.srOnly}>Message</label>
          <textarea
            id="biz-compose"
            ref={ref}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); cycle(); }
            }}
            placeholder={m.placeholder}
          />
          <div className={s.composeBar}>
            <button type="button" className={s.roundBtn} onClick={onNewProject} aria-label="New project" title="New project">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <span className={s.model}><span className={s.modelDot} aria-hidden="true" />{m.model}</span>
            <span className={s.grow} />
            {SpeechCtor ? (
              <button type="button" className={s.micBtn} data-on={listening || undefined} onClick={dictate} aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </button>
            ) : null}
            <button type="submit" className={s.sendBtn} disabled={!text.trim()} aria-label="Send">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        </form>
        <div className={s.quick}>
          <button type="button" className={s.quickGreen} onClick={() => setMode("research")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
            Research a market
          </button>
          <button type="button" className={s.quickBtn} onClick={() => setMode("reason")}>Plan a decision <kbd>⇧Tab</kbd></button>
          <button type="button" className={s.quickBtn} onClick={onNewProject}>New project</button>
        </div>
      </div>
      <p className={s.tip}>Tip: pick a project above and Keplar uses its instructions, notes and files in every answer.</p>
    </div>
  );
}

type SpeechLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
