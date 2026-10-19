import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { writeAudit } from "@/lib/ops/audit";
import { growthControls, runJob, setGrowthControls } from "@/lib/growth/ops/runner";
import { jobById, GROWTH_JOBS } from "@/lib/growth/ops/jobs";
import { createDraft, editDraft, transition, type ContentStatus } from "@/lib/growth/ops/content";
import { recordSubmission, type SubmissionStatus } from "@/lib/growth/ops/leaderboards";
import { markReviewed } from "@/lib/growth/ops/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Command Center actions. Admin only (404 for everyone else); the proxy requires same-origin for POSTs; every action is audited.
 * Body: { action, ... }:
 *   pause { job? } | resume { job? } | run { job }              growth jobs (run = "Run now": still claimed once per period)
 *   content.create { draft } | content.edit { id, draft } | content.move { id, to, note?, publishedUrl? }
 *   submission { platformId, to, note?, listingUrl? }            a person's submission step on a ranking platform
 *   watch.reviewed { id }                                         a changed page was reviewed
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    await rateLimit(`admin:growth-ops:${admin.email}`, 60);
    const b = await body<Record<string, unknown>>(req);
    const action = str(b.action, 40);
    switch (action) {
      case "pause":
      case "resume": {
        const job = str(b.job, 60);
        if (job && !jobById(job)) throw new HttpError(400, "Unknown job.");
        const cur = await growthControls();
        const next = job
          ? await setGrowthControls({ pausedJobs: action === "pause" ? [...cur.pausedJobs, job] : cur.pausedJobs.filter((j) => j !== job) }, admin.email)
          : await setGrowthControls({ paused: action === "pause" }, admin.email);
        await writeAudit(admin.email, `growth.${action}`, job || "all growth jobs");
        return json({ controls: next });
      }
      case "run": {
        const job = jobById(str(b.job, 60));
        if (!job) throw new HttpError(400, `Unknown job. Jobs: ${GROWTH_JOBS.map((j) => j.id).join(", ")}.`);
        await writeAudit(admin.email, "growth.run", job.id);
        return json({ result: await runJob(job, { force: true }) });
      }
      case "content.create":
        await writeAudit(admin.email, "growth.content", "create");
        return json({ item: await createDraft(b.draft, admin.email) });
      case "content.edit":
        await writeAudit(admin.email, "growth.content", `edit ${str(b.id, 60)}`);
        return json({ item: await editDraft(str(b.id, 60), b.draft, admin.email) });
      case "content.move": {
        const to = str(b.to, 20) as ContentStatus;
        const item = await transition(str(b.id, 60), to, admin.email, { note: str(b.note, 300), publishedUrl: str(b.publishedUrl, 500) });
        await writeAudit(admin.email, "growth.content", `${item.id} -> ${to}`);
        return json({ item });
      }
      case "submission": {
        const to = str(b.to, 20) as SubmissionStatus;
        const s = await recordSubmission(str(b.platformId, 80), to, admin.email, { note: str(b.note, 300), listingUrl: str(b.listingUrl, 500) || undefined });
        await writeAudit(admin.email, "growth.submission", `${s.platformId} -> ${to}`);
        return json({ submission: s });
      }
      case "watch.reviewed":
        await markReviewed(str(b.id, 120));
        await writeAudit(admin.email, "growth.watch", `reviewed ${str(b.id, 120)}`);
        return json({ ok: true });
      default:
        throw new HttpError(400, "Unknown action.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
