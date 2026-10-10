/**
 * Support tickets (collection `support_tickets`). A person writes to the team from /contact; the ticket is stored and shown in
 * /admin/inbox. Nothing is emailed automatically: replies are drafted and sent by a human from team@keplar.one.
 * Signed-in tickets are keyed to the account (removed with it); signed-out tickets live under workspace "anon" and are
 * deleted by hand on request. The optional reply-to email is kept only so a human can answer.
 */
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";

import { TICKET_TOPICS, type TicketTopic } from "./topics";
export { TICKET_TOPICS, TICKET_TOPIC_LABEL } from "./topics";
export type { TicketTopic } from "./topics";

export type TicketRow = {
  id: string;
  workspaceId: string;
  at: string;
  topic: TicketTopic;
  subject: string;
  message: string;
  email: string;
  signedIn: boolean;
  plan?: string;
  status: "open" | "answered" | "closed";
  handledBy?: string;
  handledAt?: string;
};

const rows = () => collection<TicketRow>("support_tickets");
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,}$/;

export type TicketInput = Pick<TicketRow, "topic" | "subject" | "message" | "email">;

export function validateTicket(body: unknown, signedInEmail?: string): { ok: true; value: TicketInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return { ok: false, error: "Rejected." }; // honeypot
  const topic = TICKET_TOPICS.find((t) => t === b.topic);
  if (!topic) return { ok: false, error: "Choose what this is about." };
  const subject = clean(b.subject, 140);
  if (subject.length < 3) return { ok: false, error: "Add a short subject." };
  const message = clean(b.message, 4000);
  if (message.length < 10) return { ok: false, error: "Tell us a little more so we can help (at least a sentence)." };
  const email = clean(b.email, 254) || signedInEmail || "";
  if (!EMAIL.test(email)) return { ok: false, error: "We need an email address that looks right so we can reply." };
  return { ok: true, value: { topic, subject, message, email } };
}

export async function storeTicket(v: TicketInput, who: { workspaceId: string | null; plan?: string }): Promise<TicketRow> {
  return rows().insert({ id: id("tk"), workspaceId: who.workspaceId ?? "anon", at: new Date().toISOString(), signedIn: Boolean(who.workspaceId), ...(who.plan ? { plan: who.plan } : {}), status: "open", ...v });
}

export async function listTickets(limit = 100): Promise<TicketRow[]> {
  const rs = await rows().listSystemRange({ field: "at", gte: new Date(Date.now() - 365 * 864e5).toISOString() }, limit);
  return rs.sort((a, b) => b.at.localeCompare(a.at));
}

export async function setTicketStatus(tid: string, status: TicketRow["status"], by: string): Promise<boolean> {
  const t = await rows().findSystem((r) => r.id === tid);
  if (!t) return false;
  return Boolean(await rows().update(t.workspaceId, tid, { status, handledBy: by, handledAt: new Date().toISOString() }));
}
