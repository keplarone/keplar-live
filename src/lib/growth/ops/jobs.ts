/**
 * The growth jobs /api/cron/growth runs (see runner.ts for the guarantees). Order matters: the reports run last so they read the
 * other jobs' fresh results. Jobs that spend money stay off until their budget is set; the rest only read Keplar's own data or fetch
 * public pages politely.
 */
import { collection } from "@/lib/create/platform/store";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";
import { latestOk, recentRuns, isoWeek, type GrowthJob } from "./runner";
import { retentionBetween, snapshotOnOrBefore, snapshotToday } from "./revenue";
import { activeCounts, weeklyCohorts, type ActivityRow } from "./retention";
import { runSeoAudit } from "./seo-audit";
import { allWatched, checkTargets } from "./watch";
import { watchTargets } from "./leaderboards";
import { defaultEngine, geoBudgetUsd, runVisibility, geoRows } from "./visibility";
import { buildReport, latestReport, saveReport, type Report } from "./reports";

const DAY = 864e5;
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://keplar.one").replace(/\/$/, "");
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

async function activity(sinceDays: number, now: Date): Promise<ActivityRow[]> {
  const since = new Date(now.getTime() - sinceDays * DAY).toISOString();
  return (await collection<ActivityRow & { id: string; workspaceId: string }>("growth_events").listSystemRange({ field: "at", gte: since }, 200_000)).filter((r) => r.event === "ask_started");
}

async function reportInputs(now: Date, windowDays: number, previous: Report | null) {
  const today = dayStr(now);
  const snap = await snapshotOnOrBefore(today);
  const before = await snapshotOnOrBefore(dayStr(new Date(now.getTime() - windowDays * DAY)));
  const seo = await latestOk("seo-audit");
  const watched = await allWatched();
  const week = isoWeek(now);
  const geo = (await geoRows().list("system", (r) => r.week === week));
  const runs = (await recentRuns(500)).filter((r) => Date.parse(r.finishedAt ?? r.at) >= now.getTime() - windowDays * DAY);
  const seoCounts = seo?.data?.counts as { error: number; warning: number } | undefined;
  return {
    mrrNow: snap ? { mrrUsd: snap.mrrUsd, customers: Object.keys(snap.customers).length } : null,
    retention: snap && before && before.date !== snap.date ? retentionBetween(before, snap) : null,
    active: activeCounts(await activity(31, now), now),
    seo: seo ? { checked: Number(seo.data?.checked ?? 0), errors: seoCounts?.error ?? 0, warnings: seoCounts?.warning ?? 0 } : null,
    watchChanged: watched.filter((w) => w.changedAt && !w.reviewedAt).map((w) => ({ owner: w.owner, kind: w.kind, url: w.url })),
    geo: geo.length ? { asked: geo.length, mentioned: geo.filter((g) => g.mentioned).length, cited: geo.filter((g) => g.cited).length } : null,
    jobs: { ok: runs.filter((r) => r.status === "ok").length, failed: runs.filter((r) => r.status === "failed").length, skipped: runs.filter((r) => r.status === "skipped").length },
    previous,
  };
}

