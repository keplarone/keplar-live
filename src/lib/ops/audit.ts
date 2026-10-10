/**
 * Admin audit log: every kill-switch change and admin-side action is recorded (who, what, when, why).
 * Stored in the shared store (Neon in production) under the system tenant. Emails are masked on display.
 */
import { collection } from "@/lib/create/platform/store";
import { id, now } from "@/lib/create/platform/ids";

export type AuditRow = { id: string; workspaceId: string; at: string; actor: string; action: string; detail: string };
const rows = () => collection<AuditRow>("admin_audit");
const SYSTEM = "system";

export async function writeAudit(actor: string, action: string, detail = ""): Promise<AuditRow> {
  const row: AuditRow = { id: id("aud"), workspaceId: SYSTEM, at: now(), actor: actor.slice(0, 120), action: action.slice(0, 80), detail: detail.slice(0, 500) };
  await rows().insert(row);
  return row;
}

export async function recentAudit(limit = 100): Promise<AuditRow[]> {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  return (await rows().listSystemRange({ field: "at", gte: since }, limit)).slice(0, limit);
}

/** a***@domain.com: enough to recognise an account, not enough to leak it. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [u, d] = email.split("@");
  if (!d) return "***";
  return `${u.slice(0, 1)}***@${d}`;
}
