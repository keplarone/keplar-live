/** Test fixtures: a real workspace row (paid plan override) and a Stripe Connect test account row. */
import { ensureWorkspaceForUser, updateWorkspace } from "@/lib/accounts/workspaces";
import { id, now } from "@/lib/create/platform/ids";
import { connectAccounts } from "@/lib/business/repo";
import { getAccount } from "@/lib/business/stripe";
import { workspaceById } from "@/lib/create/platform/workspace";
import type { PlanId } from "@/lib/create/platform/plans";

export async function testWorkspace(label = "owner", plan: PlanId = "pro") {
  const row = await ensureWorkspaceForUser({ id: `user_${label}`, email: `${label}@example.com`, name: label });
  // The plan is stored too, because server-side paths that load the workspace by id (the scheduler) read the stored plan.
  if (plan !== "free") await updateWorkspace(row.id, { plan });
  return (await workspaceById(row.id, plan))!;
}

export async function testAccount(workspaceId: string, mode: "test" | "live" = "test") {
  const existing = await getAccount(workspaceId, mode);
  if (existing) return existing;
  return connectAccounts().insert({
    id: id("ca"),
    workspaceId,
    stripeAccountId: `acct_${mode}_${Math.random().toString(36).slice(2, 12)}`,
    mode,
    config: { dashboard: "full", fees_collector: "stripe", losses_collector: "stripe", charge_type: "direct" },
    status: "onboarding",
    chargesEnabled: false,
    payoutsEnabled: false,
    country: "US",
    createdAt: now(),
  });
}
