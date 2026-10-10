/**
 * Recent posts on X (src/lib/providers/x-posts.ts). Signed-in, paid plans (each call is billed by X), rate limited.
 *   GET  -> { available }   (signed in; true only on paid plans with X_BEARER_TOKEN set)
 *   POST { query } -> { posts } | 503 not_configured (X_BEARER_TOKEN unset)
 */
import { personalOwner } from "@/lib/personalize/owner";
import { getFamily } from "@/lib/personalize/family";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { searchRecentPosts, xConfigured } from "@/lib/providers/x-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ws = await personalOwner(req);
    return json({ available: ws.plan !== "free" && xConfigured() && !(await getFamily(ws.id))?.enabled });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await personalOwner(req, true);
    if (ws.plan === "free") throw new HttpError(402, "Searching X is on paid plans.", "entitlement");
    if ((await getFamily(ws.id))?.enabled) throw new HttpError(403, "Posts on X are off in Family mode.", "family_mode");
    await limitRequest(req, "x-search", { perIp: 60, perAccount: 30, accountId: ws.id, windowSec: 3600 });
    const b = await body<{ query?: unknown }>(req);
    const r = await searchRecentPosts(b.query);
    if (!r.ok) throw new HttpError(r.reason === "not_configured" ? 503 : r.reason === "invalid" ? 400 : r.reason === "rate_limited" ? 429 : 502, r.message, r.reason);
    return json({ posts: r.posts });
  } catch (e) {
    return errorResponse(e);
  }
}
