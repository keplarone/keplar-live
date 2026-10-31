import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import { seoRows } from "@/lib/seo/events";
import { analyze, EXPERIMENTS, runningIds, type ExperimentResult } from "@/lib/growth/experiments";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";
const DAYS = 90;

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
const pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} pts`;
const pval = (p: number | null) => (p === null ? "—" : p < 0.001 ? "< 0.001" : p.toFixed(3));
const VERDICT: Record<ExperimentResult["verdict"], string> = {
  "not-started": "Not started",
  "too-early": "Too early",
  "sample-ratio-mismatch": "Sample ratio mismatch",
  "no-clear-difference": "No clear difference",
  difference: "Difference found (a person decides)",
};

/** A/B experiments on the first-party funnel. Admin only (checked on the server); counts are consented browsers only. */
export default async function AdminExperimentsPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  const rows = await seoRows(DAYS).catch(() => null);
  const running = runningIds();
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · Experiments · last {DAYS} days</p>
        <h1>Experiments</h1>
        <p className={s.sub}>
          An experiment runs only when its id is in NEXT_PUBLIC_KEPLAR_EXPERIMENTS ({running.size ? [...running].join(", ") : "none set"}). Counts are browsers that allowed
          Analytics, so they are a floor. Conversions count only after a browser&apos;s first exposure. Nothing here ships a variant: it reports, a person decides.
        </p>
      </header>
      {!rows ? (
        <section className={s.panel}><p className={s.empty}>The store could not be read.</p></section>
      ) : (
        EXPERIMENTS.map((e) => {
          const r = analyze(e, rows, running.has(e.id));
          return (
            <section key={e.id} className={s.panel} aria-labelledby={`x-${e.id}`}>
              <h2 id={`x-${e.id}`}>{e.title} <small>({e.id}, {r.running ? "running" : "off"})</small></h2>
              <p className={s.sub}>{e.hypothesis} Primary: {e.primary}. Guardrails: {e.guardrails.join(", ")}.</p>
              <p><strong>{VERDICT[r.verdict]}.</strong> {r.note}</p>
              <div className={s.scroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      {["Arm", "Label", "Exposed", e.primary, "Rate", "vs control", "p", ...e.guardrails].map((h) => (
                        <th key={h} scope="col">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.arms.map((a) => (
                      <tr key={a.arm.id}>
                        <td>{a.arm.id}</td>
                        <td>{a.arm.label}</td>
                        <td>{a.exposed}</td>
                        <td>{a.conversions}</td>
                        <td>{pct(a.rate)}</td>
                        <td>{a.vsControl ? pts(a.vsControl.diff) : "control"}</td>
                        <td>{a.vsControl ? pval(a.vsControl.p) : "—"}</td>
                        {a.guardrails.map((g) => <td key={g.event}>{pct(g.rate)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={s.sub}>Sample-ratio check p = {pval(r.srmP)} (below 0.001 means assignment or tracking is broken). Minimum before comparing: {e.minPerArm} exposed per arm, {e.minConversions} conversions in total.</p>
            </section>
          );
        })
      )}
    </div>
  );
}
