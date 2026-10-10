// Server-only. Every piece of feedback is also emailed to the team (brand.feedbackEmail = team@keplar.one) through Resend,
// using the same sender as inquiry notifications. Never includes an account id.
import { brand } from "@/lib/site";
import { INQUIRY_FROM } from "@/lib/inquire/mail";
import { KIND_LABEL, RESEARCH_QUESTIONS } from "./research";
import type { FeedbackRow } from "./feedback";

export const FEEDBACK_TO = () => brand.feedbackEmail;

export type FeedbackMailResult = { ok: true; emailId: string } | { ok: false; error: string };

const oneLine = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim().slice(0, max);

export function feedbackSubject(r: Pick<FeedbackRow, "kind" | "message" | "answers">): string {
  const first = r.message || Object.values(r.answers ?? {})[0] || "";
  return oneLine(`Keplar feedback (${KIND_LABEL[r.kind] ?? r.kind})${first ? `: ${first}` : ""}`, 120);
}

/** Plain text only, so nothing the person typed can be read as markup. */
export function feedbackText(r: FeedbackRow): string {
  const lines = [
    `Type: ${KIND_LABEL[r.kind] ?? r.kind}`,
    `From: ${r.from || "—"}`,
    `Signed in: ${r.signedIn ? `yes${r.plan ? ` (${r.plan})` : ""}` : "no"}`,
    `Role: ${r.role || "—"}`,
    `Contact allowed: ${r.email ? `yes, ${r.email}` : "no (anonymous)"}`,
  ];
  if (r.message) lines.push("", "Message:", r.message);
  if (r.answers) {
    lines.push("", "Answers:");
    for (const q of RESEARCH_QUESTIONS) if (r.answers[q.key]) lines.push(`- ${q.q}`, `  ${r.answers[q.key]}`);
  }
  lines.push("", "—", r.email ? `Reply to this email to answer them (Reply-To is ${r.email}).` : "They chose to stay anonymous: there is no one to reply to.", `Feedback ${r.id} · received ${r.at}`);
  return lines.join("\n");
}

/** Resolves to a result instead of throwing; ok only when Resend accepted the message and returned an id. */
export async function sendFeedbackEmail(r: FeedbackRow): Promise<FeedbackMailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": `feedback-${r.id}` },
      body: JSON.stringify({ from: INQUIRY_FROM(), to: [FEEDBACK_TO()], ...(r.email ? { reply_to: r.email } : {}), subject: feedbackSubject(r), text: feedbackText(r) }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    return { ok: false, error: `Resend request failed: ${e instanceof Error ? e.message : "network error"}` };
  }
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (!res.ok || !body?.id) return { ok: false, error: `Resend HTTP ${res.status}${body?.name ? ` ${body.name}` : ""}${body?.message ? `: ${body.message}` : ""}` };
  return { ok: true, emailId: body.id };
}
