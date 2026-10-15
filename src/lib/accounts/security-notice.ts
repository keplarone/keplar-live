/**
 * Security-change notices: the account owner (the address on the account, and only that) is emailed when two-factor
 * sign-in is turned on or off, recovery codes are replaced, a passkey is added or removed, an API key is created, or two-factor
 * codes were locked after too many wrong ones.
 * Same plain-text style as the new-device notice (./new-device.ts), with the same "wasn't you? sign out everywhere"
 * path. A notice, never a gate: a failed send is logged and never fails the change itself.
 */
import { brand } from "@/lib/site";
import { createActionToken } from "./action-token";
import { sendEmail } from "./outbox";
import { deviceLabel } from "./persist";
import { authSecret } from "./secret";

export type SecurityChange = "mfa_enabled" | "mfa_disabled" | "recovery_regenerated" | "passkey_added" | "passkey_removed" | "api_key_created" | "mfa_locked";

const WHAT: Record<SecurityChange, { subject: string; line: string }> = {
  mfa_enabled: { subject: "Two-factor sign-in was turned on", line: "Two-factor sign-in was turned on for your account. Signing in now also asks for a code from your authenticator app." },
  mfa_disabled: { subject: "Two-factor sign-in was turned off", line: "Two-factor sign-in was turned off for your account. Signing in no longer asks for an authenticator code." },
  recovery_regenerated: { subject: "New two-factor recovery codes were made", line: "New recovery codes were made for your account's two-factor sign-in. The old ones no longer work." },
  passkey_added: { subject: "A passkey was added to your account", line: "A passkey was added to your account. It can now be used to sign in." },
  passkey_removed: { subject: "A passkey was removed from your account", line: "A passkey was removed from your account. It can no longer be used to sign in." },
  api_key_created: { subject: "A new API key was created", line: "A new API key was created for your account. It can use the Keplar API on your behalf until it is revoked or expires." },
  mfa_locked: {
    subject: "Too many wrong two-factor codes",
    line: "Someone entered too many wrong two-factor codes for your account, so codes are paused for an hour. To get that far they needed your password or a signed-in session. If it wasn't you, change your password now.",
  },
};

export function securityChangeEmail(a: { change: SecurityChange; device: string; at: Date; detail?: string | null; secureUrl: string; accountUrl: string }) {
  const w = WHAT[a.change];
  const when = a.at.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return {
    subject: `${w.subject} (${brand.name})`,
    text: [
      w.line,
      "",
      ...(a.detail ? [`Name: ${a.detail}`] : []),
      `Device: ${a.device}`,
      `Time: ${when}`,
      "",
      "If this was you, you don't need to do anything.",
      "",
      "If it was not you, sign out of every device now:",
      a.secureUrl,
      "",
      "Then review two-factor sign-in, passkeys and API keys on your Account page:",
      a.accountUrl,
      "",
      `This email goes only to the address on the account. ${brand.name} · https://keplar.one`,
    ].join("\n"),
  };
}

/** Email the owner about a security change. Never throws. `detail` is a short, non-secret label (a key's name). */
export async function notifySecurityChange(email: string, change: SecurityChange, headers?: Headers | null, detail?: string | null): Promise<void> {
  try {
    const origin = new URL(process.env.BETTER_AUTH_URL || "https://keplar.one").origin;
    const token = createActionToken(authSecret(), "secure", { email, fp: "-" });
    const mail = securityChangeEmail({
      change,
      device: deviceLabel((headers?.get("user-agent") ?? "").slice(0, 300)),
      at: new Date(),
      detail: detail ? detail.slice(0, 80) : null,
      secureUrl: `${origin}/secure-account?token=${encodeURIComponent(token)}`,
      accountUrl: `${origin}/account`,
    });
    await sendEmail({ to: email, kind: "security-change", ...mail });
  } catch {
    console.error("[auth] could not send the security-change notice");
  }
}
