/**
 * Account deletion with a grace period. "Delete my account" schedules the deletion KEPLAR_DELETE_GRACE_DAYS (default 14) days
 * ahead and emails the owner how to cancel; until then nothing is removed and the owner can cancel with one click. A nightly job
 * (the existing learning cron) purges accounts whose date has passed, using the same code as an immediate deletion. "Delete now" skips
 * the wait. Accounts with an active paid subscription are never purged: the owner must cancel billing first (Keplar cannot do that on Whop's side).
 */
import { brand } from "@/lib/site";
import { sendEmail } from "@/lib/accounts/outbox";
import { dueDeletions, persistenceEnabled, revokeAllSessions, setDeletionSchedule } from "@/lib/accounts/persist";
import { forgetAllSessions } from "@/lib/accounts/session-guard";
import { getWorkspace, workspaceIdForUser } from "@/lib/accounts/workspaces";
import { writeAudit } from "@/lib/ops/audit";
import { activeSubscription, deleteLogin, deleteWorkspaceData } from "./account-data";
import { ownedTeam, removeUserFromTeams } from "@/lib/team/store";

export function graceDays(env = process.env.KEPLAR_DELETE_GRACE_DAYS): number {
  const n = Number(env);
  return Number.isFinite(n) && env !== undefined && env !== "" && n >= 0 && n <= 90 ? Math.floor(n) : 14;
}

export const deletionDate = (from: Date, days = graceDays()) => new Date(from.getTime() + days * 86_400_000);

export function scheduledEmail(a: { on: Date; accountUrl: string }) {
  const day = a.on.toISOString().slice(0, 10);
  return {
    subject: `Your ${brand.name} account is scheduled for deletion`,
    text: [
      `You asked to delete your ${brand.name} account.`,
      "",
      `On ${day} (UTC) we will permanently delete your chats, memory, projects, sites, study sets and sign-in. Until then nothing is removed.`,
      "",
      "Changed your mind? Sign in and press Cancel deletion on your Account page, under Your data:",
      a.accountUrl,
      "",
      "If you didn't ask for this, sign in and cancel it, then sign out of all devices from the same page and change your password.",
      "",
      `Payment records and usage counters are kept as described in the privacy policy. ${brand.name} · https://keplar.one`,
    ].join("\n"),
  };
}

export async function scheduleDeletion(user: { id: string; email: string }, now = new Date()): Promise<Date> {
  const on = deletionDate(now);
  await setDeletionSchedule(user.id, on);
  await writeAudit("user", "account.delete_scheduled", `workspace ${workspaceIdForUser(user.id)}`).catch(() => undefined);
  const origin = new URL(process.env.BETTER_AUTH_URL || "https://keplar.one").origin;
  await sendEmail({ to: user.email, kind: "deletion-scheduled", ...scheduledEmail({ on, accountUrl: `${origin}/account#data` }) }).catch(() => false);
  return on;
}

export async function cancelDeletion(userId: string): Promise<void> {
  await setDeletionSchedule(userId, null);
  await writeAudit("user", "account.delete_cancelled", `workspace ${workspaceIdForUser(userId)}`).catch(() => undefined);
}

/** Removes everything now (the shared tail of "delete now" and the nightly purge). */
export async function purgeAccount(user: { id: string; email: string }, wsId: string): Promise<number> {
  await removeUserFromTeams(user.id).catch(() => 0); // leaves every team they were in; what they shared there stays with the team
  const result = await deleteWorkspaceData(wsId);
  await revokeAllSessions(user.id).catch(() => undefined);
  forgetAllSessions();
  await deleteLogin(user.id, user.email);
  return result.deleted;
}

/** Nightly: delete accounts whose grace period ended. Returns counts; never throws for one bad account. */
export async function purgeDueDeletions(now = new Date()): Promise<{ purged: number; skipped: number }> {
  if (!persistenceEnabled()) return { purged: 0, skipped: 0 };
  let purged = 0, skipped = 0;
  for (const u of await dueDeletions(now)) {
    try {
      const wsId = workspaceIdForUser(u.id);
      const row = await getWorkspace(wsId);
      if (row && activeSubscription(row.billing)) {
        skipped++; // still billing: leave it scheduled; the owner must cancel billing first
        continue;
      }
      if (await ownedTeam(u.id).catch(() => null)) {
        skipped++; // owns a team: the owner must export and delete it first (other members' shared work lives there)
        continue;
      }
      await writeAudit("system", "account.delete_purged", `workspace ${wsId}`).catch(() => undefined);
      await purgeAccount(u, wsId);
      purged++;
    } catch {
      skipped++;
    }
  }
  return { purged, skipped };
}
