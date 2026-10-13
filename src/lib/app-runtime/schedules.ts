/**
 * Scheduled jobs of published apps (spec.schedules, see ScheduleSpec): once a day the cron (/api/cron/app-schedules) runs
 * each due job's AI action with its fixed input on the live app and saves the text as a new record, owned by "schedule"
 * and labelled with the job's name. It runs through runAi, so the app's AI switch, plan limits, safety check and the owner's
 * credit allowance all apply exactly as for a visitor's request. A failed job is logged and retried on the next run.
 */
import { collection } from "@/lib/create/platform/store";
import { now } from "@/lib/create/platform/ids";
import { isDeleted, sites } from "@/lib/site-builder/store";
import { siteOwnerPlan } from "@/lib/site-builder/watermark-plan";
import type { Site } from "@/lib/site-builder/types";
import type { ScheduleSpec } from "@/lib/app-builder/types";
import { appCtx, effectiveMeta } from "./context";
import { createItem } from "./data";
import { runAi, SCHEDULE_CALLER } from "./ai";

type RunRow = { id: string; workspaceId: string; siteId: string; name: string; lastAt: string; ok: boolean; error?: string };
const runs = () => collection<RunRow>("app_schedule_runs");

const DUE_MS = { day: 20 * 3_600_000, week: 6.5 * 86_400_000 } as const;

/** Jobs of a live app (the publish snapshot's spec). */
export function liveSchedules(site: Site): ScheduleSpec[] {
  if (!site.app || !site.publishedVersion || site.takenDown || isDeleted(site)) return [];
  return effectiveMeta(site.app, "live").spec.schedules ?? [];
}

export function isDue(job: ScheduleSpec, lastAt: string | null, at = Date.now()): boolean {
  return !lastAt || at - new Date(lastAt).getTime() >= DUE_MS[job.every];
}

export async function runDueSchedules(deadline: number): Promise<{ apps: number; ran: number; failed: number }> {
  const apps = await sites().listSystem((s) => s.kind === "app" && liveSchedules(s).length > 0);
  let ran = 0;
  let failed = 0;
  for (const site of apps) {
    if (Date.now() > deadline - 30_000) break;
    const plan = await siteOwnerPlan(site.workspaceId);
    const ctx = appCtx(site, "live", plan);
    if (!ctx) continue;
    for (const job of liveSchedules(site)) {
      if (Date.now() > deadline - 30_000) break;
      const id = `${site.id}:${job.name}`;
      const prev = await runs().get(site.workspaceId, id);
      if (!isDue(job, prev?.lastAt ?? null)) continue;
      const row: RunRow = { id, workspaceId: site.workspaceId, siteId: site.id, name: job.name, lastAt: now(), ok: true };
      try {
        const r = await runAi(ctx, null, job.ai, { ...job.input }, SCHEDULE_CALLER);
        const text = typeof r.text === "string" && r.text.trim() ? r.text : JSON.stringify(r.json ?? "");
        await createItem(ctx, null, job.save.collection, { [job.save.field]: text }, { ownerId: "schedule", ownerName: job.label || "Scheduled" });
        ran++;
      } catch (e) {
        failed++;
        // Retry on the next run (lastAt is not advanced), but keep the reason for the owner and the logs.
        row.ok = false;
        row.lastAt = prev?.lastAt ?? "1970-01-01T00:00:00.000Z";
        row.error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        console.error("[app-schedules]", site.id, job.name, row.error);
      }
      if (prev) await runs().update(site.workspaceId, id, row);
      else await runs().insert(row);
    }
  }
  return { apps: apps.length, ran, failed };
}
