/**
 * One AI job on a site: validate, estimate, check every limit, run the model, save a version, charge the real cost.
 * `prepareJob` does everything that can refuse (so the route can answer with a proper HTTP status);
 * `runJob` then streams progress events and always releases the concurrency slot.
 */
import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import { breakerLevel, type BreakerLevel } from "@/lib/create/platform/breaker";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { acquireJobSlot } from "@/lib/create/platform/jobs";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import type { Workspace } from "@/lib/create/platform/workspace";
import { meteredUsd } from "@/lib/orchestration/limits";
import { buildBrief, briefToPrompt, normalizeBrief, type SiteBrief } from "./brief";
import { assembleFiles, ensureErrorPage } from "./finalize";
import { optName, makeRecipe, newSeed } from "./variation";
import { closest, fingerprintOf, recentRecipeTokens, samenessFinding } from "./sameness";
import { loadLibrary, rememberFingerprint } from "./fingerprints";
import { attachToSite } from "./product/assets";
import { ensureProduct } from "./product/ensure";
import { productFacts } from "./product/types";
import { GenError, generateSite, type GenEvent } from "./generate";
import { findingsForPrompt, fixSite, lintSite, type LintReport } from "./lint";
import { BUILDER_LIMITS, confirmUnits, estimateJob, type Estimate } from "./limits";
import { checkPrompt } from "./safety";
import { addVersion, FilesError, getVersion, headFiles, normalizeFiles, saveBrief } from "./store";
import { TEMPLATES } from "./templates";
import type { ChatMsg, LintSummary, Site, SiteDesign } from "./types";

export type Prepared = { prompt: string; estimate: Estimate; breaker: BreakerLevel; current: Record<string, string> | null; brief: SiteBrief | null; release: () => Promise<void> };

export const builderConfigured = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());

export async function estimateFor(ws: Workspace, site: Site | null, promptChars: number, breaker?: BreakerLevel): Promise<Estimate> {
  const files = site ? await headFiles(site) : {};
  const siteChars = Object.values(files).reduce((a, c) => a + c.length, 0);
  return estimateJob({ plan: ws.plan, breaker: breaker ?? (await breakerLevel()), promptChars, siteChars, hasSite: siteChars > 0 });
}

