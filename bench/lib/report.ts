/** Markdown report. Pilot tiers are INTERNAL; mock runs are labelled synthetic on every page. */
import { DATASET_LABEL, HIGH_CONFIDENCE, PROFILES } from "./config";
import type { ArmSummary, Comparison } from "./metrics";
import type { DatasetId } from "./types";

export type ReportInput = {
  runId: string;
  tier: string;
  internal: boolean;
  live: boolean;
  provider: string;
  startedAt: string;
  finishedAt: string;
  seed: number;
  aborted: string | null;
  estimate: { total: number; withContingency: number; lines: { dataset: DatasetId; items: number; devItems: number; usd: number }[] };
  spend: { counted: number; calls: number; cap: number | null };
  datasets: { id: DatasetId; test: number; dev: number; synthetic: number; imagesExcluded: number; source: string | null; notes: string[] }[];
  bestSingle: Partial<Record<DatasetId, { arm: string; devAccuracy: Record<string, number>; devOverlapsTest: boolean }>>;
  summaries: ArmSummary[];
  comparisons: Comparison[];
  tokenProfile: { dataset: DatasetId; role: string; calls: number; avgIn: number; avgOut: number }[];
  notes: string[];
};

const pct = (x: number | null | undefined, d = 1) => (x == null || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(d)}%`);
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;
const usd = (x: number | null | undefined, d = 4) => (x == null || Number.isNaN(x) ? "–" : `$${x.toFixed(d)}`);
const sec = (ms: number) => (Number.isNaN(ms) ? "–" : `${(ms / 1000).toFixed(1)}s`);

export function renderReport(r: ReportInput): string {
  const L: string[] = [];
  if (r.internal) {
    const why = r.tier.startsWith("pilot")
      ? "Pilot-tier results (plan addendum). With 50–70 questions per set, one setup's accuracy has a 95% margin of roughly ±11 points and only gaps of about 10 points or more can be clear. Use these numbers to decide on the lean run, check the harness against the official HLE-Diamond scores, and measure real token counts and cost."
      : "Internal tier (smoke test or ad-hoc sample); samples are too small for conclusions.";
    L.push(`> **INTERNAL — NOT FOR PUBLICATION.** ${why} Do not quote these numbers externally. Differences marked "NOT statistically clear" must not be described as wins or losses.`, "");
  }
  if (!r.live) {
    L.push("> **MOCK / DRY RUN.** Every model output below came from the offline fake provider. Accuracy, calibration and agreement numbers are synthetic and mean nothing about any model. Costs are catalog-price estimates for the simulated token counts; no API was called and no money was spent.", "");
  }
  if (r.aborted) L.push(`> **RUN ABORTED:** ${r.aborted}. Results cover only the items completed before the stop.`, "");

  L.push(`# Keplar One benchmark — ${r.tier}${r.internal ? " (INTERNAL)" : ""}`, "");
  L.push(`Run \`${r.runId}\` · ${r.live ? "LIVE (OpenRouter)" : "mock"} · provider: ${r.provider} · seed ${r.seed} · ${r.startedAt} → ${r.finishedAt}`, "");

  L.push("## Spend", "");
  L.push(`- Pre-run estimate: ${usd(r.estimate.total, 2)} (${usd(r.estimate.withContingency, 2)} with 20% contingency).`);
  L.push(`- ${r.live ? "Counted spend (max of billed / BYOK upstream / token estimate)" : "Simulated spend (not charged)"}: ${usd(r.spend.counted, 2)} over ${r.spend.calls} unique calls${r.spend.cap != null ? `; cap ${usd(r.spend.cap, 2)}` : ""}.`, "");

  L.push("## Datasets and sample", "");
  L.push("| Dataset | Test items | Dev items | Synthetic | HLE image items excluded | Source |", "|---|---|---|---|---|---|");
  for (const d of r.datasets) L.push(`| ${DATASET_LABEL[d.id]} | ${d.test} | ${d.dev} | ${d.synthetic} | ${d.imagesExcluded || "–"} | ${d.source ? `\`${d.source}\`` : "synthetic fill"} |`);
  const dnotes = r.datasets.flatMap((d) => d.notes);
  if (dnotes.length) L.push("", ...dnotes.map((n) => `- ${n}`));
  L.push("");

  const datasets = [...new Set(r.summaries.map((s) => s.dataset))];
  for (const ds of datasets) {
    const rows = r.summaries.filter((s) => s.dataset === ds);
    L.push(`## ${DATASET_LABEL[ds]}`, "");
    const bs = r.bestSingle[ds];
    if (bs) L.push(`Best single model (chosen on the dev split): **${bs.arm}** — dev accuracy ${Object.entries(bs.devAccuracy).map(([k, v]) => `${k} ${pct(v, 0)}`).join(", ")}.${bs.devOverlapsTest ? " ⚠ dev split overlaps test (pool too small), so this choice is NOT held out." : ""}`, "");
    L.push("| Setup | n×runs | Accuracy (95% CI) | Acc. if attempted | Abstained | Confident errors | $/question | $/correct | p50 / p95 latency |", "|---|---|---|---|---|---|---|---|---|");
    for (const s of rows) {
      const flag = s.imprecise ? " ⚠" : "";
      L.push(`| ${s.label}${s.searchAugmented ? " (search)" : ""} | ${s.items}×${s.runs} | ${pct(s.accuracy.estimate)} (${pct(s.accuracy.lo)}–${pct(s.accuracy.hi)})${flag} | ${pct(s.accuracyGivenAttempted)} | ${pct(s.abstentionRate)} | ${pct(s.confidentErrorRate)} | ${usd(s.costPerQuestion)} | ${usd(s.costPerCorrect)} | ${sec(s.latencyP50)} / ${sec(s.latencyP95)} |`);
    }
    L.push("", `⚠ = 95% CI half-width above ±5 points (imprecise). Confident error = graded incorrect with confidence ≥ ${HIGH_CONFIDENCE * 100}% (arms with a confidence score only). Abstentions count as not correct.`, "");
    if (ds === "simpleqa-verified" && rows.some((s) => s.searchAugmented)) L.push("Note: the SimpleQA Verified card says the benchmark is meant to be used without tools; search-augmented rows here are not comparable with its leaderboard.", "");

    const sanity = rows.filter((s) => s.officialHle);
    if (sanity.length) {
      L.push("### Harness check vs official HLE-Diamond (no tools)", "", "| Model | Ours (95% CI) | Official | Inside CI? |", "|---|---|---|---|");
      for (const s of sanity) L.push(`| ${s.label} | ${pct(s.accuracy.estimate)} (${pct(s.accuracy.lo)}–${pct(s.accuracy.hi)}) | ${pct(s.officialHle!.official)} | ${s.officialHle!.insideCI ? "yes" : "**NO — investigate**"} |`);
      L.push("");
    }

    const cal = rows.filter((s) => s.calibration);
    if (cal.length) {
      L.push("### Calibration", "", "| Setup | Confidence source | n answered | ECE (10 bins) | Adaptive ECE | Brier | Sel. acc @50% / @80% / @100% | AURC |", "|---|---|---|---|---|---|---|---|");
      for (const s of cal) {
        const c = s.calibration!;
        const se = s.selective!;
        L.push(`| ${s.label} | ${s.confidenceSource === "verbalized" ? "verbalized (secondary)" : s.confidenceSource} | ${c.n} | ${c.ece.toFixed(3)} | ${c.adaptiveEce.toFixed(3)} | ${c.brier.toFixed(3)} | ${pct(se.at50, 0)} / ${pct(se.at80, 0)} / ${pct(se.at100, 0)} | ${se.aurc.toFixed(3)} |`);
      }
      L.push("");
      for (const s of cal.filter((x) => x.confidenceSource === "keplar")) {
        L.push(`Reliability table — ${s.label}`, "", "| Confidence bin | n | Mean confidence | Accuracy | Gap |", "|---|---|---|---|---|");
        for (const b of s.calibration!.table) L.push(`| ${b.lo.toFixed(1)}–${b.hi.toFixed(1)} | ${b.n} | ${pct(b.meanConf)} | ${pct(b.accuracy)} | ${b.n ? pct(b.gap) : "–"} |`);
        L.push("");
      }
    }

    const ag = rows.filter((s) => s.byPanelAgreement || s.byAgreementLevel);
    if (ag.length) {
      L.push("### Accuracy when the models agreed vs disagreed", "", "| Setup | Panel used | Agreed: n / accuracy | Disagreed: n / accuracy | Consensus / Partial / None accuracy | Disagreement rate |", "|---|---|---|---|---|---|");
      for (const s of ag) {
        const p = s.byPanelAgreement;
        const lv = s.byAgreementLevel;
        L.push(`| ${s.label} | ${p?.panel ?? "–"} | ${p ? `${p.agreed.n} / ${pct(p.agreed.accuracy)}` : "–"} | ${p ? `${p.disagreed.n} / ${pct(p.disagreed.accuracy)}` : "–"} | ${lv ? `${pct(lv.consensus.accuracy, 0)} (${lv.consensus.n}) / ${pct(lv.partial.accuracy, 0)} (${lv.partial.n}) / ${pct(lv.none.accuracy, 0)} (${lv.none.n})` : "–"} | ${pct(s.disagreementRate)} |`);
      }
      L.push("");
    }

    const cmps = r.comparisons.filter((c) => c.dataset === ds);
    if (cmps.length) {
      L.push("### Paired comparisons", "", "| A vs B | n | Difference A − B, points (95% paired bootstrap CI) | McNemar A-only / B-only | p (Holm for primary) | Verdict |", "|---|---|---|---|---|---|");
      for (const c of cmps) {
        const verdict = c.clear ? "clear" : "**NOT statistically clear**";
        L.push(`| ${c.primary ? "**P** " : ""}${c.a} vs ${c.b}${c.b !== c.resolvedB ? ` (= ${c.resolvedB})` : ""} | ${c.n} | ${pp(c.diff.estimate)} (${pp(c.diff.lo)} to ${pp(c.diff.hi)}) | ${c.mcnemar.aOnly} / ${c.mcnemar.bOnly} | ${c.pAdjusted.toFixed(3)} | ${verdict}${c.note ? ` — ${c.note}` : ""} |`);
      }
      L.push("", "**P** = pre-registered primary comparison (Holm-adjusted within this dataset). Others are exploratory and unadjusted. \"Clear\" requires p < 0.05 and a CI that excludes 0.", "");
      const unclear = cmps.filter((c) => !c.clear);
      if (r.internal && unclear.length) L.push(`⚠ ${unclear.length} of ${cmps.length} differences on this dataset are NOT statistically clear. Do not describe them as wins or losses.`, "");
    }

    const leaks = rows.reduce((a, s) => a + s.retrievalLeaks, 0);
    if (leaks) L.push(`⚠ ${leaks} search-arm answers cited a blocked benchmark-hosting domain; those web checks were discarded (counted inconclusive).`, "");
    const human = rows.reduce((a, s) => a + (s.gradeMethods["needs-human"] ?? 0) + (s.gradeMethods["error"] ?? 0), 0);
    if (human) L.push(`⚠ ${human} graded answers need human review (judges disagreed with no majority, or failed). They are scored incorrect for now.`, "");
  }

  if (r.tokenProfile.length) {
    L.push("## Measured tokens vs assumed profile (answer calls)", "", "| Dataset | Calls | Avg input | Avg output (incl. reasoning) | Assumed input | Assumed output + reasoning |", "|---|---|---|---|---|---|");
    for (const t of r.tokenProfile.filter((x) => x.role === "answer")) {
      const p = PROFILES[t.dataset];
      L.push(`| ${DATASET_LABEL[t.dataset]} | ${t.calls} | ${Math.round(t.avgIn)} | ${Math.round(t.avgOut)} | ${p.inp} | ${p.out + p.rsn} |`);
    }
    L.push("");
  }
  if (r.notes.length) L.push("## Notes", "", ...r.notes.map((n) => `- ${n}`), "");
  return L.join("\n");
}
