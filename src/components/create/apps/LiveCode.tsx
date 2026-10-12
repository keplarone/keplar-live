"use client";
/**
 * Live code: watch the app's code being written while Create builds it, like an agent's editor in Claude Code or Cursor.
 * Files arrive with the build stream (file events carry their text, capped server-side; build-client.ts keeps them in
 * Live.code). The left column shows either the build's Tasks (the plan as a checklist: each step, the screens it planned,
 * test results) or the Files written so far; the editor follows the newest file unless one is picked (or found with
 * Ctrl+P), and the build log runs underneath like a terminal. Read-only; the Code tab edits saved versions.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Live } from "./BuildTimeline";
import { FileFinder, useGoToFile } from "./FileFinder";
import { BUILD_ORDER, screenWritten, stepState, type StepState } from "./code-nav";
import { langOf, sortFiles, tokenize } from "./highlight";
import s from "./studio.module.css";

const VISIBLE_KEY = "kc-live-code";

const STEPS: { id: (typeof BUILD_ORDER)[number]; label: string }[] = [
  { id: "plan", label: "Plan the product" },
  { id: "generate", label: "Write the code" },
  { id: "verify", label: "Run the checks" },
  { id: "visual", label: "Review against the request" },
  { id: "save", label: "Save the version" },
];
function Tick({ state }: { state: StepState }) {
  return <span className={s.taskTick} data-state={state} aria-hidden="true">{state === "done" ? "✓" : ""}</span>;
}

export function LiveCode({ live, running }: { live: Live; running: boolean }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(VISIBLE_KEY) !== "hidden"; } catch { return true; }
  });
  const [side, setSide] = useState<"tasks" | "files">("tasks");
  const [pinned, setPinned] = useState<string | null>(null);
  const [finding, setFinding] = useGoToFile();
  const logRef = useRef<HTMLPreElement>(null);

  const paths = useMemo(() => sortFiles(Object.keys(live.code)), [live.code]);
  const allPaths = useMemo(() => live.files.map((f) => f.path), [live.files]);
  // Follow the most recently written file (the build's file events arrive in writing order).
  const newest = useMemo(() => [...live.files].reverse().find((f) => live.code[f.path] !== undefined)?.path ?? paths[0] ?? null, [live.files, live.code, paths]);
  const pick = pinned && live.code[pinned] !== undefined ? pinned : newest;
  const text = pick ? live.code[pick] ?? "" : "";
  const toks = useMemo(() => (pick ? tokenize(text.slice(0, 200_000), langOf(pick)) : []), [pick, text]);
  const lines = text ? text.split("\n").length : 0;
  const writing = Object.entries(live.writing);
  const total = live.files.reduce((n, f) => n + f.bytes, 0);
  const passed = live.checks.filter((c) => c.ok).length;
  const failed = live.checks.length - passed;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [live.log.length]);

  if (!paths.length && !writing.length && !(running && live.stage)) return null;
  const toggle = () => setOpen((v) => {
    try { localStorage.setItem(VISIBLE_KEY, v ? "hidden" : "shown"); } catch { /* storage blocked */ }
    return !v;
  });

  return (
    <section className={s.liveCode} aria-label="Code being written">
      <header className={s.liveHead}>
        <span className={s.liveDot} data-on={running || undefined} aria-hidden="true" />
        <strong>{running ? "Writing code" : "Code from this build"}</strong>
        <span className={s.codeMeta}>{paths.length} {paths.length === 1 ? "file" : "files"} · {(total / 1024).toFixed(1)} KB</span>
        <span className={s.grow} />
        {pinned ? <button type="button" className={s.textBtn} onClick={() => setPinned(null)}>Follow latest</button> : null}
        {open && paths.length ? <button type="button" className={s.textBtn} onClick={() => setFinding(true)} title="Go to file (Ctrl+P)">Go to file <kbd className={s.kbdHint}>Ctrl P</kbd></button> : null}
        <button type="button" className={s.textBtn} aria-expanded={open} onClick={toggle}>{open ? "Hide code" : "Show code"}</button>
      </header>
      {open ? (
        <>
          <div className={`${s.code} ${s.liveGrid}`}>
            {finding ? <FileFinder paths={paths} onPick={(p) => { setPinned(p); setSide("files"); }} onClose={() => setFinding(false)} /> : null}
            <div className={s.liveSide}>
              <div className={s.liveSwitch} role="tablist" aria-label="Left column">
                <button type="button" role="tab" aria-selected={side === "tasks"} onClick={() => setSide("tasks")}>Tasks</button>
                <button type="button" role="tab" aria-selected={side === "files"} onClick={() => setSide("files")}>Files <span className={s.fileDir}>{paths.length}</span></button>
              </div>
              {side === "tasks" ? (
                <ol className={s.tasks} aria-label="Build tasks">
                  {STEPS.map((st) => {
                    const state = stepState(st.id, live.stage, running);
                    return (
                      <li key={st.id} className={s.task} data-state={state}>
                        <Tick state={state} />
                        <span className={s.taskBody}>
                          <span>{st.label}</span>
                          {st.id === "generate" && live.spec ? (
                            <ul className={s.subtasks}>
                              {live.spec.pages.map((pg) => {
                                const done = state === "done" || screenWritten(pg.route, allPaths);
                                return <li key={pg.route} data-state={done ? "done" : state === "active" ? "active" : "todo"}><Tick state={done ? "done" : "todo"} />{pg.title} <span className={s.fileDir}>{pg.route}</span></li>;
                              })}
                            </ul>
                          ) : null}
                          {st.id === "generate" && paths.length ? <span className={s.taskMeta}>{paths.length} files written{writing.length ? `, ${writing.length} in progress` : ""}</span> : null}
                          {st.id === "verify" && live.checks.length ? <span className={s.taskMeta}>{passed} passed{failed ? `, ${failed} failed` : ""}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                  {live.stage === "fix" ? (
                    <li className={s.task} data-state="active"><Tick state="active" /><span className={s.taskBody}><span>Fix {live.problems?.count ?? ""} problems the checks found</span></span></li>
                  ) : null}
                </ol>
              ) : (
                <nav className={s.files} aria-label="Files written so far">
                  {paths.map((p) => (
                    <button key={p} type="button" className={s.file} aria-current={p === pick || undefined} onClick={() => setPinned(p)}>
                      <span className={s.fileDir}>{p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : ""}</span>{p.slice(p.lastIndexOf("/") + 1)}
                    </button>
                  ))}
                  {running ? writing.map(([group, chars]) => (
                    <span key={group} className={`${s.file} ${s.fileWriting}`}>
                      <span className={s.fileDir}>writing </span>{group} · {chars.toLocaleString()} chars
                    </span>
                  )) : null}
                </nav>
              )}
            </div>
            <div className={s.codeMain}>
              <div className={s.codeBar}>
                <span className={s.codePath}>{pick ?? "Waiting for the first file…"}</span>
                {pick ? <span className={s.codeMeta}>{lines} lines · {(text.length / 1024).toFixed(1)} KB{pick === newest && running ? " · just written" : ""}</span> : null}
              </div>
              <pre className={s.pre} tabIndex={0}>
                <code>{toks.map((t, i) => (t.k ? <span key={i} className={s[`tk_${t.k}`]}>{t.v}</span> : t.v))}</code>
              </pre>
            </div>
          </div>
          {live.log.length ? (
            <pre ref={logRef} className={s.liveLog} aria-label="Build log" tabIndex={0}>
              {live.log.slice(-200).map((l, i) => <span key={i}><span aria-hidden="true">$ </span>{l}{"\n"}</span>)}
            </pre>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