export const GROWTH_JOBS: GrowthJob[] = [
  {
    id: "revenue-snapshot",
    label: "Subscription snapshot",
    cadence: "daily",
    description: "Reads accounts_workspaces billing state; writes today's row in growth_sub_daily (accounts hashed). Spends nothing.",
    timeoutMs: 60_000,
    run: async ({ now }) => {
      const rows = await collection<WorkspaceRow>("accounts_workspaces").listSystem();
      const s = await snapshotToday(now, rows);
      return { summary: `${Object.keys(s.customers).length} paying, MRR $${s.mrrUsd.toFixed(2)} (billed price).`, data: { mrrUsd: s.mrrUsd, byPlan: s.byPlan, cancelScheduled: s.cancelScheduled } };
    },
  },
  {
    id: "seo-audit",
    label: "Technical SEO audit",
    cadence: "daily",
    description: "Reads keplar.one's sitemaps, robots.txt and up to 40 pages (rotating); reports issues. Changes nothing.",
    timeoutMs: 120_000,
    run: async ({ now, signal }) => {
      const r = await runSeoAudit(siteUrl(), { now, signal });
      return { summary: `${r.checked} of ${r.sitemapUrls} sitemap URLs checked: ${r.counts.error} errors, ${r.counts.warning} warnings, ${r.counts.notice} notices.`, data: r as unknown as Record<string, unknown> };
    },
  },
  {
    id: "usage-retention",
    label: "Usage retention and cohorts",
    cadence: "weekly",
    description: "Reads growth_events (consenting browsers only) for 10 weeks; computes DAU/WAU/MAU and weekly cohorts.",
    timeoutMs: 60_000,
    run: async ({ now }) => {
      const rows = await activity(70, now);
      const a = activeCounts(rows, now);
      const cohorts = weeklyCohorts(rows, now, 8);
      return { summary: `WAU ${a.wau}, MAU ${a.mau}; ${cohorts.length} weekly cohorts (consenting browsers only).`, data: { ...a, cohorts } };
    },
  },
  {
    id: "page-watch",
    label: "Competitor and leaderboard page watch",
    cadence: "weekly",
    description: "One GET per official page a week (robots.txt respected): competitors' pricing and release notes, ranking platforms' submission pages. Flags changed pages for review.",
    timeoutMs: 240_000,
    run: async ({ now, signal }) => {
      const r = await checkTargets(watchTargets(), { now, signal });
      return { summary: `${r.checked} pages read, ${r.changed.length} changed, ${r.failed} failed, ${r.disallowed} disallowed by robots.txt.`, data: { changed: r.changed.map((c) => ({ id: c.id, owner: c.owner, kind: c.kind, url: c.url })) } };
    },
  },
  {
    id: "ai-visibility",
    label: "AI answer-engine visibility",
    cadence: "weekly",
    description: "Asks a versioned set of 15 questions once a week through an answer-engine API; records Keplar mentions, keplar.one citations and competitors. Spends up to KEPLAR_GEO_WEEKLY_USD.",
    timeoutMs: 240_000,
    budgetUsd: () => geoBudgetUsd(),
    requires: () => (!defaultEngine() ? "No answer-engine key (OPENROUTER_API_KEY)." : geoBudgetUsd() <= 0 ? "Budget is $0: set KEPLAR_GEO_WEEKLY_USD to allow it (about $0.15 a week for 15 questions)." : null),
    run: async ({ now, signal, budgetUsd, period }) => {
      const r = await runVisibility({ week: period, signal, budgetUsd, engine: defaultEngine()!, now });
      return { summary: `${r.asked} asked: Keplar mentioned in ${r.mentioned}, keplar.one cited in ${r.cited}${r.stoppedForBudget ? " (stopped at the budget)" : ""}.`, costUsd: r.spentUsd, data: r };
    },
  },
  {
    id: "weekly-report",
    label: "Weekly growth report",
    cadence: "weekly",
    description: "Assembles the week's measured facts and computed changes into growth_reports. Spends nothing.",
    timeoutMs: 60_000,
    run: async ({ now, period }) => {
      const r = buildReport("weekly", period, now, await reportInputs(now, 7, await latestReport("weekly", period)));
      await saveReport(r);
      return { summary: `${r.facts.filter((f) => f.value !== null).length} of ${r.facts.length} facts available; ${r.attention.length} items need attention.` };
    },
  },
  {
    id: "monthly-report",
    label: "Monthly growth report",
    cadence: "monthly",
    description: "The same, over the month (MRR, churn and revenue retention month over month).",
    timeoutMs: 60_000,
    run: async ({ now, period }) => {
      const r = buildReport("monthly", period, now, await reportInputs(now, 30, await latestReport("monthly", period)));
      await saveReport(r);
      return { summary: `${r.facts.filter((f) => f.value !== null).length} of ${r.facts.length} facts available; ${r.attention.length} items need attention.` };
    },
  },
];

export const jobById = (id: string) => GROWTH_JOBS.find((j) => j.id === id);
