/**
 * POST /api/inquire — validates an inquiry, saves it (Neon `inquiries` table), then emails
 * the team (Resend → team@keplar.one, Reply-To = the visitor). The visitor only sees success
 * when the email was accepted by Resend; if it wasn't, the row stays in the database
 * (email_status = 'failed') and the visitor gets a clear error.
 */
import { readText } from "@/lib/create/platform/http";
import { createHash } from "node:crypto";
import { clientIpOf, rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { parseInquiry } from "@/lib/inquire/schema";
import { hashIp, markInquiryEmail, saveInquiry } from "@/lib/inquire/store";
import { INQUIRY_TO, sendInquiryEmail } from "@/lib/inquire/mail";
import { brand } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const IP_PER_10_MIN = 5;
const EMAIL_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 60;

const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers?: HeadersInit) => Response.json({ ok: false, error, ...extra }, { status, headers });

export async function POST(request: Request) {
  // Origin check: browsers always send Origin (or Sec-Fetch-Site) on a POST; it must be ours.
  if (!isSameOrigin(request) || (!request.headers.get("origin") && !request.headers.get("sec-fetch-site"))) {
    return fail(403, "Request blocked: cross-site request.");
  }
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return fail(415, "Send the inquiry as JSON.");
  const raw = await readText(request, MAX_BODY_BYTES);
  if (raw === null) return fail(413, "That inquiry is too long.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Invalid JSON.");
  }

  // Honeypot: real people never fill the hidden "website" field. Pretend success, store and send nothing.
  const trap = body && typeof body === "object" ? (body as { website?: unknown }).website : undefined;
  if (typeof trap === "string" && trap.trim()) return Response.json({ ok: true }, { status: 202 });

  const parsed = parseInquiry(body);
  if (!parsed.ok) return fail(422, "Some fields need attention.", { fields: parsed.errors });
  const data = parsed.data;

  const ip = clientIpOf(request);
  try {
    await rateLimit(`inquire:ip:${ip}`, IP_PER_10_MIN, 600, { shared: true });
    await rateLimit(`inquire:email:${createHash("sha256").update(data.email.toLowerCase()).digest("hex").slice(0, 24)}`, EMAIL_PER_HOUR, 3600, { shared: true });
    await rateLimit("inquire:global", GLOBAL_PER_HOUR, 3600, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return fail(429, "You've sent a few inquiries already. Please wait a while, or email us directly.", { code: "rate_limited" }, { "retry-after": String(e.retryAfterSec) });
    throw e;
  }

  // 1. Persist first, so nothing is lost if email fails.
  let saved;
  try {
    saved = await saveInquiry(data, { userAgent: request.headers.get("user-agent"), ipHash: hashIp(ip) });
  } catch (e) {
    console.error("[inquire] could not save inquiry:", e instanceof Error ? e.message : e);
    saved = null;
  }
  const id = saved?.id ?? crypto.randomUUID();
  const receivedAt = saved?.receivedAt ?? new Date().toISOString();

  // 2. Notify the team. Success is only reported when Resend accepted the message.
  const mail = await sendInquiryEmail(data, { id, receivedAt });
  if (mail.ok) {
    if (saved) await markInquiryEmail(id, { status: "sent", emailId: mail.emailId });
    return Response.json({ ok: true, id }, { status: 201 });
  }

  console.error(`[inquire] notification email FAILED for inquiry ${id} (saved: ${saved ? "yes" : "NO"}): ${mail.error}`);
  if (saved) await markInquiryEmail(id, { status: "failed", error: mail.error });
  const direct = `You can also email ${brand.contactEmail || INQUIRY_TO()} directly.`;
  return fail(saved ? 502 : 500, `We couldn't send your inquiry right now. Please try again in a few minutes. ${direct}`, { code: saved ? "email_failed" : "send_failed" });
}
