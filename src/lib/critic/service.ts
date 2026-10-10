/**
 * Runs a full critique of a creation (rules → axe-core in a real browser → model pass), stores the report per version, and
 * applies chosen fixes as a new version. Streamed as events so the UI shows each pass as it happens.
 */
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import type { PlanId } from "@/lib/create/platform/plans";
import { assertCanSpend, chargeUnits, toUnits } from "@/lib/create/platform/compute";
import { workspaceById } from "@/lib/create/platform/workspace";
import { addVersion, getVersion } from "@/lib/site-builder/store";
import { pageFromPath, previewToken, renderCss, renderPage } from "@/lib/site-builder/render";
import type { Site, SiteVersion } from "@/lib/site-builder/types";
import { normalizeFor } from "@/lib/collab/session";
import { aiCritique } from "./ai";
import { axeToFindings, runAxe, type Serve } from "./axe";
import { buildReport, runRules, RULE_COUNT } from "./engine";
import { applyFindings } from "./patch";
import type { CriticReport, Finding } from "./types";

export const reports = () => collection<CriticReport>("critic_reports");
export const reportId = (siteId: string, version: number | "live") => `${siteId}_${version === "live" ? "live" : `v${version}`}`;

export type CriticEvent =
  | { t: "stage"; stage: "static" | "axe" | "ai"; state: "run" | "done" | "skip" | "fail"; text: string; ms?: number; count?: number }
  | { t: "findings"; source: "static" | "axe" | "ai"; findings: Finding[] }
  | { t: "report"; report: CriticReport };

const optsFor = (site: Site) => ({ name: site.app?.spec?.name ?? site.brief?.name ?? site.name, description: site.app?.spec?.summary ?? site.seo?.description ?? site.brief?.purpose ?? "", kind: (site.kind ?? "site") as "app" | "site" });

