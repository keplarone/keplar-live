/**
 * Transactional email. PLACEHOLDER: with RESEND_API_KEY set, mail goes through
 * Resend's HTTP API; otherwise it is written to a local dev outbox
 * (.data/keplar/dev_outbox.json, viewable at /dev/outbox when dev tools are on)
 * and printed to the server log so magic links can be clicked locally.
 */
import { collection } from "@/lib/create/platform/store";
import { id, now } from "@/lib/create/platform/ids";
import { maskEmail } from "@/lib/ops/audit";
import { isProductionRuntime } from "./secret";

export type OutboxMail = { id: string; workspaceId: string; to: string; subject: string; text: string; kind: string; at: string; delivered: boolean };
const outbox = () => collection<OutboxMail>("dev_outbox");
const SYSTEM = "system";

/** Resolves true only when Resend accepted the message. */
export async function sendEmail(input: { to: string; subject: string; text: string; kind: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  let delivered = false;
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.KEPLAR_EMAIL_FROM || "Keplar <no-reply@keplar.one>", to: [input.to], subject: input.subject, text: input.text }),
      signal: AbortSignal.timeout(10_000), // a hung request counts as not delivered (logged and kept below), never a hung sign-in
    }).catch(() => null);
    delivered = Boolean(res?.ok);
  }
  // Bodies (which may hold sign-in links) are only kept/logged in dev tools mode. Recipient addresses are personal data: in
  // production (without dev tools) they are masked in the log and in the stored record.
  const keepBody = devToolsEnabled();
  const to = keepBody || !isProductionRuntime() ? input.to : maskEmail(input.to);
  if (!delivered) console.info(`[outbox] ${input.kind} → ${to}: ${input.subject}${keepBody ? `\n${input.text}` : " (body withheld; set RESEND_API_KEY)"}`);
  if (!delivered && key) console.error(`[outbox] Resend delivery failed for ${input.kind}`);
  await outbox().insert({ id: id("mail"), workspaceId: SYSTEM, ...input, to, text: keepBody ? input.text : "[withheld]", at: now(), delivered });
  return delivered;
}

/** Real email delivery is set up (Resend key present). */
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim());

/** Flows that depend on an email arriving (verify, reset, links) can run: real delivery, or the local dev outbox. */
export const emailAvailable = () => emailConfigured() || devToolsEnabled();

export async function listOutbox() {
  return (await outbox().list(SYSTEM)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
}

/** Dev tools (outbox page, provider chips, demo plan switcher). Off unless KEPLAR_DEV_TOOLS=1 or `next dev`. */
export function devToolsEnabled() {
  return process.env.KEPLAR_DEV_TOOLS === "1" || process.env.NODE_ENV === "development";
}
