/** Aggregation of graded results into the plan §3 metrics and the §4.6 comparisons. */
import { ARMS, HIGH_CONFIDENCE, IMPRECISE_HALF_WIDTH, OFFICIAL_HLE_DIAMOND, PRIMARY_COMPARISONS, type Arm } from "./config";
import { hashStr } from "./rng";
import * as S from "./stats";
import type { ArmResult, DatasetId } from "./types";

export type ArmSummary = {
  arm: string;
  label: string;
  dataset: DatasetId;
  items: number;
  runs: number;
  accuracy: S.CI;
  accuracyWilsonRun1: S.CI;
  halfWidth: number;
  imprecise: boolean;
  attemptedRate: number;
  accuracyGivenAttempted: number;
  abstentionRate: number;
  verdicts: { correct: number; incorrect: number; not_attempted: number };
  confidenceSource: string | null;
  confidentErrorRate: number | null;
  calibration: null | { n: number; ece: number; adaptiveEce: number; brier: number; table: S.Bin[] };
  selective: null | { at50: number; at80: number; at100: number; aurc: number };
  costPerQuestion: number;
  costPerCorrect: number | null;
  totalCost: number;
  latencyP50: number;
  latencyP95: number;
  disagreementRate: number | null;
  byAgreementLevel: Record<string, { n: number; accuracy: number }> | null;
  byPanelAgreement: { panel: string; agreed: { n: number; accuracy: number }; disagreed: { n: number; accuracy: number } } | null;
  gradeMethods: Record<string, number>;
  retrievalLeaks: number;
  searchAugmented: boolean;
  officialHle?: { official: number; insideCI: boolean };
};

export type Comparison = {
  dataset: DatasetId;
  a: string;
  b: string;
  resolvedB: string;
  primary: boolean;
  n: number;
  diff: S.CI;
  mcnemar: { aOnly: number; bOnly: number; p: number };
  pAdjusted: number;
  clear: boolean;
  note?: string;
};

const correctOf = (r: ArmResult) => (r.grade?.verdict === "correct" ? 1 : 0);

function seedFor(...parts: string[]) {
  return hashStr(parts.join("|"));
}

function itemScores(rs: ArmResult[]): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const r of rs) {
    const a = by.get(r.itemId) ?? [];
    a.push(correctOf(r));
    by.set(r.itemId, a);
  }
  return new Map([...by].map(([k, v]) => [k, S.mean(v)]));
}

export function summarize(arm: Arm, label: string, dataset: DatasetId, rs: ArmResult[], panelAgreement: Map<string, { panel: string; disagreed: boolean }>): ArmSummary {
  const scores = itemScores(rs);
  const xs = [...scores.values()];
  const acc = S.bootstrapMeanCI(xs, seedFor("acc", arm.id, dataset));
  const run1 = rs.filter((r) => r.run === 1);
  const k1 = run1.filter((r) => correctOf(r)).length;
  const v = { correct: 0, incorrect: 0, not_attempted: 0 };
  rs.forEach((r) => v[r.grade?.verdict ?? "incorrect"]++);
  const total = rs.length;
  const attempted = v.correct + v.incorrect;
  const withConf = rs.filter((r) => r.confidence != null);
  const confSource = withConf[0]?.confidenceSource ?? null;
  const answered = withConf.filter((r) => !r.declined && r.grade?.verdict !== "not_attempted");
  const calibration = answered.length
    ? {
        n: answered.length,
        ece: S.ece(answered.map((r) => r.confidence!), answered.map(correctOf)),
        adaptiveEce: S.adaptiveEce(answered.map((r) => r.confidence!), answered.map(correctOf)),
        brier: S.brier(answered.map((r) => r.confidence!), answered.map(correctOf)),
        table: S.reliabilityTable(answered.map((r) => r.confidence!), answered.map(correctOf)),
      }
    : null;
  const selective = withConf.length ? S.selective(rs.map((r) => (r.declined || r.confidence == null ? -1 : r.confidence)), rs.map(correctOf)) : null;
  const confidentErrors = withConf.length ? rs.filter((r) => r.grade?.verdict === "incorrect" && (r.confidence ?? 0) >= HIGH_CONFIDENCE).length / total : null;
  const totalCost = rs.reduce((a, r) => a + r.costUsd, 0);
  const lat = rs.map((r) => r.latencyMs);

  const withAgree = rs.filter((r) => r.agreement);
  let byLevel: ArmSummary["byAgreementLevel"] = null;
  if (withAgree.length) {
    byLevel = {};
    for (const lvl of ["consensus", "partial", "none"]) {
      const g = withAgree.filter((r) => r.agreement!.level === lvl);
      byLevel[lvl] = { n: g.length, accuracy: g.length ? S.mean(g.map(correctOf)) : NaN };
    }
  }
  let byPanel: ArmSummary["byPanelAgreement"] = null;
  const tagged = rs.map((r) => ({ r, pa: panelAgreement.get(`${r.itemId}|${r.run}`) ?? panelAgreement.get(`${r.itemId}|1`) })).filter((x) => x.pa);
  if (tagged.length) {
    const ag = tagged.filter((x) => !x.pa!.disagreed).map((x) => correctOf(x.r));
    const dg = tagged.filter((x) => x.pa!.disagreed).map((x) => correctOf(x.r));
    byPanel = { panel: tagged[0].pa!.panel, agreed: { n: ag.length, accuracy: ag.length ? S.mean(ag) : NaN }, disagreed: { n: dg.length, accuracy: dg.length ? S.mean(dg) : NaN } };
  }
  const methods: Record<string, number> = {};
  rs.forEach((r) => (methods[r.grade?.method ?? "none"] = (methods[r.grade?.method ?? "none"] ?? 0) + 1));
  const halfWidth = (acc.hi - acc.lo) / 2;
  const s: ArmSummary = {
    arm: arm.id, label, dataset, items: scores.size, runs: new Set(rs.map((r) => r.run)).size,
    accuracy: acc, accuracyWilsonRun1: S.wilson(k1, run1.length), halfWidth, imprecise: halfWidth > IMPRECISE_HALF_WIDTH,
    attemptedRate: total ? attempted / total : NaN,
    accuracyGivenAttempted: attempted ? v.correct / attempted : NaN,
    abstentionRate: total ? v.not_attempted / total : NaN,
    verdicts: v, confidenceSource: confSource, confidentErrorRate: confidentErrors, calibration, selective,
    costPerQuestion: total ? totalCost / total : NaN,
    costPerCorrect: v.correct ? totalCost / v.correct : null,
    totalCost,
    latencyP50: S.percentile(lat, 0.5), latencyP95: S.percentile(lat, 0.95),
    disagreementRate: withAgree.length ? withAgree.filter((r) => r.agreement!.disagreed).length / withAgree.length : null,
    byAgreementLevel: byLevel, byPanelAgreement: byPanel, gradeMethods: methods,
    retrievalLeaks: rs.filter((r) => r.retrieval?.leaked).length,
    searchAugmented: Boolean(arm.retrieval),
  };
  if (dataset === "hle-diamond" && arm.model && OFFICIAL_HLE_DIAMOND[arm.model] != null) {
    const off = OFFICIAL_HLE_DIAMOND[arm.model];
    s.officialHle = { official: off, insideCI: off >= acc.lo && off <= acc.hi };
  }
  return s;
}

