/**
 * Keplar Studio auto top-up is gone. Whop can still deliver a signed event for a payment that was started before
 * the feature was removed. Those events must not be applied as a plan change, and a refund of one must not cancel
 * the subscription. Credits already granted for a refunded payment are taken back through the shared extension ledger.
 */
import { revokeExtensionByPayment } from "@/lib/create/platform/extensions";
import { collection } from "@/lib/create/platform/store";

type Attempt = { id: string; workspaceId: string; paymentId?: string; status: string; revokedAt?: string };

const attempts = () => collection<Attempt>("studio_topup_attempts");

export function isRetiredStudioTopUp(data: Record<string, unknown>): boolean {
  const metadata = data.metadata;
  return !!metadata && typeof metadata === "object" && (metadata as { kind?: unknown }).kind === "studio_auto_topup";
}

/** Marks a past auto top-up refunded and revokes the credits it granted. Returns false when the payment was not one. */
export async function revokeRetiredStudioTopUp(paymentId: string, reason: string): Promise<boolean> {
  const a = await attempts().findSystemBy("paymentId", paymentId);
  if (!a) return false;
  await attempts().update(a.workspaceId, a.id, { status: "revoked", revokedAt: new Date().toISOString() });
  await revokeExtensionByPayment(paymentId, reason);
  return true;
}
