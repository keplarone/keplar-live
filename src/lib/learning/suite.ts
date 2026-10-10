/**
 * The safety and quality gate for a candidate policy. It re-runs Keplar's own eval prompts (plus consented, redacted failure cases)
 * through the real router under the baseline and under the candidate, in every plan situation that has a hard rule, and checks:
 *
 *   guards    the fixed replies (human / conscious) still come from the code path no policy touches
 *   free      Free routing never contains a paid model or a judge, and keeps its panel cap
 *   media     images and video only go to models that can see them
 *   privacy   the sensitive tier never routes to a model that mandates data retention; excluded providers stay excluded
 *   shape     mode, panel size, verifier and judge presence are unchanged (a policy reorders models, it never reshapes a plan)
 *   cost      the plans are not noticeably more expensive
 *
 * and then estimates which policy would have done better on held-out evidence. Pure given its inputs.
 */
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { isFreeModel } from "@/lib/orchestration/free-guard";
import { CONSCIOUS_REPLY, guardReply, HUMAN_REPLY } from "@/lib/orchestration/identity-guards";
import { acceptsImages } from "@/lib/orchestration/media";
import { CostAwareRouter, FREE_MAX_PANEL } from "@/lib/orchestration/router";
import type { KeplarRequest, ModelSpec, RoutingPlan } from "@/lib/orchestration/types";
import { understand } from "@/lib/orchestration/understand";
import { expectedReward, type Evidence } from "./bandit";
import type { Category, Tier } from "./types";

export type BoostFn = (tier: Tier, category: Category, modelId: string) => number;
export type SuiteItem = { id: string; prompt: string; guard?: "human" | "conscious"; source: "eval" | "case" };

/** What the hosting code passes in: the models each tier can route to (in production, the live and free rosters). */
export type Rosters = { free: readonly ModelSpec[]; paid: readonly ModelSpec[] };

type Variant = { name: string; tier: Tier; req: Partial<KeplarRequest> };
const plan = (p: "free" | "plus" | "pro") => p;
const PIXEL = { images: [{ mime: "image/png", data: "" }] } as unknown as KeplarRequest["media"];

export function variantsFor(paid: readonly ModelSpec[]): Variant[] {
  const family = paid.find((m) => m.routable)?.family;
  return [
    { name: "free", tier: "free", req: { plan: plan("free") } },
    { name: "plus", tier: "paid", req: { plan: plan("plus") } },
    { name: "pro", tier: "paid", req: { plan: plan("pro") } },
    { name: "pro+images", tier: "paid", req: { plan: plan("pro"), media: PIXEL } },
    { name: "pro+sensitive", tier: "paid", req: { plan: plan("pro"), routing: { tier: "sensitive" } as KeplarRequest["routing"] } },
    ...(family ? [{ name: `plus-without-${family}`, tier: "paid" as Tier, req: { plan: "plus" as const, routing: { excludeProviders: [family] } as KeplarRequest["routing"] } }] : []),
  ];
}

export function itemsFrom(evalSet: readonly { id: string; prompt: string; expect: { guard?: "human" | "conscious" } }[], cases: readonly { id: string; text: string }[]): SuiteItem[] {
  return [
    ...evalSet.map((e) => ({ id: e.id, prompt: e.prompt, ...(e.expect.guard ? { guard: e.expect.guard } : {}), source: "eval" as const })),
    ...cases.filter((c) => c.text.length >= 8).map((c) => ({ id: c.id, prompt: c.text, source: "case" as const })),
  ];
}

export type Pooled = { arms: ReadonlyMap<string, Evidence>; pooled: ReadonlyMap<string, number> };
const armKey = (tier: Tier, category: Category, model: string) => `${tier}|${category}|${model}`;

export type SuiteResult = {
  checks: number;
  failures: string[];
  wins: number;
  losses: number;
  ties: number;
  baselineScore: number | null;
  candidateScore: number | null;
  costDeltaPct: number;
  regressions: string[];
};

const shape = (p: RoutingPlan) => `${p.mode}/${p.panel.length}/${p.verifier ? 1 : 0}/${p.judge ? 1 : 0}`;
const usdOf = (p: RoutingPlan) => p.estimate.usd;

