"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaInput } from "@/lib/orchestration/media";
import { AttachButton, mediaHandlers, MediaTray, useMediaAttach } from "./attach";
import { count, type Pulse } from "./pulse";
import { MODE_KEY } from "./settings-sections";
import s from "./cursor.module.css";

export type HomeMode = "ask" | "research" | "reason";
export type HomePlace = "dashboard" | "agents" | "approvals" | "settings";
type Project = { id: string; name: string; createdAt?: string };

const MODES: { id: HomeMode; label: string; placeholder: string }[] = [
  { id: "ask", label: "Ask", placeholder: "Describe what you want to build, change or find out" },
  { id: "research", label: "Deep Research", placeholder: "What should Keplar research? It reads the web and cites every page" },
  { id: "reason", label: "Reason", placeholder: "Describe the decision. Attach documents in the next step" },
];
const isMode = (v: unknown): v is HomeMode => v === "ask" || v === "research" || v === "reason";
const savedMode = (): HomeMode => { try { const v = localStorage.getItem(MODE_KEY); return isMode(v) ? v : "ask"; } catch { return "ask"; } };
const ago = (iso?: string) => {
  if (!iso) return "";
  const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** What needs a person right now, from the account's own numbers. Empty states say so plainly. */
function NeedsYou({ pulse, onOpen }: { pulse: Pulse | null; onOpen: (place: HomePlace) => void }) {
  if (!pulse) return <div className={s.list} aria-busy="true"><span className={s.rowSkeleton} /><span className={s.rowSkeleton} /></div>;
  const items: { key: string; text: string; place: HomePlace }[] = [];
  if (pulse.approvals.pending) items.push({ key: "approvals", text: `${count(pulse.approvals.pending)} ${pulse.approvals.pending === 1 ? "action is" : "actions are"} waiting for approval`, place: "approvals" });
  if (pulse.agents.halted) items.push({ key: "halted", text: "Every agent is paused", place: "agents" });
  const failed = pulse.agents.recentRuns.find((r) => r.status === "failed" || r.status === "error");
  if (failed) items.push({ key: "failed", text: `${failed.agentName} failed its last run`, place: "agents" });
  if (!items.length) return <p className={s.listEmpty}>Nothing is waiting for you.</p>;
  return (
    <ul className={s.list}>
      {items.map((x) => (
        <li key={x.key}><button type="button" className={s.listRow} onClick={() => onOpen(x.place)}><span className={s.ellipsis}>{x.text}</span><span className={s.listGo} aria-hidden="true">→</span></button></li>
      ))}
    </ul>
  );
}

/**
 * The Business workspace's home, like a coding tool's new-chat screen: one question, one composer (mode, project, attachments,
 * dictation), a few starting points, then the projects to pick up and anything that needs a person. Sending opens a chat (Ask)
 * or starts Deep Research / Reason with the text; "Build a site or app" opens Create.
 */
export function Home({ projects, onSend, onNewProject, onOpenProject, onBuild, company, pulse, onOpen }: {
  projects: Project[];
  onSend: (mode: HomeMode, text: string, projectId: string | null, media?: MediaInput) => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onBuild: () => void;
  company?: string | null;
  pulse: Pulse | null;
  onOpen: (place: HomePlace) => void;
}) {
  const [mode, setMode] = useState<HomeMode>(savedMode);
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<{ stop(): void } | null>(null);
  const m = MODES.find((x) => x.id === mode)!;
  const media = useMediaAttach();

  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  // The composer grows with what is typed, up to a limit, then scrolls.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [text]);

  const send = () => { if (text.trim() && !media.busy) onSend(mode, text.trim(), projectId || null, media.take()); };
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

  const recentProjects = projects.slice(0, 5);

  return (
    <div className={s.home}>
      <header className={s.hello}>
        {company ? <p className={s.helloKicker}>{company}</p> : null}
        <h1 className={s.helloTitle}>What should we build?</h1>
      </header>

      <form className={s.composer} onSubmit={(e) => { e.preventDefault(); send(); }} {...mediaHandlers(media)}>
        <MediaTray media={media} />
        <label htmlFor="biz-compose" className={s.srOnly}>Message</label>
        <textarea
          id="biz-compose"
          ref={ref}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            if (e.key.toLowerCase() === "m" && e.altKey) { e.preventDefault(); cycle(); }
          }}
          placeholder={m.placeholder}
        />
        <div className={s.composeBar}>
          <AttachButton media={media} />
          <label className={s.picker}>
            <span className={s.srOnly}>Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as HomeMode)} title="Mode (Alt+M)">
              {MODES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <label className={s.picker}>
            <span className={s.srOnly}>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <span className={s.grow} />
          {SpeechCtor ? (
            <button type="button" className={s.micBtn} data-on={listening || undefined} onClick={dictate} aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
          ) : null}
          <button type="submit" className={s.sendBtn} disabled={!text.trim() || media.busy} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </form>

      <div className={s.quick}>
        <button type="button" className={s.quickBtn} onClick={onBuild}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>
          Build a site or app
        </button>
        <button type="button" className={s.quickBtn} onClick={() => { setMode("research"); ref.current?.focus(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
          Research a market
        </button>
        <button type="button" className={s.quickBtn} onClick={() => { setMode("reason"); ref.current?.focus(); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></svg>
          Plan a decision
        </button>
      </div>

      <div className={s.below}>
        <section className={s.panel} aria-labelledby="home-projects">
          <div className={s.panelHead}><h2 id="home-projects">Projects</h2><button type="button" onClick={onNewProject}>New project</button></div>
          {recentProjects.length ? (
            <ul className={s.list}>
              {recentProjects.map((p) => (
                <li key={p.id}><button type="button" className={s.listRow} onClick={() => onOpenProject(p.id)}><span className={s.ellipsis}>{p.name}</span><span className={s.listMeta}>{ago(p.createdAt)}</span></button></li>
              ))}
            </ul>
          ) : <p className={s.listEmpty}>Projects keep instructions, notes and files that Keplar uses in every answer.</p>}
        </section>
        <section className={s.panel} aria-labelledby="home-needs">
          <div className={s.panelHead}><h2 id="home-needs">Needs you</h2><button type="button" onClick={() => onOpen("approvals")}>Approvals</button></div>
          <NeedsYou pulse={pulse} onOpen={onOpen} />
        </section>
      </div>

      <p className={s.tip}><kbd>⌘K</kbd> jump anywhere <span aria-hidden="true">·</span> <kbd>⌘,</kbd> settings <span aria-hidden="true">·</span> <kbd>Alt M</kbd> switch mode</p>
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
