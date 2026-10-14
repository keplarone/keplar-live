/**
 * Space Studio billing webhook (POST /api/space-studio/billing/webhook). The ONLY way a paid Space Studio plan is set from outside
 * (besides an admin grant): a billing provider event signed with SPACE_STUDIO_BILLING_WEBHOOK_SECRET.
 *
 * Signature: header `x-space-signature: sha256=<hex>` = HMAC-SHA256(secret, `${x-space-timestamp}.${raw body}`), compared in constant
 * time; `x-space-timestamp` (unix seconds) must be within 5 minutes. Payload (JSON):
 *   { id, type: "subscription.activated"|"renewed"|"canceled"|"expired"|"revoked"|"past_due", workspaceId, plan, periodEnd: ISO|null,
 *     occurredAt: unix ms | ISO }
 * Plans and dates come only from this verified payload; prices are never read (none are published).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlanId, type BillingEvent } from "./core";

export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;
export const webhookSecret = (env: Record<string, string | undefined> = process.env) => env.SPACE_STUDIO_BILLING_WEBHOOK_SECRET?.trim() || "";

export const signPayload = (secret: string, ts: string, raw: string) => `sha256=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;

export function verifySpaceSignature(raw: string, headers: { get(name: string): string | null }, secret: string, nowMs = Date.now()): boolean {
  const sig = headers.get("x-space-signature") ?? "";
  const ts = headers.get("x-space-timestamp") ?? "";
  if (!secret || !/^sha256=[0-9a-f]{64}$/.test(sig) || !/^\d{9,12}$/.test(ts)) return false;
  if (Math.abs(nowMs - Number(ts) * 1000) > WEBHOOK_TOLERANCE_MS) return false;
  const want = Buffer.from(signPayload(secret, ts, raw));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

const TYPES = new Set<BillingEvent["type"]>(["subscription.activated", "subscription.renewed", "subscription.canceled", "subscription.expired", "subscription.revoked", "subscription.past_due"]);

/** Maps a verified payload to a core BillingEvent + target workspace. Null when malformed. */
export function parseBillingEvent(raw: string): { workspaceId: string; event: BillingEvent } | null {
  let p: Record<string, unknown>;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    p = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const id = typeof p.id === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(p.id) ? p.id : null;
  const type = typeof p.type === "string" && TYPES.has(p.type as BillingEvent["type"]) ? (p.type as BillingEvent["type"]) : null;
  const workspaceId = typeof p.workspaceId === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(p.workspaceId) ? p.workspaceId : null;
  const occurredAt = typeof p.occurredAt === "number" ? p.occurredAt : typeof p.occurredAt === "string" ? Date.parse(p.occurredAt) : NaN;
  const periodEnd = p.periodEnd === null || p.periodEnd === undefined ? null : typeof p.periodEnd === "string" && Number.isFinite(Date.parse(p.periodEnd)) ? new Date(p.periodEnd).toISOString() : undefined;
  if (!id || !type || !workspaceId || !isPlanId(p.plan) || !Number.isFinite(occurredAt) || occurredAt <= 0 || periodEnd === undefined) return null;
  return { workspaceId, event: { id: `wh:${id}`, type, plan: p.plan, periodEnd, occurredAt } };
}
