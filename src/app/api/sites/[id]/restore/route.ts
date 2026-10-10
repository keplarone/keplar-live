import { assertSameAccount } from "@/lib/accounts/account-guard";
import { errorResponse, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { restoreSite } from "@/lib/site-builder/deletion";
import { toSummary } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Undo a delete: brings the site back exactly as it was, while its grace period lasts (404 for anyone else's site, 410 once it was removed for good). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const ws = await currentWorkspace(req, { team: true });
    assertSameAccount(req, ws.userId);
    await rateLimit(`sb:restore:${ws.id}`, 30, 60, { shared: true });
    const site = await restoreSite(ws, (await params).id);
    return json({ site: toSummary(site, new URL(req.url).origin) });
  } catch (e) {
    return errorResponse(e);
  }
}
