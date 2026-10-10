/**
 * Admin only (404 for everyone else). POST { action }:
 *   settings {paused?, autoPublish?, maxPerDay?, maxLive?}   kill switch and limits
 *   publish {slug}      publish a held page (it already passed the gates)
 *   rollback {slug}     take one page down (404 at once, out of the sitemap, never republished automatically)
 *   rollback_all        take every tracker page down
 *   run                 run the tracker now
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { isSameOrigin } from "@/lib/security/origin";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { adminPublish, adminRollback, adminRollbackAll, runTrends } from "@/lib/trends/run";
import { getSettings, saveSettings } from "@/lib/trends/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    const b = await body<{ action?: string; slug?: unknown; paused?: unknown; autoPublish?: unknown; maxPerDay?: unknown; maxLive?: unknown }>(req);
    switch (b.action) {
      case "settings": {
        await saveSettings({
          ...(typeof b.paused === "boolean" ? { paused: b.paused } : {}),
          ...(typeof b.autoPublish === "boolean" ? { autoPublish: b.autoPublish } : {}),
          ...(typeof b.maxPerDay === "number" ? { maxPerDay: b.maxPerDay } : {}),
          ...(typeof b.maxLive === "number" ? { maxLive: b.maxLive } : {}),
        }, admin.email);
        return json({ settings: await getSettings() });
      }
      case "publish":
        if (typeof b.slug !== "string" || !(await adminPublish(b.slug, admin.email))) throw new HttpError(409, "That page is not waiting for approval.", "invalid");
        return json({ ok: true });
      case "rollback":
        if (typeof b.slug !== "string" || !(await adminRollback(b.slug, admin.email))) throw new HttpError(404, "No such page, or already rolled back.", "not_found");
        return json({ ok: true });
      case "rollback_all":
        return json({ rolledBack: await adminRollbackAll(admin.email) });
      case "run":
        return json({ summary: await runTrends() });
      default:
        throw new HttpError(400, "Unknown action.", "invalid");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