export function compare(dataset: DatasetId, a: string, b: string, resolvedB: string, primary: boolean, results: ArmResult[]): Omit<Comparison, "pAdjusted" | "clear"> | null {
  const ra = results.filter((r) => r.dataset === dataset && r.arm === a);
  const rb = results.filter((r) => r.dataset === dataset && r.arm === resolvedB);
  if (!ra.length || !rb.length) return null;
  const sa = itemScores(ra);
  const sb = itemScores(rb);
  const ids = [...sa.keys()].filter((k) => sb.has(k)).sort();
  const diff = S.pairedBootstrapCI(ids.map((k) => sa.get(k)!), ids.map((k) => sb.get(k)!), seedFor("cmp", dataset, a, b));
  const a1 = new Map(ra.filter((r) => r.run === 1).map((r) => [r.itemId, correctOf(r)]));
  const b1 = new Map(rb.filter((r) => r.run === 1).map((r) => [r.itemId, correctOf(r)]));
  let aOnly = 0;
  let bOnly = 0;
  for (const k of ids) {
    if (a1.get(k) === 1 && b1.get(k) === 0) aOnly++;
    if (a1.get(k) === 0 && b1.get(k) === 1) bOnly++;
  }
  const armA = ARMS.find((x) => x.id === a);
  const armB = ARMS.find((x) => x.id === resolvedB);
  const note = armA?.retrieval && !armB?.retrieval && armB?.kind !== "keplar" ? "Search-augmented arm vs a no-tools baseline: not a like-for-like comparison (plan §2 tools policy)." : undefined;
  return { dataset, a, b, resolvedB, primary, n: ids.length, diff, mcnemar: { aOnly, bOnly, p: S.mcnemarExact(aOnly, bOnly) }, note };
}

/** Primary comparisons are Holm-adjusted per dataset; exploratory ones are reported unadjusted. */
export function comparisons(datasets: DatasetId[], results: ArmResult[], bestSingle: Partial<Record<DatasetId, string>>, exploratory: [string, string][]): Comparison[] {
  const out: Comparison[] = [];
  for (const ds of datasets) {
    const resolve = (id: string) => (id === "best-single" ? bestSingle[ds] ?? "" : id);
    const prim = PRIMARY_COMPARISONS.map(([a, b]) => compare(ds, a, b, resolve(b), true, results)).filter((c): c is NonNullable<typeof c> => c != null);
    const adj = S.holm(prim.map((c) => c.mcnemar.p));
    prim.forEach((c, i) => out.push({ ...c, pAdjusted: adj[i], clear: adj[i] < 0.05 && (c.diff.lo > 0 || c.diff.hi < 0) }));
    const seen = new Set(PRIMARY_COMPARISONS.map(([a, b]) => `${a}|${b}`));
    for (const [a, b] of exploratory) {
      if (seen.has(`${a}|${b}`)) continue;
      const c = compare(ds, a, b, resolve(b), false, results);
      if (c) out.push({ ...c, pAdjusted: c.mcnemar.p, clear: c.mcnemar.p < 0.05 && (c.diff.lo > 0 || c.diff.hi < 0) });
    }
  }
  return out;
}