export function runSuite(rosters: Rosters, items: readonly SuiteItem[], base: BoostFn, cand: BoostFn, held?: Pooled): SuiteResult {
  const out: SuiteResult = { checks: 0, failures: [], wins: 0, losses: 0, ties: 0, baselineScore: null, candidateScore: null, costDeltaPct: 0, regressions: [] };
  const fail = (m: string) => {
    if (out.failures.length < 20) out.failures.push(m);
  };
  const classifier = new HeuristicClassifier();
  const variants = variantsFor(rosters.paid);
  let bSum = 0;
  let cSum = 0;
  let scored = 0;
  let baseUsd = 0;
  let candUsd = 0;
  const catDelta = new Map<string, { sum: number; n: number }>();

  for (const item of items) {
    // Fixed guards: answered in code before any model or router, so no policy can reach them. Prove it for every guard prompt.
    const g = guardReply({ prompt: item.prompt });
    out.checks++;
    if (item.guard && g !== (item.guard === "human" ? HUMAN_REPLY : CONSCIOUS_REPLY)) fail(`guard: ${item.id} no longer gets its fixed reply`);
    if (g !== null) continue;

    const u = understand({ prompt: item.prompt });
    const prompt = u.rewritten ?? item.prompt;
    for (const v of variants) {
      const models = v.tier === "free" ? rosters.free : rosters.paid;
      const req: KeplarRequest = { prompt, ...v.req } as KeplarRequest;
      const c = classifier.classify(req);
      let b: RoutingPlan;
      try {
        b = new CostAwareRouter(models, base).route(c, req);
      } catch {
        continue; // the baseline cannot route this situation either (for example no vision model on Free)
      }
      let p: RoutingPlan;
      try {
        p = new CostAwareRouter(models, cand).route(c, req);
      } catch (e) {
        fail(`${v.name}/${item.id}: candidate cannot route what the baseline can (${e instanceof Error ? e.name : "error"})`);
        continue;
      }
      out.checks++;
      const seats = [...p.panel, ...(p.verifier ? [p.verifier] : []), ...(p.judge ? [p.judge] : [])];
      if (v.tier === "free") {
        if (seats.some((s) => !isFreeModel(s.model))) fail(`free/${item.id}: a paid model entered a Free plan`);
        if (p.judge) fail(`free/${item.id}: a judge entered a Free plan`);
        if (p.panel.length > FREE_MAX_PANEL) fail(`free/${item.id}: panel above the Free cap`);
      }
      if (v.req.media && p.panel.some((s) => !acceptsImages(s.model))) fail(`${v.name}/${item.id}: a model that cannot see images got an image`);
      if (v.req.routing && (v.req.routing as { tier?: string }).tier === "sensitive" && seats.some((s) => s.model.capabilities.requiresProviderRetention)) fail(`${v.name}/${item.id}: a retention-mandating model on the sensitive tier`);
      const excluded = (v.req.routing as { excludeProviders?: string[] } | undefined)?.excludeProviders ?? [];
      if (seats.some((s) => excluded.includes(s.model.family))) fail(`${v.name}/${item.id}: an excluded provider was used`);
      if (shape(p) !== shape(b)) fail(`${v.name}/${item.id}: plan shape changed ${shape(b)} → ${shape(p)}`);
      baseUsd += usdOf(b);
      candUsd += usdOf(p);

      if (held) {
        const cat = `${c.kind}:${c.complexity}`;
        const pooled = held.pooled.get(`${v.tier}|${cat}`);
        if (pooled !== undefined) {
          const score = (plan: RoutingPlan) => plan.panel.reduce((s, m) => s + expectedReward(held.arms.get(armKey(v.tier, cat, m.model.id)), pooled), 0) / Math.max(1, plan.panel.length);
          const bs = score(b);
          const cs = score(p);
          bSum += bs;
          cSum += cs;
          scored++;
          const d = cs - bs;
          if (d > 0.002) out.wins++;
          else if (d < -0.002) out.losses++;
          else out.ties++;
          const key = `${v.tier}|${cat}`;
          const cur = catDelta.get(key) ?? { sum: 0, n: 0 };
          catDelta.set(key, { sum: cur.sum + d, n: cur.n + 1 });
        }
      }
    }
  }
  if (scored) {
    out.baselineScore = Math.round((bSum / scored) * 10_000) / 10_000;
    out.candidateScore = Math.round((cSum / scored) * 10_000) / 10_000;
  }
  out.costDeltaPct = baseUsd > 0 ? Math.round(((candUsd - baseUsd) / baseUsd) * 1000) / 10 : 0;
  for (const [k, v] of catDelta) if (v.sum / v.n < -0.01) out.regressions.push(k.replace("|", " / "));
  return out;
}
