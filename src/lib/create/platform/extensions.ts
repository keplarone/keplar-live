/**
 * Extension ledger: credits a user bought after hitting a limit. One row per verified Whop payment (id = ext_<paymentId>,
 * so a replayed webhook can never grant twice). Rows are spent oldest-expiry first, only after the plan's own allowance or
 * rolling window is used up (compute.ts), and they expire. A refund or dispute zeroes the unspent remainder.
 * Collection `limit_extensions` is a financial record (kept on account deletion, see privacy/account-data.ts).
 */
import { collection } from "./store";
import { now } from "./ids";

export type ExtensionRow = {
  id: string;
  workspaceId: string;
  paymentId: string;
  pack: string;
  /** Credits granted. */
  credits: number;
  /** Credits still spendable. */
  remaining: number;
  status: "active" | "revoked";
  grantedAt: string;
  expiresAt: string;
  whopPlanId?: string;
  /** What Whop says was charged (USD) and the amount after Whop's fees, when the payment carried them. */
  amountUsd?: number;
  netUsd?: number;
  revokedAt?: string;
  revokeReason?: string;
};

const rows = () => collection<ExtensionRow>("limit_extensions");
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 864e5).toISOString();
export const extensionRowId = (paymentId: string) => `ext_${paymentId}`;

export type GrantInput = { workspaceId: string; paymentId: string; pack: string; credits: number; validDays: number; whopPlanId?: string; paidAt?: string | null; amountUsd?: number; netUsd?: number };

/** Record a verified purchase. Idempotent by payment id: a second call returns the first row and `granted:false`. */
export async function grantExtension(input: GrantInput): Promise<{ row: ExtensionRow; granted: boolean }> {
  const credits = Math.floor(input.credits);
  if (!input.paymentId || !(credits > 0)) throw new Error("A grant needs a payment id and a positive number of credits.");
  const existing = await rows().findSystemBy("paymentId", input.paymentId);
  if (existing) return { row: existing, granted: false };
  const at = input.paidAt && Number.isFinite(Date.parse(input.paidAt)) ? input.paidAt : now();
  const row: ExtensionRow = {
    id: extensionRowId(input.paymentId),
    workspaceId: input.workspaceId,
    paymentId: input.paymentId,
    pack: input.pack,
    credits,
    remaining: credits,
    status: "active",
    grantedAt: at,
    expiresAt: addDays(at, input.validDays),
    whopPlanId: input.whopPlanId,
    ...(input.amountUsd !== undefined ? { amountUsd: input.amountUsd } : {}),
    ...(input.netUsd !== undefined ? { netUsd: input.netUsd } : {}),
  };
  const r = await rows().insertIfAbsent(row);
  return { row: r.row, granted: r.inserted };
}

const live = (r: ExtensionRow, at: number) => r.status === "active" && r.remaining > 0 && Date.parse(r.expiresAt) > at;

export async function activeExtensions(workspaceId: string, at = Date.now()): Promise<ExtensionRow[]> {
  return (await rows().list(workspaceId, (r) => live(r, at))).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export async function extensionBalance(workspaceId: string, at = Date.now()): Promise<number> {
  return (await activeExtensions(workspaceId, at)).reduce((n, r) => n + r.remaining, 0);
}

export type ExtensionSummary = { balance: number; expiresAt: string | null; latestGrantAt: string | null; grants: { credits: number; remaining: number; expiresAt: string }[] };

export async function extensionSummary(workspaceId: string, at = Date.now()): Promise<ExtensionSummary> {
  const act = await activeExtensions(workspaceId, at);
  return {
    balance: act.reduce((n, r) => n + r.remaining, 0),
    expiresAt: act[0]?.expiresAt ?? null,
    latestGrantAt: act.map((r) => r.grantedAt).sort().pop() ?? null,
    grants: act.map((r) => ({ credits: r.credits, remaining: r.remaining, expiresAt: r.expiresAt })),
  };
}

/**
 * Spend up to `units` from the soonest-expiring grants. Returns how many were actually taken (can be less than asked).
 * Each debit is an atomic increment; if a racing spender took the same credits, the overdraw is handed back and not counted.
 */
export async function drawExtension(workspaceId: string, units: number, at = Date.now()): Promise<number> {
  let need = Math.ceil(units);
  let taken = 0;
  if (!(need > 0)) return 0;
  for (const g of await activeExtensions(workspaceId, at)) {
    if (need <= 0) break;
    const take = Math.min(g.remaining, need);
    const after = await rows().increment(workspaceId, g.id, { remaining: -take }, g);
    // `after` is the value right after OUR atomic debit, so what was there before it is after + take: only that much was ours to take.
    const got = Math.max(0, Math.min(take, after.remaining + take));
    if (got < take) await rows().increment(workspaceId, g.id, { remaining: take - got }, g);
    taken += got;
    need -= got;
  }
  return taken;
}

/** Refund or dispute: the unspent remainder is gone. Spent credits are not clawed back (they bought real model calls). */
export async function revokeExtensionByPayment(paymentId: string, reason: string): Promise<ExtensionRow | null> {
  const row = await rows().findSystemBy("paymentId", paymentId);
  if (!row) return null;
  if (row.status === "revoked") return row;
  return (await rows().update(row.workspaceId, row.id, { status: "revoked", remaining: 0, revokedAt: now(), revokeReason: reason })) ?? row;
}

export const extensionForPayment = (paymentId: string) => rows().findSystemBy("paymentId", paymentId);
