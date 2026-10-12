"use client";
/** The build as it happens: plan -> files -> tests -> requested vs built -> design review. */
import s from "./apps.module.css";
import type { Check, PublicSpec, Report, Verdict, Visual } from "./types";

export type Live = {
  stage: string;
  stageText: string;
  spec: PublicSpec | null;
  files: { path: string; bytes: number }[];
  /** Text of each file as it was written during this build (live code view). */
  code: Record<string, string>;
  writing: Record<string, number>;
  images: { slot: string; ok: boolean }[];
  checks: Check[];
  verdicts: Verdict[];
  visual: Visual | null;
  problems: { count: number; sample: string[] } | null;
  log: string[];
};

export const emptyLive = (): Live => ({ stage: "", stageText: "", spec: null, files: [], code: {}, writing: {}, images: [], checks: [], verdicts: [], visual: null, problems: null, log: [] });

const ORDER = ["plan", "generate", "verify", "visual", "fix", "save", "done"];
function dot(stage: string, mine: string[]) {
  const i = ORDER.indexOf(stage);
  const live = mine.includes(stage);
  const done = mine.every((m) => ORDER.indexOf(m) < i) || stage === "done";
  return live ? `${s.dot} ${s.dotLive}` : done ? `${s.dot} ${s.dotDone}` : s.dot;
}

const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
const statusLabel = { built: "Built", partial: "Partly", missing: "Missing" } as const;

export function BuildTimeline({ live, report, running }: { live: Live; report: Report | null; running: boolean }) {
  const spec = live.spec;
  const checks = live.checks.length ? live.checks : report?.checks ?? [];
  const verdicts = live.verdicts.length ? live.verdicts : report?.verdicts ?? [];
  const visual = live.visual ?? report?.visual ?? null;
  const st = running ? live.stage : "done";
  const built = verdicts.filter((v) => v.status === "built").length;
  return (
    <div className={s.timeline} aria-live="polite">
      {running && live.stageText ? <div className={s.box}><strong>{live.stageText}</strong></div> : null}

      <section className={s.step}>
        <div className={s.stepHead}><span className={dot(st, ["plan"])} />Plan</div>
        {spec ? (
          <div className={s.box}>
            <h3>{spec.name}</h3>
            {spec.tagline ? <span className={s.muted}>{spec.tagline}</span> : null}
            <span>{spec.summary}</span>
            <div className={s.tags}>
              <span className={s.tag}>{spec.kind}</span>
              {spec.auth ? <span className={s.tag}>accounts</span> : null}
              {spec.collections.map((c) => <span key={c.name} className={s.tag}>{c.name}{c.realtime ? " · live" : ""}</span>)}
              {spec.ai.map((a) => <span key={a.name} className={s.tag}>AI: {a.label}</span>)}
            </div>
            <span className={s.muted}>Screens: {spec.pages.map((p) => p.route).join("  ")}</span>
            {spec.notBuilt.length ? <span className={s.muted}>Not in this build: {spec.notBuilt.join(" · ")}</span> : null}
          </div>
        ) : <span className={s.muted}>Reading your idea…</span>}
      </section>

      {live.files.length || Object.keys(live.writing).length ? (
        <section className={s.step}>
          <div className={s.stepHead}><span className={dot(st, ["generate"])} />Files</div>
          <div className={s.box}>
            <ul className={s.fileList}>
              {live.files.map((f) => <li key={f.path}><span>{f.path}</span><span>{f.bytes ? kb(f.bytes) : "fixed"}</span></li>)}
              {Object.entries(live.writing).map(([g, n]) => <li key={g} className={s.muted}><span>writing {g}…</span><span>{kb(n)}</span></li>)}
            </ul>
            {live.images.length ? <span className={s.muted}>Images: {live.images.map((i) => `${i.slot}${i.ok ? "" : " (failed)"}`).join(", ")}</span> : null}
          </div>
        </section>
      ) : null}

      {checks.length ? (
        <section className={s.step}>
          <div className={s.stepHead}><span className={dot(st, ["verify", "fix"])} />Tests in a real browser</div>
          <div className={s.box}>
            <ul className={s.checks}>
              {checks.map((c, i) => (
                <li key={`${c.id}${i}`}><span aria-hidden="true">{c.ok ? "✓" : "✕"}</span><span className={c.ok ? s.pass : s.fail}>{c.label} <span className={s.muted}>— {c.detail}</span></span></li>
              ))}
            </ul>
            {live.problems && running ? <span className={s.muted}>Found {live.problems.count} problem{live.problems.count === 1 ? "" : "s"}; fixing them and testing again.</span> : null}
            {report && !running ? <span className={s.muted}>Fix rounds: {report.attempts}</span> : null}
          </div>
        </section>
      ) : null}

      {verdicts.length ? (
        <section className={s.step}>
          <div className={s.stepHead}><span className={dot(st, ["visual"])} />Requested vs built · {built}/{verdicts.length}</div>
          <div className={s.box}>
            <table className={s.verdicts}>
              <tbody>
                {verdicts.map((v) => (
                  <tr key={v.id}><td><span className={`${s.badge} ${v.status === "built" ? s.badgeBuilt : ""}`}>{statusLabel[v.status]}</span></td><td><strong>{v.title}</strong><br /><span className={s.muted}>{v.evidence}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {visual ? (
        <section className={s.step}>
          <div className={s.stepHead}><span className={dot(st, ["visual"])} />Design review</div>
          <div className={s.box}>
            <div className={s.row}><span className={s.score}>{visual.score}<span className={s.muted} style={{ fontSize: 14 }}>/10</span></span><span>{visual.summary}</span></div>
            {visual.issues.length ? <ul className={s.checks}>{visual.issues.map((i) => <li key={i}><span aria-hidden="true">·</span><span>{i}</span></li>)}</ul> : null}
          </div>
        </section>
      ) : null}

      {report?.shots?.length && !running ? (
        <section className={s.step}>
          <div className={s.stepHead}><span className={`${s.dot} ${s.dotDone}`} />Screens the tester saw</div>
          <div className={s.shots}>{report.shots.map((sh) => <img key={sh.url} src={sh.url} alt={`${sh.route} (${sh.viewport})`} loading="lazy" />)}</div>
        </section>
      ) : null}

      {live.log.length ? <div className={s.muted} style={{ fontSize: 12 }}>{live.log.slice(-4).map((l) => <div key={l}>{l}</div>)}</div> : null}
    </div>
  );
}
