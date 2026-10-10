/**
 * New-device sign-in notice. When an account signs in from a browser/OS combination it has never used, the account
 * owner (and only the owner: the address on the account) gets an email with the device, the time, and a one-click
 * "This wasn't me" link that signs every device out. The first sign-in of an account sends nothing. This is a
 * notice, not a block: the sign-in has already been proven by password, email link or Google/Microsoft.
 * Failure to send never fails the sign-in.
 */
import { brand } from "@/lib/site";
import { createActionToken } from "./action-token";
import { sendEmail } from "./outbox";
import { deviceLabel, persistenceEnabled, priorDevices } from "./persist";
import { authSecret } from "./secret";

export type KnownDevice = { userAgent: string; ipHash: string };

/** "first" = no earlier sign-in on record, "known" = this browser+OS was used before, "new_device" = notify. */
export function judgeSignIn(prior: KnownDevice[], current: { userAgent: string }): "first" | "known" | "new_device" {
  if (prior.length === 0) return "first";
  const label = deviceLabel(current.userAgent);
  return prior.some((p) => deviceLabel(p.userAgent) === label) ? "known" : "new_device";
}

const VIA: Record<string, string> = { "magic-link": "an email sign-in link", google: "Google", microsoft: "Microsoft", password: "your password", passkey: "a passkey" };

export function newDeviceEmail(a: { device: string; provider: string; at: Date; secureUrl: string; accountUrl: string }) {
  const when = a.at.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return {
    subject: `New sign-in to your ${brand.name} account`,
    text: [
      `Your ${brand.name} account was just signed in to from a device we haven't seen before.`,
      "",
      `Device: ${a.device}`,
      `Time: ${when}`,
      `Signed in with: ${VIA[a.provider] ?? "your account"}`,
      "",
      "If this was you, you don't need to do anything.",
      "",
      "If it was not you, sign out of every device now:",
      a.secureUrl,
      "",
      "Then change your password (if you use one) from the Log in page: Forgot password. You can also review and sign out single devices on your Account page:",
      a.accountUrl,
      "",
      `This email goes only to the address on the account. ${brand.name} · https://keplar.one`,
    ].join("\n"),
  };
}

export async function noticeIfNewDevice(a: { userId: string; email: string; headers: Headers | null | undefined; provider: string }): Promise<void> {
  if (!persistenceEnabled()) return;
  try {
    const userAgent = (a.headers?.get("user-agent") ?? "").slice(0, 300);
    const verdict = judgeSignIn(await priorDevices(a.userId), { userAgent });
    if (verdict !== "new_device") return;
    const origin = new URL(process.env.BETTER_AUTH_URL || "https://keplar.one").origin;
    const token = createActionToken(authSecret(), "secure", { email: a.email, fp: "-" });
    const mail = newDeviceEmail({
      device: deviceLabel(userAgent),
      provider: a.provider,
      at: new Date(),
      secureUrl: `${origin}/secure-account?token=${encodeURIComponent(token)}`,
      accountUrl: `${origin}/account#devices`,
    });
    await sendEmail({ to: a.email, kind: "new-device", ...mail });
  } catch {
    console.error("[auth] could not check or send the new-device notice");
  }
}
