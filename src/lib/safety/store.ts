/**
 * Safety records (collections in the shared store, system workspace):
- system_abuse_reports   a person reported an answer (or anything else) from the app. Stored for the admin view; NEVER auto-emailed.
- system_safety_events   the input screen refused a prompt. Category + hashed-free metadata only: the prompt text is NOT stored.
 */
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";

import { REPORT_CATEGORIES, type ReportCategory } from "./categories";
export { REPORT_CATEGORIES, REPORT_LABEL } from "./categories";
export type { ReportCategory } from "./categories";

export type ReportRow = {
  id: string;
  workspaceId: string;
  at: string;
  category: ReportCategory;
  note: string;
  /** The reported answer's id (client-side id of the card) and chat id, when sent. */
  answerId?: string;
  chatId?: string;
  /** Start of the reported answer text (<= 400 chars), so the team can see what was reported without opening the chat. Only sent by the reporter. */
  excerpt?: string;
  accountId: string | null;
  plan?: string;
  status: "open" | "reviewed" | "dismissed";
  reviewedBy?: string;
  reviewedAt?: string;
};

export type SafetyEventRow = { id: string; workspaceId: string; at: string; category: string; action: "refuse" | "crisis"; plan?: string; signedIn: boolean };

const reports = () => collection<ReportRow>("system_abuse_reports");
const events = () => collection<SafetyEventRow>("system_safety_events");
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const SAFE_ID = /^[A-Za-z0-9_:.-]{1,100}$/;

export function validateReport(body: unknown): { ok: true; value: Pick<ReportRow, "category" | "note" | "answerId" | "chatId" | "excerpt"> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return { ok: false, error: "Rejected." }; // honeypot
  const category = REPORT_CATEGORIES.find((c) => c === b.category);
  if (!category) return { ok: false, error: "Choose what is wrong with the answer." };
  const note = clean(b.note, 1000);
  if (category === "other" && !note) return { ok: false, error: "Add a few words about what is wrong." };
  const answerId = typeof b.answerId === "string" && SAFE_ID.test(b.answerId) ? b.answerId : undefined;
  const chatId = typeof b.chatId === "string" && SAFE_ID.test(b.chatId) ? b.chatId : undefined;
  const excerpt = clean(b.excerpt, 400);
  return { ok: true, value: { category, note, ...(answerId ? { answerId } : {}), ...(chatId ? { chatId } : {}), ...(excerpt ? { excerpt } : {}) } };
}

export async function storeReport(v: Pick<ReportRow, "category" | "note" | "answerId" | "chatId" | "excerpt">, who: { accountId: string | null; plan?: string }): Promise<ReportRow> {
  return reports().insert({ id: id("rp"), workspaceId: "system", at: new Date().toISOString(), accountId: who.accountId, ...(who.plan ? { plan: who.plan } : {}), status: "open", ...v });
}

export async function listReports(limit = 100): Promise<ReportRow[]> {
  const rows = await reports().listSystemRange({ field: "at", gte: new Date(Date.now() - 365 * 864e5).toISOString() }, limit);
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function setReportStatus(rid: string, status: ReportRow["status"], by: string): Promise<boolean> {
  const row = await reports().update("system", rid, { status, reviewedBy: by, reviewedAt: new Date().toISOString() });
  return Boolean(row);
}

/**
 * Fire-and-forget for callers (a logging hiccup never changes the reply; it never rejects). The returned promise settles when the row is
 * written, so a test can await it instead of sleeping. Stores the category only, never the prompt.
 */
export function recordSafetyEvent(e: { category: string; action: "refuse" | "crisis"; plan?: string; signedIn: boolean }): Promise<void> {
  return events().insert({ id: id("se"), workspaceId: "system", at: new Date().toISOString(), ...e }).then(() => undefined, () => undefined);
}

export async function recentSafetyEvents(days = 30, limit = 200): Promise<SafetyEventRow[]> {
  return events().listSystemRange({ field: "at", gte: new Date(Date.now() - days * 864e5).toISOString() }, limit);
}
