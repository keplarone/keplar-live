/**
 * Daily subscription reconciliation, report only. Compares the records the billing webhooks write with each other and with the
 * calendar, and reports rows that disagree. It never changes a plan, a credit or a charge: a person reviews each finding (the
 * fix is usually a missed webhook, replayed from the Whop or App Store dashboard).
 *
 * Checks (pure `reconcile`, unit-tested):
 *   lapsed_still_paid       a paid plan whose period ended more than the grace days ago (access is already Free at request time
 *                           through planLapsed; the row says otherwise, so a renewal or deactivation webhook was missed)
 *   revoked_status_paid     a paid plan on a row whose billing status is canceled or unpaid
 *   free_marked_active      a Free plan with billing status active
 *   refunded_still_paid     a refunded or disputed Whop payment whose membership still holds a paid plan
 *   apple_ended_still_paid  an expired or revoked App Store subscription still holding the plan it granted
 *   stuck_webhook           a webhook claim left "processing" for more than 10 minutes (handler crashed mid-way)
 *
 * Provider-side comparison (asking Whop or Apple for each membership's live state) is not done here; see
 * docs/reliability/production-certification.md.
 */
import { collection } from "@/lib/create/platform/store";
import { alertOwner } from "@/lib/accounts/alerts";
import { isAdminEmail } from "./admin";
import type { WorkspaceRow } from "@/lib/accounts/workspaces";

const PAID = new Set(["lite", "plus", "pro", "business"]);
const DAY = 864e5;

export type FindingKind = "lapsed_still_paid" | "revoked_status_paid" | "free_marked_active" | "refunded_still_paid" | "apple_ended_still_paid" | "stuck_webhook";
/** `ref` is a workspace id or event id: an internal identifier, never an email. */
export type Finding = { kind: FindingKind; ref: string; detail: string };

type Ws = Pick<WorkspaceRow, "id" | "plan" | "billing" | "ownerEmail">;
type Payment = { id: string; membershipId: string | null; refundedAt?: string; disputedAt?: string };
type AppleSub = { id: string; boundWorkspaceId: string; status: string };
type Claim = { id: string; at: string; result: string; source: "whop" | "apple" };

export function reconcile(input: { workspaces: Ws[]; payments: Payment[]; appleSubs: AppleSub[]; claims: Claim[] }, now = Date.now(), graceDays = 3): Finding[] {
  const out: Finding[] = [];
  const byMembership = new Map<string, Ws>();
  const byId = new Map<string, Ws>();
  for (const w of input.workspaces) {
    byId.set(w.id, w);
    if (w.billing.subscriptionId) byMembership.set(w.billing.subscriptionId, w);
  }
  for (const w of input.workspaces) {
    const paid = PAID.has(w.plan);
    if (paid && w.billing.periodEnd && Date.parse(w.billing.periodEnd) < now - graceDays * DAY) {
      out.push({ kind: "lapsed_still_paid", ref: w.id, detail: `${w.plan} plan, period ended ${w.billing.periodEnd}, status ${w.billing.status}` });
    }
    if (paid && (w.billing.status === "canceled" || w.billing.status === "unpaid") && !(w.ownerEmail && isAdminEmail(w.ownerEmail))) {
      out.push({ kind: "revoked_status_paid", ref: w.id, detail: `${w.plan} plan with billing status ${w.billing.status}` });
    }
    if (w.plan === "free" && w.billing.status === "active") {
      out.push({ kind: "free_marked_active", ref: w.id, detail: "Free plan with billing status active" });
    }
  }
  for (const p of input.payments) {
    if (!(p.refundedAt || p.disputedAt) || !p.membershipId) continue;
    const w = byMembership.get(p.membershipId);
    if (w && PAID.has(w.plan) && w.billing.status === "active") {
      out.push({ kind: "refunded_still_paid", ref: w.id, detail: `payment ${p.id} ${p.refundedAt ? `refunded ${p.refundedAt}` : `disputed ${p.disputedAt}`}, membership still ${w.plan}` });
    }
  }
  for (const s of input.appleSubs) {
    if (s.status !== "expired" && s.status !== "revoked") continue;
    const w = byId.get(s.boundWorkspaceId);
    if (w && PAID.has(w.plan) && w.billing.subscriptionId === `apple_${s.id}`) {
      out.push({ kind: "apple_ended_still_paid", ref: w.id, detail: `App Store subscription ${s.status}, workspace still ${w.plan}` });
    }
  }
  for (const c of input.claims) {
    if (c.result === "processing" && now - Date.parse(c.at) > 10 * 60_000) {
      out.push({ kind: "stuck_webhook", ref: c.id, detail: `${c.source} event claimed at ${c.at} never finished` });
    }
  }
  return out;
}

