// Server-only. Notification email for a new inquiry, sent through Resend's HTTP API.
import type { Inquiry } from "./schema";

export const INQUIRY_TO = () => process.env.KEPLAR_INQUIRY_TO?.trim() || "team@keplar.one";
export const INQUIRY_FROM = () => process.env.KEPLAR_INQUIRY_FROM?.trim() || "Keplar Inquiries <no-reply@keplar.one>";

export type MailResult = { ok: true; emailId: string } | { ok: false; error: string; status?: number };

const oneLine = (s: string, max = 200) => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim().slice(0, max);

export function inquirySubject(d: Inquiry): string {
  const topics = d.interests.length ? d.interests.join(", ") : "General";
  return oneLine(`New inquiry: ${topics} — ${d.name}${d.company ? ` (${d.company})` : ""}`, 200);
}

/** Plain-text body with every form field. Plain text means nothing the visitor typed can be interpreted as markup. */
export function inquiryText(d: Inquiry, meta: { id: string; receivedAt: string }): string {
  const rows: [string, string][] = [
    ["Name", d.name],
    ["Email", d.email],
    ["Company", d.company || "—"],
    ["Company size", d.companySize || "—"],
    ["Interested in", d.interests.join(", ") || "—"],
  ];
  if (d.business) {
    rows.push(["Estimated users", d.business.estimatedUsers || "—"], ["Primary use case", d.business.useCase || "—"], ["Expected usage", d.business.expectedUsage || "—"]);
  }
  const lines = rows.map(([k, v]) => `${k}: ${v}`);
  if (d.business?.handle) lines.push("", "What they'd like Keplar to handle:", d.business.handle);
  lines.push("", "Message:", d.message, "", "—", `Reply to this email to answer ${d.name} directly (Reply-To is ${d.email}).`, `Inquiry ${meta.id} · received ${meta.receivedAt}`);
  return lines.join("\n");
}

/**
 * Sends the notification. Resolves to a result instead of throwing, and only reports ok
 * when Resend accepted the message and returned its id.
 */
export async function sendInquiryEmail(d: Inquiry, meta: { id: string; receivedAt: string }): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": `inquiry-${meta.id}` },
      body: JSON.stringify({ from: INQUIRY_FROM(), to: [INQUIRY_TO()], reply_to: d.email, subject: inquirySubject(d), text: inquiryText(d, meta) }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, error: `Resend request failed: ${e instanceof Error ? e.message : "network error"}` };
  }
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
  if (!res.ok || !body?.id) {
    return { ok: false, status: res.status, error: `Resend HTTP ${res.status}${body?.name ? ` ${body.name}` : ""}${body?.message ? `: ${body.message}` : ""}` };
  }
  return { ok: true, emailId: body.id };
}
