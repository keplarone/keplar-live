"use client";
/**
 * Create's start screen inside Keplar Business, laid out like an IDE (Cursor, Claude Code): an Explorer on the left (starter
 * briefs as files, your apps), the existing composer in the middle under an editor tab, the build pipeline on the right (what
 * each step does and the limits of this plan) and a status bar at the bottom. Everything in the middle is Create's own
 * controls, unchanged; outside Business this renders its children as they are.
 *
 * The editor tabs: brief.md is the composer (kept mounted while another tab shows, so nothing typed is lost), spec.json is
 * the build request as it stands (the brief, the look, the model and this plan's limits; read fresh when the tab opens) and
 * build.log is the latest build's log from this session.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppSummary, Config, Design } from "./types";
import type { Starter } from "./starters";
import { tokenize } from "./highlight";
import { buildRequestJson } from "./code-nav";
import s from "./studio.module.css";

type EditorTab = "brief" | "spec" | "log";
const EDITOR_TABS: { id: EditorTab; file: string }[] = [
  { id: "brief", file: "brief.md" },
  { id: "spec", file: "spec.json" },
  { id: "log", file: "build.log" },
];


/** True while the Keplar Business workspace is open (it marks <html data-business-app>). */
export function useBusinessApp(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setOn(el.hasAttribute("data-business-app"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-business-app"] });
    return () => mo.disconnect();
  }, []);
  return on;
}

