/**
 * Keplar One benchmark harness — CLI.
 *
 *   npx tsx bench/run.ts                       # mock smoke run on fixtures (default, offline, free)
 *   npx tsx bench/run.ts --tier pilot-100      # mock pilot-sized dry run (synthetic fill)
 *   npx tsx bench/run.ts --tier pilot-100 --estimate-only
 *   npx tsx bench/run.ts --tier pilot-100 --live --max-usd 140 --data-dir bench/data   # REAL spend
 *
 * See bench/README.md. Nothing here calls a network unless --live is given together with
 * OPENROUTER_API_KEY and --max-usd.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  ARMS, CONTINGENCY, DATASET_LABEL, DEV_FRACTION, KEPLAR_ABSTAIN_BELOW, MIN_DEV_ITEMS, OFFICIAL_HLE_DIAMOND,
  SAMPLE_WEIGHTS, SEED, SINGLE_ARMS, TIERS, type Arm, type Tier,
} from "./lib/config";
import { estimate } from "./lib/estimate";
import { gradeResult } from "./lib/grade";
import { loadDataset } from "./lib/loaders";
import { comparisons, summarize, type ArmSummary } from "./lib/metrics";
import { Ctx, runArm } from "./lib/pipeline";
import { BENCH_DIR } from "./lib/prompts";
import { FakeProvider, OpenRouterBenchProvider } from "./lib/providers";
import { renderReport, type ReportInput } from "./lib/report";
import { makeSplit, syntheticFill } from "./lib/sampling";
import { CapExceededError, SpendGuard } from "./lib/spend";
import type { ArmResult, BenchProvider, CallRequest, CallResult, DatasetId, Item } from "./lib/types";

const HELP = `Keplar One benchmark harness

Mode (default: mock — offline fake provider, no network, no spend)
  --live                 real run via OpenRouter; requires OPENROUTER_API_KEY and --max-usd
  --max-usd N            hard cap; every call reserves its worst case first and the run aborts before
                         the cap would be exceeded (also simulated in mock mode when given)
  --yes                  skip the interactive confirmation of a live run

Sample
  --tier T               smoke | pilot-100 | pilot-150 | lean | full   (default smoke)
  --sample N             N test questions with the pilot weighting (50/40/10), overrides tier counts
  --datasets a,b         restrict to datasets (hle-diamond,simpleqa-verified,frames,gpqa-diamond,fresh)
  --data-dir DIR         real dataset exports (default bench/data). Mock also falls back to bench/fixtures.
  --ids FILE             reuse a pre-registered item-ID manifest (from --plan-only)
  --seed N               default ${SEED}
  --limit N              cap the run at N test items in total (and N dev items per dataset); for smoke tests
  --max-tokens N         clamp every call's max_tokens to N (smoke tests on low-limit keys; changes the protocol)
  --fixtures-smoke       live connectivity smoke test on the bundled synthetic fixtures (needs --live and
                         --limit ≤ 3). Checks that every setup's models answer; accuracy numbers are meaningless

Setups
  --arms a,b             subset of setup ids (default: all 13 setups)
  --with-frontier        add the optional frontier mix (HLE-Diamond only)

Other
  --estimate-only        print the cost estimate and exit
  --plan-only            write the item-ID manifest + estimate and exit
  --out DIR              output directory (default bench/out/<run-id>)
  --concurrency N        items in flight (default 4)
  --abstain-below X      Keplar abstention threshold (default ${KEPLAR_ABSTAIN_BELOW}; 0 disables)
  --fresh-cutoff DATE    Fresh Claims must be written and about events after this date (default 2026-09-01)
  --allow-unverified     keep Fresh Claims that fail the double-verification check (mock/testing only)
  --price-date DATE      price catalog date (default today)
`;

type Opts = ReturnType<typeof parse>;

function parse(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      live: { type: "boolean", default: false },
      "max-usd": { type: "string" },
      yes: { type: "boolean", default: false },
      tier: { type: "string", default: "smoke" },
      sample: { type: "string" },
      datasets: { type: "string" },
      "data-dir": { type: "string" },
      ids: { type: "string" },
      seed: { type: "string" },
      limit: { type: "string" },
      "max-tokens": { type: "string" },
      "fixtures-smoke": { type: "boolean", default: false },
      arms: { type: "string" },
      "with-frontier": { type: "boolean", default: false },
      "estimate-only": { type: "boolean", default: false },
      "plan-only": { type: "boolean", default: false },
      out: { type: "string" },
      concurrency: { type: "string", default: "4" },
      "abstain-below": { type: "string" },
      "fresh-cutoff": { type: "string", default: "2026-09-01" },
      "allow-unverified": { type: "boolean", default: false },
      "price-date": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  return values;
}

const today = () => new Date().toISOString().slice(0, 10);
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const fmtUsd = (x: number) => `$${x.toFixed(2)}`;

/** Clamps max_tokens (smoke tests on keys with a low per-request credit ceiling). */
class ClampedProvider implements BenchProvider {
  readonly live: boolean;
  readonly name: string;
  constructor(private readonly inner: BenchProvider, private readonly maxTokens: number) {
    this.live = inner.live;
    this.name = `${inner.name} (max_tokens ≤ ${maxTokens})`;
  }
  call(req: CallRequest): Promise<CallResult> {
    return this.inner.call({ ...req, maxTokens: Math.min(req.maxTokens, this.maxTokens) });
  }
}