export async function prepareJob(ws: Workspace, site: Site, input: { prompt?: string; confirm?: boolean; brief?: unknown }): Promise<Prepared> {
  const L = BUILDER_LIMITS[ws.plan];
  const fromBrief = input.brief && typeof input.brief === "object" && !site.headVersion ? normalizeBrief(input.brief, site.brief) : null;
  const prompt = (input.prompt ?? "").trim() || (fromBrief ? `Build ${fromBrief.name} from the approved brief.` : "");
  if (prompt.length < 3) throw new HttpError(400, "Describe what you want to build or change.");
  if (prompt.length > L.promptChars) {
    throw new HttpError(413, `That's too long for your plan (up to ${L.promptChars.toLocaleString("en-US")} characters).${ws.plan === "free" ? " Plus allows longer requests." : ""}`, "too_large");
  }
  if (!builderConfigured()) throw new HttpError(503, "The site builder isn't connected to its models yet.", "not_configured");
  if (site.takenDown) throw new HttpError(451, "This site was taken down for breaking the terms.", "taken_down");

  const problem = await checkPrompt(fromBrief ? `${prompt}\n${briefToPrompt(fromBrief, L.pages)}` : prompt);
  if (problem) throw new HttpError(422, problem, "refused");

  try {
    await rateLimit(`sb:min:${ws.id}`, L.jobsPerMin, 60, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new HttpError(429, "You're sending requests quickly. Wait a few seconds and try again.", "rate_limited");
    throw e;
  }
  try {
    await rateLimit(`sb:day:${ws.id}`, L.jobsPerDay, 86_400, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) {
      throw new HttpError(429, `You've reached today's limit of ${L.jobsPerDay} AI builds and edits for your plan. It resets within 24 hours.${ws.plan === "free" ? " Plus raises this." : ""}`, "daily_limit");
    }
    throw e;
  }

  const breaker = await breakerLevel();
  const current = site.headVersion ? await headFiles(site) : null;
  const estimate = await estimateFor(ws, site, prompt.length + (fromBrief ? briefToPrompt(fromBrief, L.pages).length : 0), breaker);
  if (!ws.admin && ws.plan !== "free" && L.maxJobUsd > 0 && estimate.units * 0.002 > L.maxJobUsd) {
    throw new HttpError(413, "That request is too large for your plan. Split it into smaller changes.", "too_large");
  }
  await assertCanSpend(ws, estimate.high); // cooldown, global pause, 5-hour + weekly windows, monthly credits
  if (estimate.units > confirmUnits() && !input.confirm) {
    throw new HttpError(409, `This will use about ${estimate.units.toLocaleString("en-US")} credits. Confirm to continue.`, "confirm", { estimate });
  }
  if (fromBrief?.product) await verifyProduct(ws, site, fromBrief);
  const release = await acquireJobSlot(ws.id, "site", L.concurrent);
  return { prompt, estimate, breaker, current, brief: fromBrief, release };
}

/**
 * The product on a brief came from the client, so check it before it reaches the model: images must be this workspace's own
 * stored images (no hotlinks, no one else's), the owner must have confirmed they hold the rights, and the plan's per-site cap
 * applies. What is kept is attached to the site and made readable at its public address.
 */
export async function verifyProduct(ws: Workspace, site: Site, brief: SiteBrief): Promise<void> {
  const p = brief.product;
  if (!p) return;
  if (!p.rightsConfirmed || !p.images.length) {
    p.images = [];
    return;
  }
  const kept = new Set(await attachToSite(ws, site.id, p.images.map((i) => i.id)));
  p.images = p.images.filter((i) => kept.has(i.id));
  if (p.images.length && !p.images.some((i) => i.role === "hero")) p.images[0].role = "hero";
}

export type JobEvent = GenEvent | { type: "saving" } | { type: "done"; version: number; units: number; summary: string; removed: string[]; lint?: LintSummary } | { type: "error"; error: string; code: string };

const summarize = (r: LintReport, fixed: string[], repaired: boolean): LintSummary => ({
  errors: r.errors,
  warnings: r.warnings,
  fixed,
  repaired,
  placeholders: r.placeholders,
  remaining: r.findings.slice(0, 12).map((f) => ({ code: f.code, message: f.message.slice(0, 200), file: f.file, severity: f.severity })),
});

export async function* runJob(ws: Workspace, site: Site, prep: Prepared): AsyncGenerator<JobEvent> {
  const L = BUILDER_LIMITS[ws.plan];
  const t = now();
  const started = Date.now();
  let usd = 0;
  let model: string | null = null;
  const ref = site.id;
  const kind = prep.current ? "site.edit" : "site.build";
  // Sites built before the design system keep their own style; everything new (and every site with a stored design) uses it.
  const legacy = Boolean(prep.current) && !site.design;
  try {
    // Recent builds (content-free fingerprints): used to steer a new recipe away from them and to catch near-copies afterwards.
    const library = legacy || prep.current ? [] : await loadLibrary();
    let brief: SiteBrief | null = legacy ? null : prep.brief ?? site.brief ?? (prep.current ? null : buildBrief(prep.prompt));
    if (brief && !prep.current && !brief.recipe) {
      brief = { ...brief, recipe: makeRecipe({ seed: site.id || newSeed(), kind: brief.kind, direction: brief.direction, tone: brief.tone, avoid: recentRecipeTokens(library) }) };
    }
    if (brief) yield { type: "status", text: prep.current ? "Reading the site and your request" : "Reading the approved brief" };
    if (brief?.recipe && !prep.current) yield { type: "status", text: `Structure: ${optName("layout", brief.recipe.layout)} layout, ${optName("nav", brief.recipe.nav).toLowerCase()} navigation, ${optName("voice", brief.recipe.voice).toLowerCase()} voice` };
    const design: SiteDesign = site.design ?? (brief ? { direction: brief.direction, accent: brief.accent, mode: brief.mode, ...(brief.recipe ? { fontDisplay: brief.recipe.fontDisplay } : {}) } : { direction: "editorial", accent: null, mode: "auto" });
    const motion = site.fx ? site.fx.enabled : brief ? brief.motion !== "none" : true;
    const history = prep.brief ? [] : site.messages.filter((m) => m.role !== "system").slice(-6).map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));
    const tplHint = site.template ? TEMPLATES.find((x) => x.id === site.template)?.description : undefined;
    const gen = generateSite({ plan: ws.plan, breaker: prep.breaker, prompt: prep.prompt, current: prep.current, history, limits: L, hint: tplHint, brief, motion, legacy }, { budgetMs: 215_000 });
    let r = await gen.next();
    while (!r.done) {
      yield r.value;
      r = await gen.next();
    }
    const out = r.value;
    usd = out.usd;
    model = out.model.id;
    if (!Object.keys(out.files).length) throw new GenError("The model didn't change any files. Try describing the change differently.", "no_change", usd);

    const merge = (base: Record<string, string>, o: { files: Record<string, string>; deleted: string[] }) => {
      const m: Record<string, string> = { ...base };
      for (const d of o.deleted) delete m[d.toLowerCase()];
      Object.assign(m, o.files);
      return m;
    };
    const description = brief?.purpose?.slice(0, 150);
    const lintBrief = brief && brief.product ? { ...brief, content: [brief.content, productFacts(brief.product)].filter(Boolean).join("\n") } : brief;
    const recipe = brief?.recipe ?? null;
    const lintCtx = { brief: lintBrief, legacy, recipe };
    const finish = (files: Record<string, string>, final: boolean) => {
      let assembled = legacy ? files : assembleFiles(files, design, { description });
      if (!legacy && recipe && final) assembled = ensureErrorPage(assembled, recipe.voice, recipe.error);
      if (!legacy && !prep.current && brief?.product) assembled = ensureProduct(assembled, brief.product).files;
      const norm0 = normalizeFiles(assembled, ws.plan);
      const fx = fixSite(norm0.files, { ...lintCtx, description, final });
      const norm = fx.fixed.length ? normalizeFiles(fx.files, ws.plan) : norm0;
      return { norm, fixed: fx.fixed, report: lintSite(norm.files, lintCtx) };
    };

    yield { type: "status", text: "Checking the design" };
    let merged = merge(prep.current ?? {}, out);
    let res = finish(merged, false);
    const fixedAll = [...res.fixed];
    // Sameness against recent builds: a near-copy is an error the repair pass is told to fix.
    const prints = () => fingerprintOf(res.norm.files, { direction: design.direction, accent: design.accent, recipe });
    let simScore = 0;
    if (!legacy && !prep.current && library.length) {
      yield { type: "status", text: "Comparing the structure with recent sites" };
      simScore = closest(prints(), library).score;
      const sf = samenessFinding(simScore);
      if (sf) {
        res.report.findings.push(sf);
        res.report.errors++;
      }
    }
    let repaired = false;
    const left = 280_000 - (Date.now() - started);
    if (!legacy && res.report.errors > 0 && left > 55_000) {
      yield { type: "status", text: `Fixing ${res.report.errors} design issue${res.report.errors === 1 ? "" : "s"}` };
      const bad = new Set(res.report.findings.filter((f) => f.severity === "error").map((f) => f.file));
      const subset: Record<string, string> = {};
      for (const f of Object.keys(res.norm.files)) if (bad.has(f) || f.endsWith(".css")) subset[f] = res.norm.files[f];
      try {
        const rep = generateSite({ plan: ws.plan, breaker: prep.breaker, prompt: findingsForPrompt(res.report), current: subset, history: [], limits: L, brief, motion, repair: true, legacy }, { budgetMs: left - 10_000 });
        let rr = await rep.next();
        while (!rr.done) rr = await rep.next();
        usd += rr.value.usd;
        const repFiles = rr.value.files;
        if (Object.keys(repFiles).length) {
          merged = merge(res.norm.files, { files: repFiles, deleted: rr.value.deleted });
          res = finish(merged, true);
          fixedAll.push(...res.fixed);
          repaired = true;
        }
      } catch (e) {
        if (e instanceof GenError) usd += e.usd;
        // The repair pass is best effort: keep the first result and say what is left.
      }
    }
    if (!legacy && !prep.current && library.length) {
      simScore = closest(prints(), library).score;
      const stillSame = res.report.findings.findIndex((f) => f.code === "too-similar");
      if (stillSame >= 0 && !samenessFinding(simScore)) {
        res.report.findings.splice(stillSame, 1);
        res.report.errors = Math.max(0, res.report.errors - 1);
      } else if (stillSame >= 0) {
        res.report.findings[stillSame] = { ...res.report.findings[stillSame], severity: "warn" };
        res.report.errors = Math.max(0, res.report.errors - 1);
        res.report.warnings++;
      }
    }
    if (!legacy && res.report.errors > 0) {
      // Last resort, no model: remove what cannot be verified.
      const last = finish(res.norm.files, true);
      fixedAll.push(...last.fixed);
      res = last;
    }
    yield { type: "saving" };
    const lint = summarize(res.report, [...new Set(fixedAll)], repaired);
    const units = await charge(ws, kind, { usd: meteredUsd(usd), ref });
    const baseSummary = out.summary || "Updated the site.";
    const extra = !legacy ? ` Quality check: ${lint.errors ? `${lint.errors} issue${lint.errors === 1 ? "" : "s"} left to review` : "no blocking issues"}${lint.fixed.length ? `, ${lint.fixed.length} fixed automatically` : ""}${repaired ? " (one repair pass)" : ""}${lint.placeholders ? `; ${lint.placeholders} placeholder${lint.placeholders === 1 ? "" : "s"} to fill in` : ""}.` : "";
    const summary = baseSummary + extra;
    const chat = (n: number): ChatMsg[] => [
      { id: newId("msg"), role: "user", text: prep.prompt.slice(0, 2000), at: t },
      { id: newId("msg"), role: "assistant", text: out.truncated ? `${summary} (The reply was cut off, so the last page was left out. Ask for it again.)` : summary, at: now(), units, version: n },
    ];
    if (!legacy && !prep.current) {
      // New build: remember the brief, style and effects on the site so edits stay coherent.
      const b = brief!;
      await saveBrief(ws, site, { ...b, direction: design.direction, accent: design.accent, mode: design.mode }).catch(() => undefined);
    }
    if (!legacy && !prep.current) void rememberFingerprint({ kind: brief?.kind ?? "other", direction: design.direction, tokens: prints() });
    const { version } = await addVersion(ws, site, res.norm.files, { kind: "ai", summary, prompt: prep.prompt, model, units, lint }, chat);
    yield { type: "done", version: version.n, units, summary, removed: res.norm.removed, lint };
  } catch (e) {
    // The provider may have billed for a run that failed afterwards: charge what it cost, never more.
    const billed = e instanceof GenError ? Math.max(usd, e.usd) : usd;
    if (billed > 0) await charge(ws, kind, { usd: meteredUsd(billed), ref }).catch(() => 0);
    const code = e instanceof GenError || e instanceof FilesError ? (e instanceof GenError ? e.code : "invalid_files") : "internal";
    const msg = e instanceof GenError || e instanceof FilesError ? e.message : "Something went wrong while building. Nothing was changed.";
    if (code === "internal") console.error("[site-builder] job failed", e);
    yield { type: "error", error: msg, code };
  } finally {
    await prep.release();
  }
}

export { getVersion };
