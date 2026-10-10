/**
 * The test-and-repair loop for one site, as a stream of real events:
 * test in a real browser (3 screen sizes, console, navigation, 404, form) -> optional visual critique -> if there are real
 * problems and the owner allows it, one repair pass that saves a new version -> test the repaired version again.
 * At most one repair per run, bounded by a deadline; every step is reported as it happens.
 */
import { assertCanSpend, charge } from "@/lib/create/platform/compute";
import type { Workspace } from "@/lib/create/platform/workspace";
import { sites, getVersion } from "../store";
import { previewToken } from "../render";
import type { QaSummary, Site } from "../types";
import { BrowserUnavailable, launchBrowser } from "./browser";
import { critiqueForPrompt, critiqueScreens, type Critique } from "./critique";
import { issueLine, type QaIssue } from "./probe";
import { repairFromFindings } from "./repair";
import { runQa } from "./run";
import { pruneShots, saveShot } from "./shots";

export type QaStreamEvent =
  | { type: "step"; text: string }
  | { type: "issue"; issue: QaIssue }
  | { type: "check"; name: string; ok: boolean; detail: string }
  | { type: "shot"; id: string; page: string; viewport: string; label: string; width: number; height: number; version: number }
  | { type: "critique"; critique: Critique }
  | { type: "repaired"; version: number; summary: string }
  | { type: "done"; summary: QaSummary; version: number }
  | { type: "error"; error: string; code: string };

export async function* testSite(ws: Workspace, site0: Site, opts: { baseUrl: string; repair: boolean; maxMs?: number }): AsyncGenerator<QaStreamEvent> {
  const started = Date.now();
  const deadline = started + (opts.maxMs ?? 270_000);
  let site = site0;
  let repaired = false;
  let critique: Critique | null = null;
  yield { type: "step", text: "Starting a test browser" };
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    yield { type: "error", error: e instanceof BrowserUnavailable ? e.message : "The test browser could not start.", code: "browser_unavailable" };
    return;
  }
  try {
    for (let pass = 0; pass < 2; pass++) {
      const version = site.headVersion;
      const v = await getVersion(site, version);
      if (!v) {
        yield { type: "error", error: "There is no version to test yet.", code: "no_version" };
        return;
      }
      const pages = Object.keys(v.files).filter((f) => f.endsWith(".html") && f !== "404.html").sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)));
      if (pass === 1) yield { type: "step", text: `Testing version ${version} again after the fixes` };
      const issues: QaIssue[] = [];
      let shots = 0;
      let homeShots: { viewport: string; jpeg: Buffer }[] = [];
      for await (const ev of runQa({ browser, baseUrl: opts.baseUrl, siteId: site.id, version, token: previewToken(site.id, 20 * 60_000), pages, hasErrorPage: v.files["404.html"] !== undefined, deadline: deadline - (opts.repair && pass === 0 ? 120_000 : 0) })) {
        if (ev.type === "step" || ev.type === "check") yield ev;
        else if (ev.type === "issue") { issues.push(ev.issue); yield ev; }
        else if (ev.type === "shot") {
          const meta = await saveShot(ws, { siteId: site.id, version, page: ev.page, viewport: ev.viewport, width: ev.width, height: ev.height, label: ev.label, jpeg: ev.jpeg });
          shots++;
          yield { type: "shot", id: meta.id, page: ev.page, viewport: ev.viewport, label: ev.label, width: ev.width, height: ev.height, version };
        } else if (ev.type === "done") homeShots = ev.homeShots;
      }
      await pruneShots(ws, site.id).catch(() => undefined);

      // A design review of what the browser saw (advisory; counts toward the repair only when it calls something high-severity).
      if (homeShots.length === 3 && Date.now() < deadline - 40_000) {
        yield { type: "step", text: "Reviewing the screenshots for layout and hierarchy" };
        try {
          await assertCanSpend(ws, ws.plan === "free" ? 0 : 3);
          const out = await critiqueScreens(ws.plan, homeShots.map((s) => s.jpeg));
          if (out) {
            critique = out.critique;
            if (out.usd > 0) await charge(ws, "photo.read", { usd: Math.max(out.usd, 0.0005), ref: `site-qa:${site.id}` }).catch(() => 0);
            yield { type: "critique", critique: out.critique };
          } else yield { type: "step", text: "The visual review was not available this time; the browser checks still ran" };
        } catch {
          yield { type: "step", text: "Skipped the visual review (usage limit or pause)" };
        }
      }

      const errors = issues.filter((i) => i.severity === "error");
      const highVisual = critique?.issues.filter((i) => i.severity === "high") ?? [];
      const needsFix = errors.length > 0 || highVisual.length > 0;
      const left = deadline - Date.now();
      if (pass === 0 && opts.repair && needsFix && left > 110_000) {
        yield { type: "step", text: `Fixing ${errors.length + highVisual.length} problem${errors.length + highVisual.length === 1 ? "" : "s"} the test found` };
        const findings = [...errors.map(issueLine), ...(critique ? critiqueForPrompt(critique).split("\n").filter(Boolean) : [])].slice(0, 14).join("\n");
        const events: string[] = [];
        const r = await repairFromFindings(ws, site, findings, { budgetMs: left - 70_000, onStatus: (t) => events.push(t) });
        for (const t of events) yield { type: "step", text: t };
        if (r) {
          repaired = true;
          yield { type: "repaired", version: r.version, summary: r.summary };
          site = (await sites().get(ws.id, site.id)) ?? site;
          continue;
        }
        yield { type: "step", text: "The repair did not produce a better version; keeping the current one" };
      }

      const warnings = issues.filter((i) => i.severity === "warn");
      const summary: QaSummary = {
        version,
        at: new Date().toISOString(),
        errors: errors.length,
        warnings: warnings.length,
        shots,
        pages: pages.length,
        score: critique?.score ?? null,
        summary: critique?.summary ?? null,
        repaired,
        issues: issues.slice(0, 20).map((i) => ({ code: i.code, severity: i.severity, page: i.page, viewport: i.viewport, message: i.message.slice(0, 260) })),
      };
      await sites().update(ws.id, site.id, { qa: summary }).catch(() => undefined);
      yield { type: "done", summary, version };
      return;
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

