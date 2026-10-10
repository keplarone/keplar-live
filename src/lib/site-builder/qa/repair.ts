/**
 * Repair from testing: the browser (and optionally the visual critique) found problems; one model pass fixes exactly those,
 * the result goes back through the same assemble / sanitize / lint path as any build, and is saved as a new version
 * (so it shows in History and can be undone). Charged like an edit; never runs without a free job slot.
 */
import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import { breakerLevel } from "@/lib/create/platform/breaker";
import { acquireJobSlot } from "@/lib/create/platform/jobs";
import { id as newId, now } from "@/lib/create/platform/ids";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import type { Workspace } from "@/lib/create/platform/workspace";
import { meteredUsd } from "@/lib/orchestration/limits";
import { assembleFiles, ensureErrorPage } from "../finalize";
import { GenError, generateSite } from "../generate";
import { fixSite, lintSite } from "../lint";
import { BUILDER_LIMITS, estimateJob } from "../limits";
import { addVersion, headFiles, normalizeFiles } from "../store";
import type { LintSummary, Site, SiteDesign } from "../types";

export type RepairOutcome = { version: number; units: number; summary: string } | null;

export async function repairFromFindings(ws: Workspace, site: Site, findings: string, opts: { budgetMs: number; onStatus?: (t: string) => void }): Promise<RepairOutcome> {
  const L = BUILDER_LIMITS[ws.plan];
  if (!findings.trim() || opts.budgetMs < 45_000) return null;
  try {
    await rateLimit(`sb:qarepair:${ws.id}`, Math.max(2, Math.min(L.jobsPerDay, 6)), 86_400, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return null;
    throw e;
  }
  const breaker = await breakerLevel();
  const current = await headFiles(site);
  const siteChars = Object.values(current).reduce((a, c) => a + c.length, 0);
  const est = estimateJob({ plan: ws.plan, breaker, promptChars: findings.length, siteChars, hasSite: true });
  await assertCanSpend(ws, est.high);
  const release = await acquireJobSlot(ws.id, "site", L.concurrent);
  let usd = 0;
  try {
    const design: SiteDesign = site.design ?? { direction: site.brief?.direction ?? "editorial", accent: null, mode: "auto" };
    const bad = new Set([...findings.matchAll(/^- \[[^\]]+\] ([a-z0-9_-]+\.(?:html|css))/gim)].map((m) => m[1]));
    const subset: Record<string, string> = {};
    for (const f of Object.keys(current)) if (f.endsWith(".css") || bad.has(f) || f === "index.html") subset[f] = current[f];
    opts.onStatus?.("Asking for the fixes");
    const gen = generateSite({ plan: ws.plan, breaker, prompt: findings, current: subset, history: [], limits: L, brief: site.brief ?? null, motion: Boolean(site.fx?.enabled), repair: true }, { budgetMs: opts.budgetMs - 10_000 });
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    const out = r.value;
    usd = out.usd;
    if (!Object.keys(out.files).length) return null;
    const merged: Record<string, string> = { ...current };
    for (const d of out.deleted) delete merged[d.toLowerCase()];
    Object.assign(merged, out.files);
    opts.onStatus?.("Checking the fixed version");
    let assembled = assembleFiles(merged, design, { description: site.brief?.purpose?.slice(0, 150) });
    if (site.brief?.recipe) assembled = ensureErrorPage(assembled, site.brief.recipe.voice, site.brief.recipe.error);
    const norm0 = normalizeFiles(assembled, ws.plan);
    const ctx = { brief: site.brief ?? null, legacy: false, recipe: site.brief?.recipe ?? null };
    const fx = fixSite(norm0.files, { ...ctx, final: true });
    const norm = fx.fixed.length ? normalizeFiles(fx.files, ws.plan) : norm0;
    const report = lintSite(norm.files, ctx);
    const lint: LintSummary = { errors: report.errors, warnings: report.warnings, fixed: [...new Set(fx.fixed)], repaired: true, placeholders: report.placeholders, remaining: report.findings.slice(0, 12).map((f) => ({ code: f.code, message: f.message.slice(0, 200), file: f.file, severity: f.severity })) };
    const units = await charge(ws, "site.edit", { usd: meteredUsd(usd), ref: site.id });
    const summary = `Fixed problems found while testing the site. ${out.summary || ""}`.trim().slice(0, 400);
    const { version } = await addVersion(ws, site, norm.files, { kind: "ai", summary, prompt: findings.slice(0, 1800), model: out.model.id, units, lint }, (n) => [
      { id: newId("msg"), role: "assistant", text: summary, at: now(), units, version: n },
    ]);
    return { version: version.n, units, summary };
  } catch (e) {
    const billed = e instanceof GenError ? Math.max(usd, e.usd) : usd;
    if (billed > 0) await charge(ws, "site.edit", { usd: meteredUsd(billed), ref: site.id }).catch(() => 0);
    return null;
  } finally {
    await release();
  }
}