/** Serves one version in-process for the browser pass (apps through the app runtime, sites through the page renderer). */
async function serverFor(site: Site, v: SiteVersion, plan: PlanId): Promise<{ serve: Serve; entry: string }> {
  if (site.kind === "app" && site.app) {
    const { serveApp } = await import("@/lib/app-runtime/serve");
    const { AXE_HOST } = await import("./axe");
    const base = "/a";
    return { entry: `${base}/`, serve: (req, path) => serveApp(req, { site, version: v, env: "draft", parts: path.slice(base.length + 1).split("/").filter(Boolean), base, origin: AXE_HOST, plan, reportHref: null }) };
  }
  const token = previewToken(site.id, 20 * 60_000);
  const base = `/sites/draft/${site.id}/${v.n}`;
  const ctx = { site, mode: "preview" as const, version: v.n, token, thumb: false, plan };
  return {
    entry: `${base}?t=${token}`,
    serve: async (_req, path) => {
      const parts = path.startsWith(base) ? path.slice(base.length).split("/").filter(Boolean) : [];
      const file = pageFromPath(parts, v.files);
      if (!file) return new Response("Not found", { status: 404 });
      if (file.endsWith(".css")) return new Response(renderCss(v.files, file, ctx), { headers: { "content-type": "text/css; charset=utf-8" } });
      return new Response(renderPage(v.files, file, ctx), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
  };
}

export async function* critique(site: Site, o: { version: number; files?: Record<string, string>; live?: boolean; ai?: boolean; axe?: boolean; plan: PlanId; deadline: number; fetchImpl?: typeof fetch }): AsyncGenerator<CriticEvent, CriticReport> {
  const v = o.files ? ({ id: "live", workspaceId: site.workspaceId, siteId: site.id, n: o.version, files: o.files, summary: "", prompt: "", kind: "edit", model: null, units: 0, bytes: 0, createdAt: now() } as SiteVersion) : await getVersion(site, o.version);
  if (!v) throw new HttpError(404, "That version isn't available any more.", "not_found");
  const files = v.files;
  const passes: CriticReport["passes"] = { static: { rules: RULE_COUNT, ms: 0 } };

  yield { t: "stage", stage: "static", state: "run", text: `Running ${RULE_COUNT} rules over ${Object.keys(files).length} files` };
  let t = Date.now();
  const stat = runRules(files, optsFor(site));
  passes.static.ms = Date.now() - t;
  yield { t: "findings", source: "static", findings: stat };
  yield { t: "stage", stage: "static", state: "done", text: `${stat.length} finding${stat.length === 1 ? "" : "s"} from static checks`, ms: passes.static.ms, count: stat.length };

  let axeFindings: Finding[] = [];
  let shot: Buffer | null = null;
  if (o.axe !== false) {
    yield { t: "stage", stage: "axe", state: "run", text: "Rendering in Chromium and running axe-core (WCAG 2.2 AA)" };
    const { serve, entry } = await serverFor(site, v, o.plan);
    const r = await runAxe(serve, entry, Math.max(10_000, o.deadline - Date.now() - 50_000));
    shot = r.screenshot;
    if (r.ok) {
      axeFindings = axeToFindings(r.violations, files, stat);
      passes.axe = { ok: true, violations: r.violations.length, ms: r.ms };
      yield { t: "findings", source: "axe", findings: axeFindings };
      yield { t: "stage", stage: "axe", state: "done", text: `${r.violations.length} rule violation${r.violations.length === 1 ? "" : "s"} on the rendered page, ${axeFindings.length} new`, ms: r.ms, count: axeFindings.length };
    } else {
      passes.axe = { ok: false, violations: 0, ms: r.ms, note: r.note };
      yield { t: "stage", stage: "axe", state: "fail", text: `Browser check unavailable: ${r.note}`, ms: r.ms };
    }
  }

  let aiFindings: Finding[] = [];
  if (o.ai !== false) {
    yield { t: "stage", stage: "ai", state: "run", text: o.plan === "free" ? "Design & UX review (free models)" : "Design & UX review" };
    t = Date.now();
    const owner = await workspaceById(site.workspaceId).catch(() => null);
    let blocked = "";
    if (!process.env.OPENROUTER_API_KEY?.trim()) blocked = "The model pass isn't configured on this server (OPENROUTER_API_KEY).";
    else if (owner && o.plan !== "free") await assertCanSpend(owner, 5).catch((e: Error) => { blocked = e.message; });
    if (blocked) {
      passes.ai = { ok: false, kept: 0, dropped: 0, ms: 0, note: blocked };
      yield { t: "stage", stage: "ai", state: "skip", text: blocked };
    } else {
      try {
        const r = await aiCritique({ files, known: [...stat, ...axeFindings], plan: o.plan, brief: optsFor(site).description, screenshot: shot, deadline: o.deadline, fetchImpl: o.fetchImpl });
        aiFindings = r.findings;
        passes.ai = { ok: true, model: r.model, kept: r.kept, dropped: r.dropped, ms: Date.now() - t };
        if (owner && r.usd > 0) await chargeUnits(owner, "critic.ai", toUnits(r.usd), r.usd, site.id).catch(() => undefined);
        yield { t: "findings", source: "ai", findings: aiFindings };
        yield { t: "stage", stage: "ai", state: "done", text: `${r.kept} located suggestion${r.kept === 1 ? "" : "s"} from ${r.model}${r.dropped ? ` (${r.dropped} vague or unlocatable dropped)` : ""}`, ms: Date.now() - t, count: r.kept };
      } catch (e) {
        passes.ai = { ok: false, kept: 0, dropped: 0, ms: Date.now() - t, note: (e as Error).message.slice(0, 160) };
        yield { t: "stage", stage: "ai", state: "fail", text: `Model pass failed: ${(e as Error).message.slice(0, 120)}`, ms: Date.now() - t };
      }
    }
  }

  const report = buildReport({ id: reportId(site.id, o.live ? "live" : o.version), workspaceId: site.workspaceId, siteId: site.id, version: o.version, createdAt: now(), ...(o.live ? { live: true } : {}) }, files, [...stat, ...axeFindings, ...aiFindings], passes);
  await saveReport(report);
  yield { t: "report", report };
  return report;
}

export async function saveReport(r: CriticReport) {
  const existing = await reports().get(r.workspaceId, r.id);
  if (existing) await reports().update(r.workspaceId, r.id, r);
  else await reports().insert(r);
}

export async function getReport(site: Pick<Site, "id" | "workspaceId">, version: number | "live") {
  return reports().get(site.workspaceId, reportId(site.id, version));
}

/** Quick report (rules only, no browser, no model): instant, used for the publish gate when no full report exists yet. */
export async function quickReport(site: Site, version: number): Promise<CriticReport | null> {
  const v = await getVersion(site, version);
  if (!v) return null;
  const t = Date.now();
  const f = runRules(v.files, optsFor(site));
  const r = buildReport({ id: reportId(site.id, version), workspaceId: site.workspaceId, siteId: site.id, version, createdAt: now() }, v.files, f, { static: { rules: RULE_COUNT, ms: Date.now() - t } });
  await saveReport(r);
  return r;
}

/** Applies chosen findings to the CURRENT head (patches re-anchor if the code moved) and saves the result as a new version. */
export async function applyFixes(site: Site, plan: PlanId, report: CriticReport, ids: string[], by: string) {
  const head = await getVersion(site, site.headVersion);
  if (!head) throw new HttpError(409, "Build something first.", "conflict");
  const chosen = report.findings.filter((f) => ids.includes(f.id));
  if (!chosen.length) throw new HttpError(400, "Pick at least one fix.");
  const r = applyFindings(head.files, chosen);
  if (!r.applied.length) throw new HttpError(409, r.skipped[0]?.reason ?? "None of those fixes could be applied.", "stale", { skipped: r.skipped });
  let files: Record<string, string>;
  try {
    files = normalizeFor(site, plan, r.files);
  } catch (e) {
    throw new HttpError(400, `The fixed files didn't pass validation: ${(e as Error).message}`);
  }
  const titles = chosen.filter((f) => r.applied.includes(f.id)).map((f) => f.title);
  const summary = `Critic: ${r.applied.length} fix${r.applied.length === 1 ? "" : "es"} — ${[...new Set(titles)].slice(0, 3).join("; ")}${titles.length > 3 ? "…" : ""} (${by})`;
  const { site: saved, version } = await addVersion({ plan }, site, files, { kind: "edit", summary, prompt: "", model: null, units: 0 }, [{ id: newId("msg"), role: "system", text: summary, at: now() }]);
  const fresh = await quickReport(saved, version.n);
  return { site: saved, version: version.n, applied: r.applied, skipped: r.skipped, report: fresh };
}
