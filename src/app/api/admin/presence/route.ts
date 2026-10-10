import { errorResponse, json } from "@/lib/create/platform/http";
import { requireAdmin } from "@/lib/ops/admin-auth";
import { presentNow } from "@/lib/traffic/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only (anyone else gets a plain 404) and cheap: the card polls this every ~5 s. Returns one number, nothing else. */
export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return json({ onSiteNow: await presentNow().catch(() => null) });
  } catch (e) {
    return errorResponse(e);
  }
}
