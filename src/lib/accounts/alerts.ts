/** Owner alerts (spend caps, payment failures). Email via the outbox + optional Slack-compatible webhook. */
import { brand } from "@/lib/site";
import { sendEmail } from "./outbox";

export async function alertOwner(subject: string, text: string) {
  const to = process.env.KEPLAR_OWNER_EMAIL || brand.contactEmail;
  await sendEmail({ to, subject: `[Keplar alert] ${subject}`, text, kind: "owner-alert" });
  const hook = process.env.KEPLAR_ALERT_WEBHOOK_URL;
  if (hook) {
    await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `*${subject}*\n${text}` }) }).catch(() => undefined);
  }
}
