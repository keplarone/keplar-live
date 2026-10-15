/**
 * Abuse reports for published sites (`sb_sites`, target `site:<slug>`) and legacy Create projects (target = project id).
 *
 * Child-safety (CSAM) and intimate-image (NCII) reports are urgent. A single anonymous form post must not be able to take any site
 * down for good, so the site goes down at once only when:
 *   - the reporter is signed in with a verified email, or
 *   - at least TAKEDOWN_REPORTERS distinct reporters (distinct signed-in accounts or distinct hashed IPs) reported the same target
 *     for an urgent reason within TAKEDOWN_WINDOW_MS.
 * Otherwise the report is stored as urgent, the owner alert goes out marked URGENT, and it heads the admin inbox. An admin can take
 * a target down or restore it from the inbox (`applyAbuseAction`, behind requireAdmin + audit).
 */
import { createHmac } from "node:crypto";
import { getSession } from "@/lib/accounts/auth";
import { authSecret } from "@/lib/accounts/secret";
import { id as newId, now } from "@/lib/create/platform/ids";
import { clientIpOf } from "@/lib/create/platform/ratelimit";
import { abuseReports, projects } from "@/lib/create/repo";
import type { AbuseReport } from "@/lib/create/types";
import { sites } from "@/lib/site-builder/store";

export const URGENT_REASONS: ReadonlySet<string> = new Set(["csam", "ncii"]);
export const TAKEDOWN_REPORTERS = 3;
export const TAKEDOWN_WINDOW_MS = 24 * 3600_000;

export type Reporter = { key: string; verifiedAccount: boolean };

/** Who sent the report: a signed-in account (`u:<id>`) or a keyed hash of the IP (`ip:<hash>`). The raw IP is never stored. */
export async function reporterOf(req: Request): Promise<Reporter> {
  const s = await getSession(req.headers).catch(() => null);
  if (s?.user?.id) return { key: `u:${s.user.id}`, verifiedAccount: Boolean(s.user.emailVerified) };
  const ip = clientIpOf(req);
  return { key: `ip:${createHmac("sha256", authSecret()).update(`abuse:ip:${ip}`).digest("hex").slice(0, 32)}`, verifiedAccount: false };
}

export type FiledReport = { report: AbuseReport; urgent: boolean; takeDown: boolean; reporters: number };

/**
 * Store one report and decide whether it takes the target down now. The caller applies the takedown (it knows the target's
 * collection) and sends the alert.
 */
export async function fileAbuseReport(input: { workspaceId: string; target: string; reason: string; details: string; reporterEmail?: string; reporter: Reporter }): Promise<FiledReport> {
  const urgent = URGENT_REASONS.has(input.reason);
  let reporters = 0;
  let takeDown = false;
  if (urgent) {
    const since = new Date(Date.now() - TAKEDOWN_WINDOW_MS).toISOString();
    const earlier = await abuseReports().list(input.workspaceId, (r) => r.target === input.target && URGENT_REASONS.has(r.reason) && r.createdAt >= since && Boolean(r.reporterKey));
    reporters = new Set([...earlier.map((r) => r.reporterKey!), input.reporter.key]).size;
    takeDown = input.reporter.verifiedAccount || reporters >= TAKEDOWN_REPORTERS;
  }
  const report = await abuseReports().insert({
    id: newId("abr"),
    workspaceId: input.workspaceId,
    target: input.target,
    reason: input.reason,
    details: input.details,
    ...(input.reporterEmail ? { reporterEmail: input.reporterEmail } : {}),
    reporterKey: input.reporter.key,
    verifiedReporter: input.reporter.verifiedAccount,
    ...(urgent ? { urgent: true } : {}),
    ...(takeDown ? { autoTakedown: true } : {}),
    status: "open",
    createdAt: now(),
  });
  return { report, urgent, takeDown, reporters };
}

/** One line for the alert email, so the reviewer knows whether the site is already down. */
export function takedownNote(f: FiledReport): string {
  if (!f.urgent) return "Review it and take it down if it breaks the terms.";
  if (f.takeDown) return f.report.verifiedReporter ? "The site was taken down automatically (verified reporter) pending review. Restore it from the admin inbox if the report is wrong." : `The site was taken down automatically (${f.reporters} distinct reporters in 24 h) pending review. Restore it from the admin inbox if the report is wrong.`;
  return `URGENT: not taken down yet (${f.reporters} of ${TAKEDOWN_REPORTERS} distinct reporters, none verified). Review it now in the admin inbox and take it down if the report is right.`;
}

export type AbuseAction = "takedown" | "restore" | "dismiss" | "reopen";
export const ABUSE_ACTIONS: readonly AbuseAction[] = ["takedown", "restore", "dismiss", "reopen"];

/** Admin only (callers gate with requireAdmin and write the audit log). Takes the reported site/project down, restores it, or closes the report. */
export async function applyAbuseAction(reportId: string, action: AbuseAction, by: string): Promise<AbuseReport | null> {
  const r = await abuseReports().findSystem((x) => x.id === reportId);
  if (!r) return null;
  if (action === "takedown" || action === "restore") {
    const takenDown = action === "takedown";
    const slug = r.target.startsWith("site:") ? r.target.slice(5) : null;
    if (slug) {
      const site = await sites().findSystemBy("slug", slug);
      if (site) await sites().update(site.workspaceId, site.id, { takenDown });
    } else {
      const project = await projects().findSystem((p) => p.id === r.target);
      if (project) await projects().update(project.workspaceId, project.id, { takenDown });
    }
  }
  const status: AbuseReport["status"] = action === "dismiss" ? "dismissed" : action === "reopen" ? "open" : "actioned";
  return abuseReports().update(r.workspaceId, r.id, { status, reviewedBy: by, reviewedAt: now(), lastAction: action });
}

/** Admin inbox list: urgent open reports first, then newest. */
export async function listAbuseReports(limit = 200): Promise<AbuseReport[]> {
  const rows = await abuseReports().listSystemRange({ field: "createdAt", gte: new Date(Date.now() - 365 * 864e5).toISOString() }, 5000);
  const rank = (r: AbuseReport) => (r.status === "open" && r.urgent ? 0 : r.status === "open" ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