/** Mock-only: simulate the spend cap with the fake provider's estimated costs. */
class GuardedFake implements BenchProvider {
  readonly live = false;
  readonly name: string;
  constructor(private readonly inner: FakeProvider, private readonly guard: SpendGuard) {
    this.name = `${inner.name} + simulated cap`;
  }
  async call(req: CallRequest): Promise<CallResult> {
    const worst = this.guard.worstCase(req.modelId, 1500, req.maxTokens, req.web ? 1 : 0, 0.00739);
    const release = this.guard.reserve(worst, `${req.role} ${req.modelId}`);
    try {
      const r = await this.inner.call(req);
      this.guard.commit(r.costUsd);
      return r;
    } finally {
      release();
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>, stop: () => boolean) {
  let i = 0;
  const worker = async () => {
    while (i < items.length && !stop()) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, n) }, worker));
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let o: Opts;
  try {
    o = parse(argv);
  } catch (e) {
    console.error(String(e instanceof Error ? e.message : e), "\n\n" + HELP);
    return 2;
  }
  if (o.help) {
    console.log(HELP);
    return 0;
  }
  const at = o["price-date"] ?? today();
  const seed = o.seed ? Number(o.seed) : SEED;
  const live = Boolean(o.live);
  const cap = o["max-usd"] != null ? Number(o["max-usd"]) : null;
  if (cap != null && !(cap > 0)) return fail("--max-usd must be a positive number");
  const limit = o.limit != null ? Number(o.limit) : null;
  if (limit != null && !(Number.isInteger(limit) && limit > 0)) return fail("--limit must be a positive integer");
  const fixturesSmoke = Boolean(o["fixtures-smoke"]);
  if (fixturesSmoke && (!live || limit == null || limit > 3)) return fail("--fixtures-smoke is a live connectivity check: it needs --live and --limit 1..3.");

  // ── live-mode gate: explicit flag + key + cap, all three ──
  const key = process.env.OPENROUTER_API_KEY ?? "";
  if (live) {
    if (!key) return fail("--live needs OPENROUTER_API_KEY in the environment. Nothing was run.");
    if (cap == null) return fail("--live needs a hard spend cap: --max-usd <dollars>. Nothing was run.");
  }

  // ── tier and sample ──
  const baseTier: Tier | undefined = TIERS[o.tier ?? "smoke"];
  if (!baseTier) return fail(`Unknown tier ${o.tier}. Use one of ${Object.keys(TIERS).join(", ")}.`);
  let tier: Tier = baseTier;
  if (o.sample) {
    const n = Number(o.sample);
    if (!(n > 0)) return fail("--sample must be a positive integer");
    const entries = Object.entries(SAMPLE_WEIGHTS) as [DatasetId, number][];
    const counts: Partial<Record<DatasetId, number>> = {};
    let left = n;
    entries.forEach(([ds, w], i) => {
      const c = i === entries.length - 1 ? left : Math.round(n * w);
      counts[ds] = c;
      left -= c;
    });
    tier = { id: `sample-${n}`, counts, runsAll: 1, runsKey: 1, internal: true, note: "Ad-hoc sample with the pilot weighting." };
  }
  let dsList = Object.keys(tier.counts) as DatasetId[];
  if (o.datasets) {
    const want = o.datasets.split(",").map((s) => s.trim()) as DatasetId[];
    const bad = want.filter((d) => !DATASET_LABEL[d]);
    if (bad.length) return fail(`Unknown dataset(s): ${bad.join(", ")}`);
    dsList = want.filter((d) => tier.counts[d] != null || o.tier === "full");
    if (!dsList.length) return fail(`None of ${want.join(", ")} is part of tier ${tier.id}.`);
  }

  // ── arms ──
  let arms: Arm[] = ARMS.filter((a) => !a.optional || o["with-frontier"]);
  if (o.arms) {
    const want = new Set(o.arms.split(",").map((s) => s.trim()));
    const unknown = [...want].filter((w) => !ARMS.some((a) => a.id === w));
    if (unknown.length) return fail(`Unknown arm(s): ${unknown.join(", ")}. Known: ${ARMS.map((a) => a.id).join(", ")}`);
    arms = ARMS.filter((a) => want.has(a.id));
  }
  const runsFor = (a: Arm) => (a.key ? tier.runsKey : tier.runsAll);
  const needDev = arms.some((a) => a.kind === "best-single");

  // ── load + split ──
  const dataDir = resolve(o["data-dir"] ?? join(BENCH_DIR, "data"));
  const fixtures = join(BENCH_DIR, "fixtures");
  if (live && !fixturesSmoke && resolve(dataDir) === resolve(fixtures)) return fail("Fixtures are synthetic. A live run needs real dataset exports in --data-dir.");
  // --fixtures-smoke reads ONLY the bundled synthetic fixtures (never real exports, never downloads).
  const dirs = fixturesSmoke ? [fixtures] : live ? [dataDir] : [dataDir, fixtures];
  const manifest = o.ids ? (JSON.parse(readFileSync(o.ids, "utf8")) as { datasets: Record<string, { test: string[]; dev: string[] }> }) : null;

  const splits: Record<string, { test: Item[]; dev: Item[]; devOverlapsTest: boolean }> = {};
  const dsInfo: ReportInput["datasets"] = [];
  for (const ds of dsList) {
    const loaded = loadDataset(ds, dirs, { seed, freshCutoff: o["fresh-cutoff"]!, allowUnverified: Boolean(o["allow-unverified"]) && !live });
    const notes = [...loaded.notes];
    let pool = loaded.items;
    const images = pool.filter((i) => i.hasImage).length;
    if (images) {
      pool = pool.filter((i) => !i.hasImage);
      notes.push(`${DATASET_LABEL[ds]}: ${images} image items excluded; text-only subset used for every setup (plan §1).`);
    }
    if (fixturesSmoke) notes.push(`${DATASET_LABEL[ds]}: LIVE FIXTURES SMOKE TEST: synthetic fixture items, connectivity check only; accuracy is meaningless.`);
    if (live && !fixturesSmoke && pool.some((i) => i.synthetic)) return fail(`${ds}: ${loaded.source} contains synthetic items. Live runs use real exports only.`);
    const want = tier.counts[ds] ?? "all";
    let split;
    if (manifest?.datasets[ds]) {
      const byId = new Map(pool.map((i) => [i.id, i]));
      const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((x): x is Item => Boolean(x));
      const m = manifest.datasets[ds];
      split = { test: pick(m.test), dev: pick(m.dev), devOverlapsTest: m.dev.some((d) => m.test.includes(d)), notes: [] as string[] };
      if (split.test.length !== m.test.length) return fail(`${ds}: ${m.test.length - split.test.length} manifest ids not found in ${loaded.source}`);
    } else {
      const nTarget = want === "all" ? pool.length : want;
      const devN = Math.max(MIN_DEV_ITEMS, Math.round(DEV_FRACTION * nTarget));
      if (!live && pool.length < nTarget + devN) {
        const fill = syntheticFill(ds, pool, nTarget + devN - pool.length);
        notes.push(`${DATASET_LABEL[ds]}: ${fill.length} synthetic placeholder items added (mock only; ${pool.length} real/fixture items available).`);
        pool = [...pool, ...fill];
      }
      if (live && !fixturesSmoke && want !== "all" && pool.length < nTarget + devN) return fail(`${ds}: need ${nTarget + devN} items (test + dev), found ${pool.length} in ${loaded.source ?? dataDir}.`);
      split = makeSplit(pool, want, DEV_FRACTION, MIN_DEV_ITEMS, seed, ds);
    }
    notes.push(...split.notes);
    if (limit != null && split.dev.length > limit) split = { ...split, dev: split.dev.slice(0, limit) };
    splits[ds] = split;
    dsInfo.push({ id: ds, test: split.test.length, dev: needDev ? split.dev.length : 0, synthetic: split.test.filter((i) => i.synthetic).length, imagesExcluded: images, source: loaded.source, notes });
  }

  // ── --limit: at most N test items in total, taken in dataset order ──
  if (limit != null) {
    let left = limit;
    for (const ds of dsList) {
      const keep = Math.min(left, splits[ds].test.length);
      splits[ds] = { ...splits[ds], test: splits[ds].test.slice(0, keep) };
      left -= keep;
      const info = dsInfo.find((d) => d.id === ds)!;
      info.test = keep;
      info.dev = needDev ? splits[ds].dev.length : 0;
      info.synthetic = splits[ds].test.filter((i) => i.synthetic).length;
    }
    dsList = dsList.filter((ds) => splits[ds].test.length > 0);
  }

  // ── estimate (always shown before anything runs) ──
  const est = estimate(dsList.map((ds) => ({ dataset: ds, items: splits[ds].test.length, devItems: needDev ? splits[ds].dev.length : 0 })), arms, runsFor, at);
  console.log(`\nKeplar One benchmark — tier ${tier.id} — ${live ? "LIVE (OpenRouter, real spend)" : "MOCK (offline fake provider, no spend)"}`);
  console.log(`Setups: ${new Set(arms.map((a) => a.n.replace(/[ab]$/, ""))).size} of the plan's rows (${arms.length} runnable ids; majority vote is split into economy and premium panels): ${arms.map((a) => a.id).join(", ")}`);
  console.log(`\nCost estimate (prices as of ${at}; token profiles are assumptions from plan §5):`);
  for (const l of est.lines) console.log(`  ${DATASET_LABEL[l.dataset].padEnd(20)} test ${String(l.items).padStart(4)} + dev ${String(l.devItems).padStart(3)}  ${fmtUsd(l.usd).padStart(10)}  (grading ${fmtUsd(l.grading)})`);
  console.log(`  ${"TOTAL".padEnd(20)} ${" ".repeat(19)}${fmtUsd(est.total).padStart(10)}   with ${Math.round((CONTINGENCY - 1) * 100)}% contingency ${fmtUsd(est.withContingency)}`);
  console.log(`  Plan reference: ${baseTier.note}`);
  if (!live) console.log("  (Mock mode: this is what a live run would cost; nothing will be charged.)");

  const runId = `${tier.id}-${live ? "live" : "mock"}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const outDir = resolve(o.out ?? join(BENCH_DIR, "out", runId));
  const manifestOut = {
    tier: tier.id, seed, createdAt: new Date().toISOString(),
    datasets: Object.fromEntries(dsList.map((ds) => [ds, { test: splits[ds].test.map((i) => i.id), dev: needDev ? splits[ds].dev.map((i) => i.id) : [] }])),
  };
  if (o["estimate-only"]) return 0;
  if (o["plan-only"]) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifestOut, null, 2));
    console.log(`\nManifest (item IDs only) written to ${join(outDir, "manifest.json")}`);
    return 0;
  }

  // ── provider ──
  let guard: SpendGuard | null = null;
  let provider: BenchProvider;
  if (live) {
    if (cap! < est.total) return fail(`--max-usd ${fmtUsd(cap!)} is below the estimate ${fmtUsd(est.total)}. Raise the cap or run a smaller tier. Nothing was run.`);
    if (cap! < est.withContingency) console.log(`\n⚠ Cap ${fmtUsd(cap!)} is below estimate + contingency (${fmtUsd(est.withContingency)}); the run may stop early at the cap.`);
    guard = new SpendGuard(cap!, at);
    if (!o.yes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ans = await rl.question(`\nThis will call paid APIs through OpenRouter, up to a hard cap of ${fmtUsd(cap!)}. Type "yes" to continue: `);
      rl.close();
      if (ans.trim().toLowerCase() !== "yes") return fail("Not confirmed. Nothing was run.");
    }
    provider = new OpenRouterBenchProvider(key, guard, at);
  } else {
    const fake = new FakeProvider(at);
    if (cap != null) {
      guard = new SpendGuard(cap, at);
      provider = new GuardedFake(fake, guard);
    } else provider = fake;
  }

  if (o["max-tokens"] != null) {
    const mt = Number(o["max-tokens"]);
    if (!(Number.isInteger(mt) && mt > 0)) return fail("--max-tokens must be a positive integer");
    provider = new ClampedProvider(provider, mt);
  }

  const abstainBelow = o["abstain-below"] != null ? Number(o["abstain-below"]) : KEPLAR_ABSTAIN_BELOW;
  const ctx = new Ctx(provider, abstainBelow);
  const startedAt = new Date().toISOString();
  let aborted: string | null = null;
  const stop = () => aborted != null;
  const onErr = (e: unknown) => {
    if (e instanceof CapExceededError) aborted ??= e.message;
    else aborted ??= `Unexpected error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`;
  };
  const conc = Math.max(1, Number(o.concurrency) || 4);

  // ── dev split: single models once, pick the best per dataset (plan §2 arm 8) ──
  const bestSingle: ReportInput["bestSingle"] = {};
  const bestArm: Partial<Record<DatasetId, string>> = {};
  if (needDev) {
    console.log("\nDev split: choosing the best single model per dataset…");
    for (const ds of dsList) {
      const acc: Record<string, number[]> = {};
      await pool(splits[ds].dev, conc, async (item) => {
        try {
          for (const arm of SINGLE_ARMS) {
            const r = await runArm(ctx, arm, item, 1);
            r.grade = await gradeResult(ctx, item, r);
            (acc[arm.id] ??= []).push(r.grade.verdict === "correct" ? 1 : 0);
          }
        } catch (e) {
          onErr(e);
        }
      }, stop);
      const devAccuracy = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
      // Pre-registered rule: highest dev accuracy; ties → higher official HLE-Diamond score, then setup order.
      const ranked = SINGLE_ARMS.map((a, i) => ({ id: a.id, acc: devAccuracy[a.id] ?? -1, off: OFFICIAL_HLE_DIAMOND[a.model!] ?? 0, i })).sort((a, b) => b.acc - a.acc || b.off - a.off || a.i - b.i);
      bestArm[ds] = ranked[0].id;
      bestSingle[ds] = { arm: ranked[0].id, devAccuracy, devOverlapsTest: splits[ds].devOverlapsTest };
      console.log(`  ${DATASET_LABEL[ds]}: ${ranked[0].id}`);
      if (stop()) break;
    }
  }

  // ── test split: item-major so an aborted run leaves complete items ──
  const results: ArmResult[] = [];
  const runnable = arms.filter((a) => a.kind !== "best-single");
  const work = dsList.flatMap((ds) => splits[ds].test.map((item) => ({ ds, item })));
  let done = 0;
  if (!stop()) {
    console.log(`\nRunning ${work.length} items × ${runnable.length} setups…`);
    await pool(work, conc, async ({ ds, item }) => {
      try {
        const mine: ArmResult[] = [];
        for (const arm of runnable) {
          if (arm.datasets && !arm.datasets.includes(ds)) continue;
          for (let run = 1; run <= runsFor(arm); run++) {
            const r = await runArm(ctx, arm, item, run);
            r.grade = await gradeResult(ctx, item, r);
            mine.push(r);
          }
        }
        results.push(...mine);
        done++;
        if (done % 25 === 0 || done === work.length) console.log(`  ${done}/${work.length} items${guard ? ` · counted $${guard.spent.toFixed(2)}` : ""}`);
      } catch (e) {
        onErr(e);
      }
    }, stop);
  }
  if (aborted) console.log(`\n⚠ ${aborted}`);

  // best-single = the chosen model's results, relabelled
  if (arms.some((a) => a.kind === "best-single")) {
    for (const ds of dsList) {
      const chosen = bestArm[ds];
      if (!chosen) continue;
      for (const r of results.filter((x) => x.dataset === ds && x.arm === chosen)) results.push({ ...r, arm: "best-single" });
    }
  }

  // ── metrics ──
  const itemsById = new Map(dsList.flatMap((ds) => splits[ds].test.map((i) => [`${ds}|${i.id}`, i] as const)));
  const panelAgreement = (mixId: string) => new Map(results.filter((r) => r.arm === `majority-${mixId}` || r.arm === `keplar-${mixId}`).map((r) => [`${r.itemId}|${r.run}`, { panel: mixId, disagreed: r.agreement!.disagreed }]));
  const premiumPA = panelAgreement("premium");
  const economyPA = panelAgreement("economy");
  const summaries: ArmSummary[] = [];
  for (const ds of dsList) {
    for (const arm of arms) {
      const rs = results.filter((r) => r.dataset === ds && r.arm === arm.id);
      if (!rs.length) continue;
      const pa = arm.mix === "economy" ? economyPA : premiumPA.size ? premiumPA : economyPA;
      const label = arm.kind === "best-single" && bestArm[ds] ? `${arm.label} → ${bestArm[ds]}` : arm.label;
      summaries.push(summarize(arm, label, ds, rs, new Map([...pa].filter(([k]) => itemsById.has(`${ds}|${k.split("|")[0]}`)))));
    }
  }
  const armIds = new Set(arms.map((a) => a.id));
  const exploratory: [string, string][] = [];
  for (const a of arms.filter((x) => x.kind === "keplar" || x.kind === "majority")) for (const b of ["best-single", "gpt-6-astra", "claude-opus-5-5"]) if (armIds.has(b)) exploratory.push([a.id, b]);
  if (armIds.has("keplar-economy-exa") && armIds.has("keplar-economy")) exploratory.push(["keplar-economy-exa", "keplar-economy"]);
  const cmps = comparisons(dsList, results, bestArm, exploratory);

  // measured token profile
  const tp = new Map<string, { dataset: DatasetId; role: string; calls: number; inSum: number; outSum: number }>();
  for (const c of ctx.calls) {
    const ds = c.key.split("|")[2] as DatasetId;
    const k = `${ds}|${c.role}`;
    const e = tp.get(k) ?? { dataset: ds, role: c.role, calls: 0, inSum: 0, outSum: 0 };
    e.calls++;
    e.inSum += c.inputTokens;
    e.outSum += c.outputTokens;
    tp.set(k, e);
  }
  const tokenProfile = [...tp.values()].map((e) => ({ dataset: e.dataset, role: e.role, calls: e.calls, avgIn: e.inSum / e.calls, avgOut: e.outSum / e.calls }));
  const counted = guard ? guard.spent : ctx.calls.reduce((a, c) => a + c.costUsd, 0);

  const notes = [
    "Single-model setups have no native confidence; their calibration rows use verbalized confidence from the shared answer prompt and are secondary (plan §3). Majority-vote confidence is the vote share.",
    "Keplar confidence is the deterministic rule in bench/lib/pipeline.ts (panel share of the final answer, judge and verifier scores, web-check outcome). Keplar abstains on exact-answer items below the abstention threshold " + abstainBelow + ".",
    "Panel answers are reused as the single-model answers (identical prompt); the +Exa setups share panel, verifier and judge calls with their no-search twins, so the search effect is measured on identical panels.",
    "Graders see only question, gold answer and final answer (no arm or model names). Judges: GLM-5.3 + Mistral Medium 3.5, Qwen3.8-Max tie-break.",
    "HLE-Diamond and GPQA are no-reveal: results.json carries item IDs and hashes only; raw outputs stay in raw-outputs.jsonl (never publish).",
    "SimpleQA Verified grading uses the original SimpleQA grader template in bench/prompts/simpleqa_grader.txt. Swap in the SimpleQA Verified autorater prompt (Kaggle starter notebook) before a publishable run.",
  ];

  const finishedAt = new Date().toISOString();
  const report: ReportInput = {
    runId, tier: tier.id, internal: tier.internal, live, provider: provider.name, startedAt, finishedAt, seed, aborted,
    estimate: { total: est.total, withContingency: est.withContingency, lines: est.lines },
    spend: { counted, calls: ctx.calls.length, cap },
    datasets: dsInfo, bestSingle, summaries, comparisons: cmps, tokenProfile, notes,
  };

  // ── outputs ──
  mkdirSync(outDir, { recursive: true });
  const redact = (r: ArmResult) => {
    const item = itemsById.get(`${r.dataset}|${r.itemId}`);
    if (!item?.noReveal) return r;
    return { ...r, text: `[redacted sha256:${sha(r.text)}]`, answer: r.answer == null ? null : `[redacted sha256:${sha(r.answer)}]`, stages: r.stages ? { ...r.stages, positions: "[redacted]", judge: "[redacted]" } : undefined };
  };
  const resultsJson = {
    classification: tier.internal ? "INTERNAL — NOT FOR PUBLICATION" : "pre-publication (review before release)",
    mode: live ? "live" : "mock (synthetic outputs; no API called)",
    ...report,
    manifest: manifestOut,
    itemHashes: Object.fromEntries([...itemsById].map(([k, i]) => [k, sha(`${i.question}\u241f${i.answer}`)])),
    results: results.map(redact),
  };
  writeFileSync(join(outDir, "results.json"), JSON.stringify(resultsJson, null, 2));
  writeFileSync(join(outDir, "report.md"), renderReport(report));
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifestOut, null, 2));
  writeFileSync(join(outDir, "raw-outputs.jsonl"), results.map((r) => JSON.stringify({ _: "DO NOT PUBLISH", ...r })).join("\n") + "\n");
  writeFileSync(join(outDir, "calls.jsonl"), ctx.calls.map((c) => JSON.stringify(c)).join("\n") + "\n");

  console.log(`\n${live ? "Counted spend" : "Simulated spend (not charged)"}: ${fmtUsd(counted)} over ${ctx.calls.length} unique calls.`);
  console.log(`Results: ${join(outDir, "results.json")}\nReport:  ${join(outDir, "report.md")}`);
  if (tier.internal) console.log("Report is marked INTERNAL — NOT FOR PUBLICATION.");
  return aborted ? 3 : 0;
}

function fail(msg: string): number {
  console.error(`\n✖ ${msg}`);
  return 2;
}

if (require.main === module) {
  main().then((code) => process.exit(code), (e) => {
    console.error(e);
    process.exit(1);
  });
}

