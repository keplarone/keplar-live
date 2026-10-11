/**
 * Controlled A/B experiments on the first-party funnel (src/lib/seo/events.ts). Isomorphic and pure: the browser hook
 * (use-experiment.ts) and the admin report (/admin/experiments) both use this file.
 *
 * Policy (docs/growth/EXPERIMENTS.md):
 *  - Nothing runs by default. An experiment runs only when its id is listed in NEXT_PUBLIC_KEPLAR_EXPERIMENTS, which an
 *    admin sets in the hosting environment after approval. Removing it stops the experiment on the next deploy.
 *  - Assignment is stable per browser: a hash of the experiment id and the random first-party browser id (keplar_vid,
 *    only created after the visitor allowed Analytics). No consent, no id: the visitor always sees the control.
 *  - Exposure is recorded explicitly (event experiment_exposure, where = "x:<experiment>:<arm>"), at most once per session.
 *  - A conversion counts only when it happens after that browser's first exposure.
 *  - The report never declares a winner. Below the minimum sample it says "too early"; above it, it reports the difference,
 *    a two-sided p-value, the guardrails, and a sample-ratio check. A person decides.
 */
import type { SeoEvent, SeoEventRow } from "@/lib/seo/events";

export type Arm = { id: string; label: string; weight: number };
export type Experiment = {
  id: string;
  title: string;
  hypothesis: string;
  /** The first arm is the control. */
  arms: Arm[];
  primary: SeoEvent;
  /** Steps that must not get worse (checked and shown, never optimized for). */
  guardrails: SeoEvent[];
  /** Exposed browsers needed in every arm before any comparison is shown. */
  minPerArm: number;
  /** Conversions needed across all arms before any comparison is shown. */
  minConversions: number;
};

export const EXPERIMENTS: Experiment[] = [
  {
    id: "home-cta",
    title: "Home hero button label",
    hypothesis: "Naming the first action (\"Ask your first question\") gets more first-time visitors to ask than the brand-led \"Try Keplar\".",
    arms: [
      { id: "control", label: "Try Keplar", weight: 1 },
      { id: "ask", label: "Ask your first question", weight: 1 },
    ],
    primary: "first_prompt",
    guardrails: ["synthesis_success", "signup_complete"],
    minPerArm: 500,
    minConversions: 60,
  },
];

export const experimentById = (id: string) => EXPERIMENTS.find((e) => e.id === id);

const ID = /^[a-z0-9-]{1,32}$/;

/** Experiment ids switched on for this deployment (unknown ids are ignored). */
export function runningIds(raw: string | undefined = process.env.NEXT_PUBLIC_KEPLAR_EXPERIMENTS): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter((s) => ID.test(s) && experimentById(s)));
}

/** 32-bit FNV-1a: small, deterministic, the same in the browser and on the server. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The arm this browser sees: stable for the same experiment and browser id, spread by the arms' weights. */
export function assignArm(exp: Experiment, browserId: string): Arm {
  const total = exp.arms.reduce((n, a) => n + Math.max(0, a.weight), 0);
  let x = (fnv1a(`${exp.id}:${browserId}`) / 2 ** 32) * total;
  for (const a of exp.arms) {
    x -= Math.max(0, a.weight);
    if (x < 0) return a;
  }
  return exp.arms[0];
}

export const exposureTag = (exp: string, arm: string) => `x:${exp}:${arm}`;
const parseTag = (where: string | undefined) => {
  const m = /^x:([a-z0-9-]{1,32}):([a-z0-9-]{1,12})$/.exec(where ?? "");
  return m ? { exp: m[1], arm: m[2] } : null;
};

/* ── statistics ─────────────────────────────────────────────────────────────── */

