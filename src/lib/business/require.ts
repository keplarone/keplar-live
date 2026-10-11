import { HttpError } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { hasBusinessAccess } from "./tiers";

/** A signed-in account with an active Keplar Business plan (or a Keplar admin), rate limited per workspace. */
export async function requireBusiness(req: Request): Promise<Workspace> {
  const ws = await currentWorkspace(req);
  if (!hasBusinessAccess(ws.plan, ws.admin)) throw new HttpError(403, "This needs a Keplar Business plan. Choose one at business.keplar.one.", "business_only");
  await rateLimit(`biz:${ws.id}`, ws.entitlements.rpm * 4);
  return ws;
}
