/**
 * Business seats: how many people (owner included) a Business team may have, from the tier the owner bought. Starter 1,
 * Growth 5, Scale 15; Enterprise is negotiated, capped here at ENTERPRISE_SEATS until a contract sets otherwise.
 * Only a tier we can identify (a purchased Whop plan, an enterprise contract key, a Keplar admin) sets seats; an older Business
 * account with no recorded tier keeps the team policy's limit, so nobody already on a team is locked out.
 * Kept apart from src/lib/business/team.ts so the team store can use it without an import cycle.
 */
import { getWorkspace } from "@/lib/accounts/workspaces";
import { isAdminEmail } from "@/lib/billing/admin";
import { BUSINESS_TIERS, businessTierForWhopPlanId, type BusinessTier } from "./tiers";

export const ENTERPRISE_SEATS = 200;

/** The tier a Business workspace bought, or null when it can't be told (no plan id recorded). */
export function knownTier(ownerEmail: string | null | undefined, lookupKey: string | null | undefined, env: Record<string, string | undefined> = process.env): BusinessTier | null {
  if (ownerEmail && isAdminEmail(ownerEmail)) return "enterprise";
  if (typeof lookupKey === "string" && lookupKey.startsWith("enterprise:")) return "enterprise";
  return businessTierForWhopPlanId(lookupKey, env)?.tier ?? null;
}

export const seatsForTier = (tier: BusinessTier): number => BUSINESS_TIERS[tier].seats ?? ENTERPRISE_SEATS;

/** Seats for a team whose owner is on Business, or null to keep the team policy (tier unknown, or the row can't be read). */
export async function businessSeats(ownerWorkspaceId: string, ownerEmail: string): Promise<number | null> {
  const row = await getWorkspace(ownerWorkspaceId);
  const tier = row ? knownTier(ownerEmail, row.billing.lookupKey) : null;
  return tier ? seatsForTier(tier) : null;
}
