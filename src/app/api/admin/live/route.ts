import { errorResponse, json } from "@/lib/create/platform/http";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { liveActivity } from "@/lib/admin/live-activity";
import { presentNow } from "@/lib/traffic/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only (anyone else gets a plain 404) and cheap: the card calls this every ~10 s. Returns the on-the-site-now count and the
 * chat activity (counts, model ids, times). No message text and no user identity are ever in it.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const [onSiteNow, activity] = await Promise.all([presentNow().catch(() => null), liveActivity().catch(() => null)]);
    return json({ onSiteNow, activity });
  } catch (e) {
    return errorResponse(e);
  }
}
