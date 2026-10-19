/**
 * Weekly and monthly growth reports, assembled from what the jobs stored. A report has two parts and never mixes them:
 *  - facts: measured values, each with the collection it came from (a missing source is "unavailable", never a guess);
 *  - changes: differences between two measured values, computed by code (labelled "computed", not interpreted).
 * Interpretation and recommendations are left to a person; the report lists what needs a person's attention.
 */
import { collection } from "@/lib/create/platform/store";

export type Fact = { label: string; value: string | number | null; source: string };
export type Report = { id: string; workspaceId: string; kind: "weekly" | "monthly"; period: string; createdAt: string; facts: Fact[]; changes: Fact[]; attention: string[] };

const SYSTEM = "system";
export const reportRows = () => collection<Report>("growth_reports");

export type ReportInputs = {
  mrrNow: { mrrUsd: number; customers: number } | null;
  retention: { customerChurnRate: number | null; netRevenueRetention: number | null; grossRevenueRetention: number | null; from: string; to: string } | null;
  active: { dau: number; wau: number; mau: number } | null;
  seo: { checked: number; errors: number; warnings: number } | null;
  watchChanged: { owner: string; kind: string; url: string }[];
  geo: { asked: number; mentioned: number; cited: number } | null;
  jobs: { failed: number; skipped: number; ok: number };
  previous: Report | null;
};

const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : `${(x * 100).toFixed(1)}%`);

/** Pure: builds a report. */
export function buildReport(kind: Report["kind"], period: string, now: Date, i: ReportInputs): Report {
  const facts: Fact[] = [
    { label: "MRR (billed price, recorded subscriptions)", value: i.mrrNow ? `$${i.mrrNow.mrrUsd.toFixed(2)}` : null, source: "growth_sub_daily" },
    { label: "Paying customers", value: i.mrrNow?.customers ?? null, source: "growth_sub_daily" },
    { label: `Customer churn ${i.retention ? `${i.retention.from} to ${i.retention.to}` : ""}`.trim(), value: pct(i.retention?.customerChurnRate), source: "growth_sub_daily" },
    { label: "Net revenue retention", value: pct(i.retention?.netRevenueRetention), source: "growth_sub_daily" },
    { label: "Gross revenue retention", value: pct(i.retention?.grossRevenueRetention), source: "growth_sub_daily" },
    { label: "Active browsers, last 7 days (consenting only)", value: i.active?.wau ?? null, source: "growth_events" },
    { label: "Active browsers, last 30 days (consenting only)", value: i.active?.mau ?? null, source: "growth_events" },
    { label: "SEO: pages checked / errors / warnings", value: i.seo ? `${i.seo.checked} / ${i.seo.errors} / ${i.seo.warnings}` : null, source: "growth_job_runs (seo-audit)" },
    { label: "AI answers that mention Keplar (API, this week)", value: i.geo ? `${i.geo.mentioned} of ${i.geo.asked}` : null, source: "growth_geo_results" },
    { label: "AI answers that cite keplar.one (API, this week)", value: i.geo ? `${i.geo.cited} of ${i.geo.asked}` : null, source: "growth_geo_results" },
    { label: "Watched pages that changed", value: i.watchChanged.length, source: "growth_watch_pages" },
    { label: "Growth job runs ok / failed / skipped", value: `${i.jobs.ok} / ${i.jobs.failed} / ${i.jobs.skipped}`, source: "growth_job_runs" },
  ];
  const changes: Fact[] = [];
  const prev = new Map((i.previous?.facts ?? []).map((f) => [f.label, f.value]));
  for (const f of facts) {
    const before = prev.get(f.label);
    const a = typeof before === "number" ? before : typeof before === "string" ? Number(before.replace(/[$%,]/g, "")) : NaN;
    const b = typeof f.value === "number" ? f.value : typeof f.value === "string" ? Number(f.value.replace(/[$%,]/g, "")) : NaN;
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) changes.push({ label: `${f.label}: change since ${i.previous!.period}`, value: `${b - a > 0 ? "+" : ""}${Math.round((b - a) * 100) / 100}`, source: "computed" });
  }
  const attention: string[] = [];
  if (i.jobs.failed) attention.push(`${i.jobs.failed} growth job run(s) failed: see the Automation section.`);
  if (i.seo?.errors) attention.push(`${i.seo.errors} SEO error(s) on checked pages.`);
  for (const w of i.watchChanged.slice(0, 10)) attention.push(`Review the change on ${w.owner}'s ${w.kind} page: ${w.url}`);
  if (!i.geo) attention.push("AI visibility wasn't measured (no engine key or a $0 budget).");
  if (!i.mrrNow) attention.push("No subscription snapshot yet.");
  return { id: `${kind}:${period}`, workspaceId: SYSTEM, kind, period, createdAt: now.toISOString(), facts, changes, attention };
}

export async function saveReport(r: Report): Promise<void> {
  if (await reportRows().get(SYSTEM, r.id)) await reportRows().update(SYSTEM, r.id, r);
  else await reportRows().insert(r);
}

export async function latestReport(kind: Report["kind"], before?: string): Promise<Report | null> {
  const all = await reportRows().list(SYSTEM, (r) => r.kind === kind && (!before || r.period < before));
  return all.sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;
}
