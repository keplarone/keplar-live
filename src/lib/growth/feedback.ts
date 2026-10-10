/**
 * Feedback and research answers (collection `feedback`). Free text typed by the person, stored as given (trimmed, length-capped,
 * control characters removed). Optional email only when they tick "you may contact me". Rendered as plain text everywhere.
 * Abuse controls: same-origin only (proxy), per-IP and per-account rate limits, honeypot, size caps, no links auto-followed.
 */
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";
import { FEEDBACK_KINDS, LIMITS, RESEARCH_QUESTIONS, ROLES, type FeedbackKind } from "./research";

export type FeedbackRow = {
  id: string;
  workspaceId: string;
  at: string;
  kind: FeedbackKind;
  message: string;
  answers?: Record<string, string>;
  role?: string;
  /** Only set when the person ticked the contact box. */
  email?: string;
  /** Short page or campaign tag, e.g. "pricing", "cancel", "utm:reddit". */
  from?: string;
  signedIn: boolean;
  /** The plan at the time (free, lite, plus, pro), for retention review. Never an account id. */
  plan?: string;
};

const rows = () => collection<FeedbackRow>("feedback");

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,}$/;

export type FeedbackInput = { kind: FeedbackKind; message: string; answers?: Record<string, string>; role?: string; email?: string; from?: string };

export function validateFeedback(body: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim()) return { ok: false, error: "Rejected." }; // honeypot
  const kind = FEEDBACK_KINDS.find((k) => k === b.kind);
  if (!kind) return { ok: false, error: "Choose what this is about." };
  const message = clean(b.message, LIMITS.message);
  const answers: Record<string, string> = {};
  if (b.answers && typeof b.answers === "object") {
    for (const q of RESEARCH_QUESTIONS) {
      const a = clean((b.answers as Record<string, unknown>)[q.key], LIMITS.answer);
      if (a) answers[q.key] = a;
    }
  }
  if (kind === "research" ? Object.keys(answers).length === 0 && !message : !message) return { ok: false, error: kind === "research" ? "Answer at least one question." : "Write a few words first." };
  const role = ROLES.find((r) => r === b.role);
  const contact = b.contactOk === true ? clean(b.email, LIMITS.email) : "";
  if (b.contactOk === true && !EMAIL.test(contact)) return { ok: false, error: "That email address doesn't look right." };
  const from = typeof b.from === "string" && /^[a-z0-9:_.-]{1,60}$/i.test(b.from) ? b.from : undefined;
  return { ok: true, value: { kind, message, ...(Object.keys(answers).length ? { answers } : {}), ...(role ? { role } : {}), ...(contact ? { email: contact } : {}), ...(from ? { from } : {}) } };
}

export async function storeFeedback(input: FeedbackInput, who: { workspaceId: string | null; plan?: string }): Promise<FeedbackRow> {
  return rows().insert({ id: id("fb"), workspaceId: who.workspaceId ?? "anon", at: new Date().toISOString(), signedIn: Boolean(who.workspaceId), ...(who.plan ? { plan: who.plan } : {}), ...input });
}

export async function recentFeedback(limit = 50, days = 90, at = Date.now()): Promise<FeedbackRow[]> {
  return rows().listSystemRange({ field: "at", gte: new Date(at - days * 864e5).toISOString() }, limit);
}

export async function feedbackCounts(days = 30, at = Date.now()): Promise<Record<string, number>> {
  const list = await rows().listSystemRange({ field: "at", gte: new Date(at - days * 864e5).toISOString() }, 5000);
  const out: Record<string, number> = {};
  for (const r of list) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}