/** Standard normal CDF (Abramowitz and Stegun 7.1.26 erf, error under 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Two-sided p-value of a two-proportion z-test (pooled), or null when it is undefined. */
export function twoProportionP(c1: number, n1: number, c2: number, n2: number): number | null {
  if (!n1 || !n2) return null;
  const p = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = (c2 / n2 - c1 / n1) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/** Sample-ratio mismatch: chi-square p-value of exposures against the arms' weights (df = arms - 1, normal approximation for df > 1). */
export function sampleRatioP(counts: number[], weights: number[]): number | null {
  const n = counts.reduce((a, b) => a + b, 0);
  const w = weights.reduce((a, b) => a + b, 0);
  if (!n || !w || counts.length < 2) return null;
  const chi = counts.reduce((acc, c, i) => {
    const e = (n * weights[i]) / w;
    return e ? acc + (c - e) ** 2 / e : acc;
  }, 0);
  const df = counts.length - 1;
  if (df === 1) return 2 * (1 - normalCdf(Math.sqrt(chi)));
  // Wilson-Hilferty: chi-square to an approximately normal z.
  const z = (Math.cbrt(chi / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCdf(z);
}

/* ── report ─────────────────────────────────────────────────────────────────── */

export type ArmResult = {
  arm: Arm;
  exposed: number;
  conversions: number;
  rate: number | null;
  guardrails: { event: SeoEvent; conversions: number; rate: number | null }[];
  /** Against the control (null for the control itself). */
  vsControl: { diff: number; p: number | null } | null;
};
export type Verdict = "not-started" | "too-early" | "sample-ratio-mismatch" | "no-clear-difference" | "difference";
export type ExperimentResult = { experiment: Experiment; running: boolean; arms: ArmResult[]; srmP: number | null; verdict: Verdict; note: string };

export const SIGNIFICANCE = 0.05;
export const SRM_ALERT = 0.001;

/** Build one experiment's result from raw funnel rows. Pure. */
export function analyze(exp: Experiment, rows: SeoEventRow[], running: boolean): ExperimentResult {
  // First exposure per browser; a browser that somehow saw two arms is excluded (it would contaminate both).
  const first = new Map<string, { arm: string; at: string }>();
  const mixed = new Set<string>();
  for (const r of rows) {
    if (r.event !== "experiment_exposure") continue;
    const t = parseTag(r.where);
    if (!t || t.exp !== exp.id || !exp.arms.some((a) => a.id === t.arm)) continue;
    const seen = first.get(r.vid);
    if (!seen) first.set(r.vid, { arm: t.arm, at: r.at });
    else {
      if (seen.arm !== t.arm) mixed.add(r.vid);
      if (r.at < seen.at) seen.at = r.at;
    }
  }
  for (const v of mixed) first.delete(v);

  const after = (event: SeoEvent) => {
    const hit = new Set<string>();
    for (const r of rows) {
      if (r.event !== event) continue;
      const e = first.get(r.vid);
      if (e && r.at >= e.at) hit.add(r.vid);
    }
    return hit;
  };
  const primaryHits = after(exp.primary);
  const guardHits = exp.guardrails.map((g) => ({ event: g, hits: after(g) }));

  const base = exp.arms.map((arm) => {
    const vids = [...first].filter(([, e]) => e.arm === arm.id).map(([v]) => v);
    const conv = vids.filter((v) => primaryHits.has(v)).length;
    return {
      arm,
      exposed: vids.length,
      conversions: conv,
      rate: vids.length ? conv / vids.length : null,
      guardrails: guardHits.map((g) => {
        const c = vids.filter((v) => g.hits.has(v)).length;
        return { event: g.event, conversions: c, rate: vids.length ? c / vids.length : null };
      }),
    };
  });
  const control = base[0];
  const arms: ArmResult[] = base.map((a, i) => ({
    ...a,
    vsControl: i === 0 || a.rate === null || control.rate === null ? null : { diff: a.rate - control.rate, p: twoProportionP(control.conversions, control.exposed, a.conversions, a.exposed) },
  }));

  const srmP = sampleRatioP(arms.map((a) => a.exposed), exp.arms.map((a) => a.weight));
  const totalConv = arms.reduce((n, a) => n + a.conversions, 0);
  const exposedTotal = arms.reduce((n, a) => n + a.exposed, 0);
  let verdict: Verdict;
  let note: string;
  if (!exposedTotal) {
    verdict = "not-started";
    note = running ? "Switched on, but no consented visitor has been exposed yet." : "Not running. Add its id to NEXT_PUBLIC_KEPLAR_EXPERIMENTS after approval to start it.";
  } else if (srmP !== null && srmP < SRM_ALERT && exposedTotal >= 100) {
    verdict = "sample-ratio-mismatch";
    note = `Exposures do not match the planned split (p = ${srmP.toExponential(1)}). Assignment or exposure tracking is broken; fix it before reading any result.`;
  } else if (arms.some((a) => a.exposed < exp.minPerArm) || totalConv < exp.minConversions) {
    verdict = "too-early";
    note = `Too early: every arm needs ${exp.minPerArm} exposed browsers and ${exp.minConversions} conversions in total before a comparison means anything.`;
  } else if (arms.slice(1).some((a) => a.vsControl?.p !== null && a.vsControl!.p! < SIGNIFICANCE)) {
    verdict = "difference";
    note = `At least one arm differs from the control at p < ${SIGNIFICANCE}. Check the guardrails, then a person decides whether to ship it; nothing changes automatically.`;
  } else {
    verdict = "no-clear-difference";
    note = `No arm differs from the control at p < ${SIGNIFICANCE} yet. Keep it running or stop it; don't read the small gaps.`;
  }
  return { experiment: exp, running, arms, srmP, verdict, note };
}
