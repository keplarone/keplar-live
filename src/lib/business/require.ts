import { HttpError } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { businessTeamWorkspace } from "./team";
import { hasBusinessAccess } from "./tiers";

/**
 * The Business workspace this request acts in: the caller's own when they have a Business plan, otherwise the owner's for a
 * teammate the owner invited (src/lib/business/team.ts, role checked), otherwise null.
 */
export async function businessWorkspace(req: Request): Promise<{ ws: Workspace; business: boolean }> {
  const ws = await currentWorkspace(req);
  if (hasBusinessAccess(ws.plan, ws.admin)) return { ws, business: true };
  const shared = await businessTeamWorkspace(req, ws);
  return shared ? { ws: shared, business: true } : { ws, business: false };
}

/** A signed-in account with an active Keplar Business plan (its own, or as an invited teammate) or a Keplar admin, rate limited per workspace. */
export async function requireBusiness(req: Request): Promise<Workspace> {
  const { ws, business } = await businessWorkspace(req);
  if (!business) throw new HttpError(403, "This needs a Keplar Business plan. Choose one at business.keplar.one.", "business_only");
  await rateLimit(`biz:${ws.id}`, ws.entitlements.rpm * 4);
  return ws;
}
