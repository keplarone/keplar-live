"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaInput } from "@/lib/orchestration/media";
import { AttachButton, mediaHandlers, MediaTray, useMediaAttach } from "./attach";
import { count, usd, type Pulse } from "./pulse";
import s from "./cursor.module.css";

export type HomeMode = "ask" | "research" | "reason";
export type HomePlace = "dashboard" | "agents" | "approvals" | "settings";
type Project = { id: string; name: string };

const MODES: { id: HomeMode; label: string; model: string; placeholder: string }[] = [
  { id: "ask", label: "Ask", model: "Keplar One · Auto", placeholder: "Ask, plan, research. Alt+M switches mode" },
  { id: "research", label: "Deep Research", model: "Keplar One · Research", placeholder: "What should Keplar research? It reads the web and cites every page" },
  { id: "reason", label: "Reason", model: "Keplar One · Thorough", placeholder: "Describe the decision. Attach documents in the next step" },
];

const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const STATUS_WORD: Record<string, string> = { succeeded: "finished", done: "finished", failed: "failed", error: "failed", running: "is running", waiting: "is waiting for approval" };

/** Four live tiles (agents, approvals, revenue, credits) and the latest agent runs: the account's own numbers, never samples. */
function Mission({ pulse, onOpen }: { pulse: Pulse | null; onOpen: (place: HomePlace) => void }) {
  if (!pulse) {
    return <div className={s.tiles} aria-busy="true">{["Agents", "Approvals", "Revenue", "Credits"].map((t) => <div key={t} className={s.tile} aria-hidden="true"><span className={s.tileLabel}><i />{t}</span><span className={s.tileValue}>—</span></div>)}</div>;
  }
  const pct = pulse.compute.total ? Math.min(100, Math.round((pulse.compute.used / pulse.compute.total) * 100)) : null;
  const max = Math.max(1, ...pulse.traffic.days.map((d) => d.views));
  const runs = pulse.agents.recentRuns.slice(0, 5);
  return (
    <>
      <div className={s.tiles}>
        <button type="button" className={s.tile} data-tone="ai" onClick={() => onOpen("agents")}>
          <span className={s.tileLabel}><i />Agents</span>
          <span className={s.tileValue}>{count(pulse.agents.active)} <small>live of {count(pulse.agents.total)}</small></span>
          <span className={s.tileSub}>{pulse.agents.halted ? "All agents are paused" : pulse.agents.total ? "Open to manage schedules and budgets" : "Make your first agent"}</span>
        </button>
        <button type="button" className={s.tile} data-tone="warn" data-alert={pulse.approvals.pending ? "" : undefined} onClick={() => onOpen("approvals")}>
          <span className={s.tileLabel}><i />Approvals</span>
          <span className={s.tileValue}>{count(pulse.approvals.pending)} <small>waiting</small></span>
          <span className={s.tileSub}>{pulse.approvals.pending ? "Review before anything goes out" : "Nothing is waiting for you"}</span>
        </button>
        <button type="button" className={s.tile} data-tone="ok" onClick={() => onOpen("dashboard")}>
          <span className={s.tileLabel}><i />Revenue · 30d</span>
          <span className={s.tileValue}>{usd(pulse.revenue.last30)}</span>
          {pulse.traffic.days.length ? <span className={s.tileSpark} aria-hidden="true">{pulse.traffic.days.map((d) => <span key={d.day} style={{ height: `${Math.max(8, (d.views / max) * 100)}%` }} />)}</span> : null}
          <span className={s.tileSub}>{pulse.payments ? `${count(pulse.orders.last30)} orders · ${count(pulse.traffic.last14)} site views (14d)` : "Payments aren't connected yet"}</span>
        </button>
        <button type="button" className={s.tile} onClick={() => onOpen("settings")}>
          <span className={s.tileLabel}><i />AI credits</span>
          <span className={s.tileValue}>{count(pulse.compute.used)} <small>{pulse.compute.total ? `of ${count(pulse.compute.total)}` : "used"}</small></span>
          {pct !== null ? <span className={s.tileMeter} aria-hidden="true"><i style={{ width: `${pct}%` }} /></span> : null}
          <span className={s.tileSub}>{pulse.compute.resetsAt ? `Resets ${new Date(pulse.compute.resetsAt).toLocaleDateString()}` : "This period"}</span>
        </button>
      </div>
      <section className={s.feed} aria-labelledby="home-feed">
        <div className={s.feedHead}><span id="home-feed">Agent activity</span><button type="button" onClick={() => onOpen("agents")}>Open agents</button></div>
        {runs.length ? (
          <ul className={s.feedList}>
            {runs.map((r) => (
              <li key={r.id}>
                <span className={s.feedTime}>{clock(r.startedAt)}</span>
                <span className={s.feedText}><strong>{r.agentName}</strong> {STATUS_WORD[r.status] ?? r.status}</span>
                <span className={s.feedTime}>{r.status}</span>
              </li>
            ))}
          </ul>
        ) : <p className={s.feedEmpty}>No agent runs yet. Agents you make show their work here.</p>}
      </section>
    </>
  );
}

/**
 * The Business workspace's home, mission control: a greeting, one wide composer with the project and mode pickers above it and
 * quick starts below, then the account's live tiles and agent activity. Sending opens a chat (Ask) or starts Deep Research /
 * Reason with the text.
 */
export function Home({ projects, onSend, onNewProject, company, pulse, onOpen }: { projects: Project[]; onSend: (mode: HomeMode, text: string, projectId: string | null, media?: MediaInput) => void; onNewProject: () => void; company?: string | null; pulse: Pulse | null; onOpen: (place: HomePlace) => void }) {
  const [hello] = useState(greeting);
  const [mode, setMode] = useState<HomeMode>("ask");
  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<{ stop(): void } | null>(null);
  const m = MODES.find((x) => x.id === mode)!;
  const media = useMediaAttach();

  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);

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

  return (
    <div className={s.home}>
      <header className={s.hello}>
        <p className={s.helloKicker}>Mission control{company ? ` · ${company}` : ""}</p>
        <h1 className={s.helloTitle}>{hello}. <span>What should we run today?</span></h1>
      </header>
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
            <button type="button" className={s.roundBtn} onClick={onNewProject} aria-label="New project" title="New project">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <AttachButton media={media} />
            <span className={s.model}><span className={s.modelDot} aria-hidden="true" />{m.model}</span>
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
          <button type="button" className={s.quickGreen} onClick={() => setMode("research")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
            Research a market
          </button>
          <button type="button" className={s.quickBtn} onClick={() => setMode("reason")}>Plan a decision <kbd>Alt M</kbd></button>
          <button type="button" className={s.quickBtn} onClick={onNewProject}>New project</button>
        </div>
      </div>
      <Mission pulse={pulse} onOpen={onOpen} />
      <p className={s.tip}>Tip: press Ctrl+K (⌘K on a Mac) to jump anywhere. Pick a project above and Keplar uses its instructions, notes and files in every answer.</p>
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
