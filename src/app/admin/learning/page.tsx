import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LearningActions } from "@/components/admin/LearningActions";
import { loadDashboard } from "@/lib/learning/dashboard";
import { warmLearning } from "@/lib/learning/warm";
import { adminFromHeaders } from "@/lib/ops/admin-auth";
import s from "@/components/admin/Admin.module.css";

export const dynamic = "force-dynamic";

const NO = "No data yet";
const pct = (x: number | null | undefined) => (x === null || x === undefined ? NO : `${(x * 100).toFixed(1)}%`);
const when = (iso?: string) => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : "never");

function Table({ head, rows, empty = NO }: { head: string[]; rows: (string | number)[][]; empty?: string }) {
  if (!rows.length) return <p className={s.empty}>{empty}</p>;
  return (
    <div className={s.scroll}>
      <table className={s.table}>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** What Keplar has learned about its own routing, what was promoted or rolled back, and how each version is doing. Admin only. */
export default async function AdminLearningPage() {
  const admin = await adminFromHeaders(await headers());
  if (!admin) notFound();
  await warmLearning();
  const d = await loadDashboard();
  const active = d.policies.find((p) => p.status === "active");
  const pending = d.policies.filter((p) => p.status === "pending_approval");
  const rollbackable = Boolean(active);
  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow} data-o="Admin eyebrow">Admin · Learning · last {d.totals.windowDays} days</p>
        <h1>Learning</h1>
        <p className={s.sub}>
          The AI models are <b>not retrained</b>. This is system-level learning: Keplar keeps score of which models worked for which kind of question and nudges its own routing within fixed safety rules.
          It can change a router policy (a bounded multiplier per model and question type) and nothing else: never code, secrets, billing or the fixed guards (human and conscious replies, who made Keplar, the age rule).
          Scores hold no prompt text and no account. <Link href="/admin">Back to Operations</Link>
        </p>
      </header>

      {d.state.frozen ? <p className={s.alertWarn}>Learning is frozen: nothing learned is being applied. The router is exactly the baseline.</p> : null}
      {pending.length ? <p className={s.alertWarn}>{pending.length} proposal{pending.length === 1 ? "" : "s"} waiting for your approval (large change).</p> : null}

      <section className={s.grid} aria-label="Headline numbers">
        <div className={s.stat}><span>Active policy</span><b>{active ? `v${active.version}` : "Baseline"}</b><small>{active ? `${active.diff.length} changes, promoted ${when(active.decidedAt)} by ${active.by}` : "No learned policy is applied"}</small></div>
        <div className={s.stat}><span>Turns recorded</span><b>{d.totals.turns.toLocaleString("en-US")}</b><small>{d.totals.withFeedback} with feedback; {d.totals.failures} where no model answered</small></div>
        <div className={s.stat}><span>Score, baseline</span><b>{pct(d.baselineScore.score)}</b><small>{d.baselineScore.turns} turns before any policy</small></div>
        <div className={s.stat}><span>Last nightly run</span><b>{when(d.state.lastRunAt)}</b><small>{d.state.lastRunSummary ?? "Has not run yet."}</small></div>
      </section>

      <section className={s.panel} aria-labelledby="ctl">
        <h2 id="ctl">Controls</h2>
        <LearningActions
          actions={[
            ...(rollbackable ? [{ label: `Roll back v${active!.version}`, action: "rollback" as const, tone: "danger" as const, confirm: `Roll back to ${active!.replaces ? `v${active!.replaces}` : "the plain baseline"}? Takes effect within a minute.` }] : []),
            { label: d.state.frozen ? "Unfreeze learning" : "Freeze learning", action: d.state.frozen ? ("unfreeze" as const) : ("freeze" as const), tone: "warn" as const },
            { label: "Dry run (nothing saved)", action: "run" as const, dry: true },
            { label: "Run nightly job now", action: "run" as const },
          ]}
        />
      </section>

      {pending.map((p) => (
        <section key={p.id} className={s.panel} aria-label={`Proposal v${p.version}`}>
          <h2>Proposal v{p.version} · waiting for approval</h2>
          <p className={s.sub}>{p.note} Checks: {p.evidence.guardChecks} run, {p.evidence.guardFailures.length} failed. Held-out score {pct(p.evidence.baselineScore)} → {pct(p.evidence.candidateScore)}; {p.evidence.wins} wins / {p.evidence.losses} losses; plan cost {p.evidence.costDeltaPct >= 0 ? "+" : ""}{p.evidence.costDeltaPct}%.</p>
          <ul>{p.diff.slice(0, 20).map((l) => <li key={l}>{l}</li>)}</ul>
          <LearningActions actions={[{ label: "Approve and promote", action: "approve", version: p.version, tone: "warn" }, { label: "Reject", action: "reject", version: p.version }]} />
        </section>
      ))}

      <section className={s.panel} aria-labelledby="board">
        <h2 id="board">Scoreboards by question type</h2>
        <p className={s.sub}>A model&rsquo;s numbers count after {d.thresholds.minArmTurns} turns, and a question type is scored after {d.thresholds.minCategoryTurns}; below that it says &ldquo;collecting&rdquo; and the multiplier is exactly 1. Quality is a Bayesian estimate (answered, agreed with the majority, feedback). A tripped breaker means the model fails half the time here.</p>
        {d.scoreboards.length === 0 ? <p className={s.empty}>{NO}. Turns appear here as people use Keplar.</p> : null}
        {d.scoreboards.slice(0, 24).map((b) => (
          <div key={`${b.tier}|${b.category}`}>
            <h3>{b.tier === "free" ? "Free" : "Paid"} · {b.category.replace(":", " · ")} · {b.turns} turns · {b.ready ? "scored" : "collecting"}</h3>
            <Table
              head={["Model", "Turns", "Quality", "Avg latency", "Avg credits", "Boost now", "Status"]}
              rows={b.models.map((m) => [m.modelId, m.turns, m.collecting ? "collecting" : pct(m.quality), m.avgLatencyMs ? `${m.avgLatencyMs} ms` : "—", m.avgUnits, m.boost.toFixed(3), m.breaker ? "breaker tripped" : m.collecting ? "collecting" : "ok"])}
            />
          </div>
        ))}
      </section>

      <section className={s.cols}>
        <div className={s.panel}>
          <h2>Win rate by policy version</h2>
          <Table head={["Version", "Turns", "Mean turn score"]} rows={d.versions.map((v) => [`v${v.version}`, v.turns, pct(v.score)])} empty="No turns have run under a learned policy yet." />
          <p className={s.sub}>Baseline (no policy): {pct(d.baselineScore.score)} over {d.baselineScore.turns} turns. A turn scores higher when models answered, agreed, and people copied or rated it up.</p>
        </div>
        <div className={s.panel}>
          <h2>Feedback seen</h2>
          <Table head={["Signal", "Count"]} rows={Object.entries(d.feedback).map(([k, v]) => [k, v])} />
        </div>
      </section>

      <section className={s.panel} aria-labelledby="log">
        <h2 id="log">Promotions, proposals and rollbacks</h2>
        <Table
          head={["Version", "When", "Status", "Size", "By", "Held-out score", "Checks", "What changed / why"]}
          rows={d.policies.slice(0, 40).map((p) => [`v${p.version}`, when(p.at), p.status.replace("_", " "), p.size, p.by, `${pct(p.evidence.baselineScore)} → ${pct(p.evidence.candidateScore)}`, `${p.evidence.guardChecks} run, ${p.evidence.guardFailures.length} failed`, `${p.note ?? ""} ${p.diff.slice(0, 3).join("; ")}`.trim()])}
          empty="Nothing promoted yet. The nightly job needs enough turns to pass the minimum-sample rules."
        />
        <LearningActions actions={d.policies.filter((p) => p.status === "rolled_back" || p.status === "superseded").slice(0, 6).map((p) => ({ label: `Restore v${p.version}`, action: "restore" as const, version: p.version }))} />
      </section>

      <section className={s.panel} aria-labelledby="cases">
        <h2 id="cases">Failure cases people agreed to share</h2>
        <p className={s.sub}>{d.cases.total} in {d.totals.windowDays} days. Kept only for signed-in people who turned on &ldquo;Help improve Keplar&rdquo;; links, emails, numbers and secret-like text removed, shortened; no account shown. They are added to the nightly safety checks.</p>
        <Table head={["Question type", "Reason", "Count"]} rows={Object.entries(d.cases.byCategory).map(([k, v]) => [k, "", v])} empty="None yet." />
        <Table head={["When", "Plan", "Type", "Reason", "Text (redacted)"]} rows={d.cases.recent.map((c) => [when(c.at), c.tier, c.category, c.reason.replace("_", " "), c.text])} empty="" />
      </section>
    </div>
  );
}
