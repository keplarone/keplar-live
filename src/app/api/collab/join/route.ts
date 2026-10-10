/** POST { siteId, token } → redeems a live-session invite for the signed-in (verified) user. */
import { errorResponse, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { redeemInvite } from "@/lib/collab/access";
import { caller } from "@/lib/collab/caller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { user, views } = await caller(req);
    await rateLimit(`collab:join:${user.id}`, 20, 600, { shared: true });
    const input = await body<{ siteId?: string; token?: string }>(req);
    const a = await redeemInvite(user, String(input.siteId ?? ""), String(input.token ?? ""), views);
    return json({ ok: true, site: { id: a.site.id, name: a.site.name }, role: a.role, via: a.via });
  } catch (e) {
    return errorResponse(e);
  }
}
