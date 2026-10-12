"use client";
/**
 * Create's start screen inside Keplar Business, laid out like an IDE (Cursor, Claude Code): an Explorer on the left (starter
 * briefs as files, your apps), the existing composer in the middle under an editor tab, the build pipeline on the right (what
 * each step does and the limits of this plan) and a status bar at the bottom. Everything in the middle is Create's own
 * controls, unchanged; outside Business this renders its children as they are.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { AppSummary, Config } from "./types";
import type { Starter } from "./starters";
import s from "./studio.module.css";

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

export function IdeFrame({ enabled, cfg, apps, starters, running, onStarter, onOpenApp, children }: {
  enabled: boolean;
  cfg: Config | null;
  apps: AppSummary[];
  starters: Starter[];
  running: boolean;
  onStarter: (prompt: string) => void;
  onOpenApp: (id: string) => void;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  const limits = cfg?.limits;
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
        <div className={s.ideTabs} aria-hidden="true">
          <span className={s.ideTab} data-on="">brief.md</span>
          <span className={s.ideTab}>spec.json</span>
          <span className={s.ideTab}>build.log</span>
        </div>
        <div className={s.ideEditor}>{children}</div>
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
