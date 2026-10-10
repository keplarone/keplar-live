/** Which plan a team runs on: the owner's, read fresh each time (a lapsed or downgraded owner pauses the team). */
import { getWorkspace, planLapsed } from "@/lib/accounts/workspaces";
import { isAdminEmail } from "@/lib/billing/admin";
import type { PlanId } from "@/lib/create/platform/plans";
import type { TeamRow } from "./rows";

export async function effectivePlanOf(team: TeamRow): Promise<PlanId> {
  const row = await getWorkspace(team.ownerWorkspaceId);
  if (!row) return "free";
  if (isAdminEmail(team.ownerEmail)) return "business";
  return planLapsed(row) ? "free" : row.plan;
}
