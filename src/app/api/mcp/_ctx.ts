import { currentWorkspace } from "@/lib/create/platform/workspace";
import { rateLimit } from "@/lib/create/platform/ratelimit";

/** Owner-side context for connected apps: signed-in account only, with a per-account request limit. Plan gating is in the gateway. */
export async function mcpOwner(req: Request) {
  const ws = await currentWorkspace(req);
  await rateLimit(`mcpapi:${ws.id}`, Math.max(60, ws.entitlements.rpm * 4), 60, { shared: true });
  return ws;
}
