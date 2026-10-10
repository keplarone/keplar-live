import { currentWorkspace } from "@/lib/create/platform/workspace";
import { rateLimit } from "@/lib/create/platform/ratelimit";

/** Owner-side request context: requires a signed-in account. */
export async function owner(req: Request) {
  const ws = await currentWorkspace(req);
  await rateLimit(`biz:${ws.id}`, ws.entitlements.rpm * 4);
  return ws;
}
