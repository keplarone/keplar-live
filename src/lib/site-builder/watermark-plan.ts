/** Server side: the plan that decides a site's watermark, read from the owner's workspace at render time (never cached on the site). */
import type { PlanId } from "@/lib/create/platform/plans";
import { workspaceById } from "@/lib/create/platform/workspace";

export async function siteOwnerPlan(workspaceId: string): Promise<PlanId> {
  try {
    // workspaceById applies the lapsed-subscription rule and the admin override, same as the rest of the app.
    return (await workspaceById(workspaceId))?.plan ?? "free";
  } catch {
    return "free"; // fail closed: if the plan cannot be read, the watermark stays
  }
}
