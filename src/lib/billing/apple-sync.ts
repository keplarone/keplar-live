/**
 * Map verified Apple transactions / ASN V2 notifications onto Keplar workspace plans.
 * Idempotent by notificationUUID / transactionId. Binding is by appAccountToken (UUID)
 * or by a previously stored originalTransactionId → workspace row.
 */
import { createHash } from "node:crypto";
import { NotificationTypeV2, type ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";
import { collection } from "@/lib/create/platform/store";
import { now } from "@/lib/create/platform/ids";
import { alertOwner } from "@/lib/accounts/alerts";
import { updateWorkspace, workspaces, type WorkspaceRow } from "@/lib/accounts/workspaces";
import {
  appleEnvironmentAllowed,
  decodeTransactionPayload,
  type DecodedAppleTransaction,
  verifySignedTransaction,
} from "./apple";
import type { PaidPlan } from "./plans";

type AppleSubRow = {
  id: string; // originalTransactionId
  workspaceId: string; // always "system" (cross-tenant webhook store)
  boundWorkspaceId: string;
  email: string | null;
  productId: string;
  plan: Exclude<PaidPlan, "lite">;
  environment: string;
  latestTransactionId: string;
  expiresAt: string | null;
  status: "active" | "expired" | "revoked" | "past_due";
  appAccountToken: string | null;
  at: string;
  updatedAt: string;
};

type AppleEventRow = { id: string; workspaceId: string; type: string; at: string; result: string };

const subs = () => collection<AppleSubRow>("apple_subscriptions");
const events = () => collection<AppleEventRow>("apple_billing_events");
const SYSTEM = "system";

const GRANT_TYPES = new Set<string>([
  NotificationTypeV2.SUBSCRIBED,
  NotificationTypeV2.DID_RENEW,
  NotificationTypeV2.OFFER_REDEEMED,
  NotificationTypeV2.RENEWAL_EXTENDED,
  NotificationTypeV2.REFUND_REVERSED,
]);

const REVOKE_TYPES = new Set<string>([NotificationTypeV2.EXPIRED, NotificationTypeV2.REVOKE, NotificationTypeV2.REFUND, NotificationTypeV2.GRACE_PERIOD_EXPIRED]);

const PAST_DUE_TYPES = new Set<string>([NotificationTypeV2.DID_FAIL_TO_RENEW]);

/** Deterministic UUID for StoreKit appAccountToken, derived from workspace id. */
export function appAccountTokenForWorkspace(workspaceId: string): string {
  const h = createHash("sha256").update(`keplar-apple-aat:${workspaceId}`).digest();
  const bytes = Buffer.from(h.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function workspaceForToken(token: string | null | undefined): Promise<WorkspaceRow | null> {
  if (!token) return null;
  const hit = await subs().findSystemBy("appAccountToken", token);
  if (!hit) return null;
  return workspaces().get(hit.boundWorkspaceId, hit.boundWorkspaceId);
}

async function workspaceForOriginal(originalTransactionId: string): Promise<WorkspaceRow | null> {
  const row = await subs().get(SYSTEM, originalTransactionId);
  if (!row) return null;
  return workspaces().get(row.boundWorkspaceId, row.boundWorkspaceId);
}

async function grantApple(ws: WorkspaceRow, decoded: DecodedAppleTransaction) {
  if (!appleEnvironmentAllowed(decoded.environment, ws.ownerEmail)) {
    throw Object.assign(new Error("This purchase was made in Apple's test environment, so it can't unlock a paid plan."), { status: 403, code: "apple_sandbox_refused" });
  }
  const start = decoded.purchaseDate ?? now();
  const end = decoded.expiresDate ?? null;
  await updateWorkspace(ws.id, {
    plan: decoded.plan,
    billing: {
      customerId: ws.billing.customerId,
      subscriptionId: `apple_${decoded.originalTransactionId}`,
      status: "active",
      lookupKey: decoded.productId,
      periodStart: start,
      periodEnd: end,
      cancelAtPeriodEnd: false,
      paymentFailedAt: null,
      mode: "live",
      manageUrl: "https://apps.apple.com/account/subscriptions",
    },
  });
  const row: AppleSubRow = {
    id: decoded.originalTransactionId,
    workspaceId: SYSTEM,
    boundWorkspaceId: ws.id,
    email: ws.ownerEmail,
    productId: decoded.productId,
    plan: decoded.plan,
    environment: decoded.environment,
    latestTransactionId: decoded.transactionId,
    expiresAt: end,
    status: "active",
    appAccountToken: decoded.appAccountToken,
    at: start,
    updatedAt: now(),
  };
  const existing = await subs().get(SYSTEM, decoded.originalTransactionId);
  if (existing) await subs().update(SYSTEM, decoded.originalTransactionId, row);
  else await subs().insert(row);
}

async function revokeApple(ws: WorkspaceRow, originalTransactionId: string, status: "expired" | "revoked" | "past_due") {
  const planStatus = status === "past_due" ? "past_due" : status === "revoked" ? "unpaid" : "canceled";
  if (status === "past_due") {
    await updateWorkspace(ws.id, { billing: { status: "past_due", paymentFailedAt: now() } });
  } else {
    const cur = ws.billing.subscriptionId === `apple_${originalTransactionId}` || (typeof ws.billing.lookupKey === "string" && ws.billing.lookupKey.startsWith("one.keplar."));
    if (cur) {
      await updateWorkspace(ws.id, { plan: "free", billing: { status: planStatus, subscriptionId: null, cancelAtPeriodEnd: false, periodStart: null, periodEnd: null } });
    }
  }
  const existing = await subs().get(SYSTEM, originalTransactionId);
  if (existing) await subs().update(SYSTEM, originalTransactionId, { status, updatedAt: now() });
}

/**
 * Client restore / purchase sync: verify JWS and attach it to the signed-in workspace.
 * The signed-in account is the entitlement owner (appAccountToken is best-effort binding).
 */
export async function syncAppleTransactionForWorkspace(wsRef: { id: string; email?: string | null }, signedTransaction: string): Promise<{ plan: Exclude<PaidPlan, "lite">; originalTransactionId: string; expiresAt: string | null }> {
  const ws = await workspaces().get(wsRef.id, wsRef.id);
  if (!ws) throw Object.assign(new Error("Workspace not found."), { status: 404, code: "no_workspace" });
  const decoded = await verifySignedTransaction(signedTransaction);
  if (decoded.revocationDate) {
    await revokeApple(ws, decoded.originalTransactionId, "revoked");
    throw Object.assign(new Error("This Apple purchase was revoked."), { status: 400, code: "apple_revoked" });
  }
  if (decoded.expiresDate && Date.parse(decoded.expiresDate) < Date.now() - 3 * 864e5) {
    await revokeApple(ws, decoded.originalTransactionId, "expired");
    throw Object.assign(new Error("This Apple subscription has expired."), { status: 400, code: "apple_expired" });
  }
  const prior = await workspaceForOriginal(decoded.originalTransactionId);
  if (prior && prior.id !== ws.id) {
    throw Object.assign(new Error("This Apple purchase is linked to another Keplar account."), { status: 409, code: "apple_bound_elsewhere" });
  }
  await grantApple(ws, { ...decoded, appAccountToken: decoded.appAccountToken ?? appAccountTokenForWorkspace(ws.id) });
  return { plan: decoded.plan, originalTransactionId: decoded.originalTransactionId, expiresAt: decoded.expiresDate };
}

export async function handleAppleNotification(notification: ResponseBodyV2DecodedPayload, notificationUUID: string): Promise<{ result: string }> {
  const existing = await events().get(SYSTEM, notificationUUID);
  if (existing) return { result: existing.result };

  const type = typeof notification.notificationType === "string" ? notification.notificationType : "";
  if (type === NotificationTypeV2.TEST) {
    await events().insert({ id: notificationUUID, workspaceId: SYSTEM, type, at: now(), result: "test_ok" }).catch(() => undefined);
    return { result: "test_ok" };
  }

  const data = notification.data;
  let decoded: DecodedAppleTransaction | null = null;
  if (data?.signedTransactionInfo) {
    try {
      decoded = await verifySignedTransaction(data.signedTransactionInfo);
    } catch {
      decoded = null;
    }
  }

  let result = `ignored:${type || "unknown"}`;
  try {
    if (decoded) {
      const ws = (await workspaceForOriginal(decoded.originalTransactionId)) ?? (await workspaceForToken(decoded.appAccountToken));
      if (!ws) {
        result = "unbound";
        await alertOwner(`Apple ASN unbound (${type})`, `originalTransactionId=${decoded.originalTransactionId} product=${decoded.productId}. User must restore purchases while signed in.`).catch(() => undefined);
      } else if (GRANT_TYPES.has(type) || type === NotificationTypeV2.DID_CHANGE_RENEWAL_PREF) {
        if (!appleEnvironmentAllowed(decoded.environment, ws.ownerEmail)) result = "sandbox_refused";
        else {
          await grantApple(ws, decoded);
          result = `plan=${decoded.plan}`;
        }
      } else if (REVOKE_TYPES.has(type)) {
        const st = type === NotificationTypeV2.REFUND || type === NotificationTypeV2.REVOKE ? "revoked" : "expired";
        await revokeApple(ws, decoded.originalTransactionId, st);
        result = `plan=free:${st}`;
      } else if (PAST_DUE_TYPES.has(type)) {
        await revokeApple(ws, decoded.originalTransactionId, "past_due");
        result = "past_due";
      } else {
        result = `ack:${type}`;
      }
    } else if (!type) {
      result = "no_type";
    } else {
      result = `ack:${type}`;
    }
  } catch (e) {
    console.error("[apple asn] handler failed:", type, e instanceof Error ? e.name : "error");
    throw e;
  }

  const wsId = decoded ? ((await workspaceForOriginal(decoded.originalTransactionId))?.id ?? SYSTEM) : SYSTEM;
  await events().insert({ id: notificationUUID, workspaceId: wsId === SYSTEM ? SYSTEM : SYSTEM, type, at: now(), result }).catch(() => undefined);
  return { result };
}

/**
 * Apply a pre-decoded notification + transaction (unit tests / fixtures). No JWS crypto.
 */
export async function applyDecodedAppleEvent(input: {
  notificationUUID: string;
  type: string;
  workspace: WorkspaceRow;
  decoded: DecodedAppleTransaction;
}): Promise<{ result: string }> {
  const existing = await events().get(SYSTEM, input.notificationUUID);
  if (existing) return { result: existing.result };
  let result = `ignored:${input.type}`;
  if (GRANT_TYPES.has(input.type) || input.type === NotificationTypeV2.DID_CHANGE_RENEWAL_PREF) {
    await grantApple(input.workspace, { ...input.decoded, appAccountToken: input.decoded.appAccountToken ?? appAccountTokenForWorkspace(input.workspace.id) });
    result = `plan=${input.decoded.plan}`;
  } else if (REVOKE_TYPES.has(input.type)) {
    const st = input.type === NotificationTypeV2.REFUND || input.type === NotificationTypeV2.REVOKE ? "revoked" : "expired";
    await revokeApple(input.workspace, input.decoded.originalTransactionId, st);
    result = `plan=free:${st}`;
  } else if (PAST_DUE_TYPES.has(input.type)) {
    await revokeApple(input.workspace, input.decoded.originalTransactionId, "past_due");
    result = "past_due";
  } else if (input.type === NotificationTypeV2.TEST) {
    result = "test_ok";
  }
  await events().insert({ id: input.notificationUUID, workspaceId: SYSTEM, type: input.type, at: now(), result });
  return { result };
}

export { decodeTransactionPayload };