export type ReconcileResult = { checked: number; findings: Finding[]; alerted: boolean };

const KIND_LABEL: Record<FindingKind, string> = {
  lapsed_still_paid: "Paid plan past its period (renewal or deactivation webhook missed)",
  revoked_status_paid: "Paid plan on a cancelled or unpaid row",
  free_marked_active: "Free plan marked active",
  refunded_still_paid: "Refunded or disputed payment still holding a plan",
  apple_ended_still_paid: "Ended App Store subscription still holding a plan",
  stuck_webhook: "Webhook claim stuck in processing",
};

type Snapshot = { id: string; workspaceId: "system"; at: string; checked: number; counts: Record<string, number> };

export async function runReconciliation(now = Date.now(), notify: (subject: string, text: string) => Promise<void> = alertOwner): Promise<ReconcileResult> {
  const since = new Date(now - 7 * DAY).toISOString();
  const [workspaces, payments, appleSubs, whopClaims, appleClaims] = await Promise.all([
    collection<WorkspaceRow>("accounts_workspaces").listSystem(),
    collection<Payment & { workspaceId: string }>("whop_payments").listSystem((p) => Boolean(p.refundedAt || p.disputedAt)),
    collection<AppleSub & { workspaceId: string }>("apple_subscriptions").listSystem((s) => s.status === "expired" || s.status === "revoked"),
    collection<{ id: string; workspaceId: string; at: string; result: string }>("billing_events").listSystemRange({ field: "at", gte: since }, 5000),
    collection<{ id: string; workspaceId: string; at: string; result: string }>("apple_billing_events").listSystemRange({ field: "at", gte: since }, 5000),
  ]);
  const claims: Claim[] = [...whopClaims.map((c) => ({ ...c, source: "whop" as const })), ...appleClaims.map((c) => ({ ...c, source: "apple" as const }))];
  const findings = reconcile({ workspaces, payments, appleSubs, claims }, now);
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  const day = new Date(now).toISOString().slice(0, 10);
  const snap: Snapshot = { id: day, workspaceId: "system", at: new Date(now).toISOString(), checked: workspaces.length, counts };
  const snaps = collection<Snapshot>("system_billing_reconcile");
  await snaps.insertIfAbsent(snap).then((r) => (r.inserted ? undefined : snaps.update("system", day, snap))).catch(() => undefined);
  let alerted = false;
  if (findings.length) {
    const lines = (Object.keys(KIND_LABEL) as FindingKind[]).filter((k) => counts[k]).map((k) => {
      const rows = findings.filter((f) => f.kind === k).slice(0, 10).map((f) => `  - ${f.ref}: ${f.detail}`);
      return [`${KIND_LABEL[k]}: ${counts[k]}`, ...rows].join("\n");
    });
    await notify(`Billing reconciliation: ${findings.length} record${findings.length === 1 ? "" : "s"} to review`, [`Checked ${workspaces.length} workspaces at ${new Date(now).toISOString()}. Nothing was changed automatically.`, "", ...lines, "", "Replay missed webhooks from the Whop or App Store dashboard, or correct the row in /admin."].join("\n")).catch(() => undefined);
    alerted = true;
  }
  return { checked: workspaces.length, findings, alerted };
}

export async function lastReconciliation(): Promise<Snapshot | null> {
  const rows = await collection<Snapshot>("system_billing_reconcile").listSystemRange({ field: "at", gte: new Date(Date.now() - 14 * DAY).toISOString() }, 30);
  return rows.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}