const PIPELINE: { id: string; title: string; does: string }[] = [
  { id: "plan", title: "Plan", does: "Reads the brief and writes a spec: screens, data collections, roles and what is out of scope." },
  { id: "generate", title: "Generate", does: "Writes every file in parallel groups; you can watch each file land." },
  { id: "verify", title: "Verify", does: "Static checks and a headless run of every screen; problems are fixed and re-tested." },
  { id: "visual", title: "Review", does: "Compares what you asked for with what was built, and reviews the design." },
  { id: "save", title: "Save", does: "Stores the version with its report; restore or branch any version later." },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function IdeFrame({ enabled, cfg, apps, starters, running, onStarter, onOpenApp, getBrief, auto, design, log, children }: {
  enabled: boolean;
  /** The composer's current text (read when spec.json opens; the composer is not reactive). */
  getBrief: () => string;
  auto: boolean;
  design: Design | null;
  /** The latest build's log lines in this session. */
  log: string[];
  cfg: Config | null;
  apps: AppSummary[];
  starters: Starter[];
  running: boolean;
  onStarter: (prompt: string) => void;
  onOpenApp: (id: string) => void;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<EditorTab>("brief");
  // Bumped each time spec.json opens, so it shows the brief as it is now.
  const [specAt, setSpecAt] = useState(0);
  const spec = useMemo(() => (tab === "spec" ? buildRequestJson({ brief: getBrief(), auto, design, cfg }) : ""), [tab, specAt, auto, design, cfg, getBrief]);
  const specToks = useMemo(() => tokenize(spec, "js"), [spec]);
  if (!enabled) return <>{children}</>;
  const limits = cfg?.limits;
  const open = (t: EditorTab) => { setTab(t); if (t === "spec") setSpecAt((n) => n + 1); };
  return (
    <div className={s.ide} data-ide="">
      <aside className={s.ideSide} aria-label="Explorer">
        <div className={s.ideSideHead}>Explorer</div>
        <div className={s.ideGroup}>
          <div className={s.ideGroupHead}>starters</div>
          {starters.map((st) => (
            <button key={st.id} type="button" className={s.ideRow} disabled={running} onClick={() => onStarter(st.prompt)} title={st.prompt}>
              <span className={s.ideIcon} aria-hidden="true">md</span>{slug(st.label)}.md
            </button>
          ))}
        </div>
        <div className={s.ideGroup}>
          <div className={s.ideGroupHead}>apps <span className={s.ideCount}>{apps.length}</span></div>
          {apps.length ? apps.slice(0, 12).map((a) => (
            <button key={a.id} type="button" className={s.ideRow} onClick={() => onOpenApp(a.id)} title={a.appName || a.name}>
              <span className={s.ideIcon} data-live={a.publishedVersion ? "" : undefined} aria-hidden="true">{a.publishedVersion ? "●" : "○"}</span>
              <span className={s.ideRowName}>{a.slug || slug(a.appName || a.name)}</span>
              <span className={s.ideRowMeta}>v{a.headVersion}</span>
            </button>
          )) : <p className={s.ideEmpty}>No apps yet. Your builds appear here.</p>}
        </div>
      </aside>

      <section className={s.ideMain} aria-label="Brief">
        <div className={s.ideTabs} role="tablist" aria-label="Editor">
          {EDITOR_TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`ide-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`ide-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={s.ideTab}
              data-on={tab === t.id ? "" : undefined}
              onClick={() => open(t.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = EDITOR_TABS[(i + (e.key === "ArrowRight" ? 1 : EDITOR_TABS.length - 1)) % EDITOR_TABS.length]!;
                open(next.id);
                document.getElementById(`ide-tab-${next.id}`)?.focus();
              }}
            >
              {t.file}{t.id === "log" && log.length ? <span className={s.ideTabCount}>{log.length}</span> : null}
            </button>
          ))}
        </div>
        {/* The composer stays mounted on the other tabs, so a half-written brief and its options are never lost. */}
        <div className={s.ideEditor} role="tabpanel" id="ide-panel-brief" aria-labelledby="ide-tab-brief" hidden={tab !== "brief"}>{children}</div>
        {tab === "spec" ? (
          <div className={s.ideEditor} role="tabpanel" id="ide-panel-spec" aria-labelledby="ide-tab-spec">
            <p className={s.ideNote}>The build request as it stands. It updates from brief.md, Options and your plan; nothing here is sent until you build.</p>
            <pre className={`${s.pre} ${s.idePre}`} tabIndex={0}><code>{specToks.map((t, i) => (t.k ? <span key={i} className={s[`tk_${t.k}`]}>{t.v}</span> : t.v))}</code></pre>
          </div>
        ) : null}
        {tab === "log" ? (
          <div className={s.ideEditor} role="tabpanel" id="ide-panel-log" aria-labelledby="ide-tab-log">
            {log.length ? (
              <pre className={`${s.pre} ${s.idePre}`} tabIndex={0}>{log.map((l, i) => <span key={i}><span className={s.ideLineNo} aria-hidden="true">{String(i + 1).padStart(3, " ")}  </span>{l}{"\n"}</span>)}</pre>
            ) : (
              <p className={s.ideNote}>No build has run in this session yet. When you build, every step is logged here and in the live panel, with the code as it is written.</p>
            )}
          </div>
        ) : null}
      </section>

      <aside className={s.ideSide} aria-label="Build pipeline">
        <div className={s.ideSideHead}>Pipeline</div>
        <ol className={s.idePipe}>
          {PIPELINE.map((p, i) => (
            <li key={p.id}>
              <span className={s.ideStep} aria-hidden="true">{i + 1}</span>
              <span><strong>{p.title}</strong><span className={s.ideMuted}>{p.does}</span></span>
            </li>
          ))}
        </ol>
        {limits ? (
          <dl className={s.ideSpec}>
            <div><dt>Model</dt><dd>{cfg?.model}</dd></div>
            <div><dt>Screens</dt><dd>up to {limits.pages}</dd></div>
            <div><dt>Files</dt><dd>up to {limits.files}</dd></div>
            <div><dt>Data collections</dt><dd>{limits.collections}</dd></div>
            <div><dt>Backend</dt><dd>{limits.backend ? "accounts, shared data" : "browser only"}</dd></div>
            <div><dt>AI features</dt><dd>{limits.ai ? "on" : "off"}</dd></div>
            <div><dt>Generated images</dt><dd>{limits.images}</dd></div>
            <div><dt>Fix attempts</dt><dd>{limits.fixAttempts}</dd></div>
            <div><dt>Design review</dt><dd>{limits.visual ? "on" : "off"}</dd></div>
          </dl>
        ) : null}
      </aside>

      <footer className={s.ideStatus}>
        <span className={s.ideStatusItem} data-on={running ? "" : undefined}>{running ? "● building" : "○ ready"}</span>
        <span className={s.ideStatusItem}>{cfg?.planLabel ?? "Keplar Business"}</span>
        {cfg ? <span className={s.ideStatusItem}>≈ {cfg.estimateUnits.toLocaleString()} credits per build · max {cfg.maxUnits.toLocaleString()}</span> : null}
        {cfg ? <span className={s.ideStatusItem}>{cfg.projects}/{cfg.maxProjects} projects</span> : null}
        <span className={s.grow} />
        <span className={s.ideStatusItem}><kbd>Ctrl</kbd> <kbd>P</kbd> go to file</span>
        <span className={s.ideStatusItem}><kbd>Ctrl</kbd> <kbd>Enter</kbd> build</span>
      </footer>
    </div>
  );
}
