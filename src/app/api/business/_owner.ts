import { rateLimit } from "@/lib/create/platform/ratelimit";
import { businessWorkspace } from "@/lib/business/require";

/** Owner-side request context: requires a signed-in account; an invited teammate acts in the owner's Business workspace. */
export async function owner(req: Request) {
  const { ws } = await businessWorkspace(req);
  await rateLimit(`biz:${ws.id}`, ws.entitlements.rpm * 4);
  return ws;
}
