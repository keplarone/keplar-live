/**
 * New-device sign-in notice. When an account signs in from a browser/OS combination it has never used, the account
 * owner (and only the owner: the address on the account) gets an email with the device, the time, and a one-click
 * "This wasn't me" link that signs every device out. The first sign-in of an account sends nothing. This is a
 * notice, not a block: the sign-in has already been proven by password, email link or Google/Microsoft.
 * Failure to send never fails the sign-in.
 *
 * A known browser/OS on a network the account never signed in from (an attacker with the same common Chrome-on-Windows
 * would otherwise pass unnoticed) is "new_network". The network is coarse (IPv4 /16, IPv6 /32, kept only as a keyed hash:
 * persist.ts hashNetwork), so moving between Wi-Fi and cellular at home doesn't count, and that email goes out at most once
 * a day per account (NEW_NETWORK_NOTICE_SEC), so travel doesn't flood the inbox. Sessions from before the network was
 * recorded have no hash and never make a network "new".
 */
import { brand } from "@/lib/site";
import { createActionToken } from "./action-token";
import { sendEmail } from "./outbox";
import { countHit } from "@/lib/create/platform/ratelimit";
import { deviceLabel, hashNetwork, ipFromHeaders, persistenceEnabled, priorDevices } from "./persist";
import { authSecret } from "./secret";

export type KnownDevice = { userAgent: string; ipHash: string; netHash?: string };

/** At most one "new network" email per account per this many seconds. */
export const NEW_NETWORK_NOTICE_SEC = 24 * 60 * 60;

/**
 * "first" = no earlier sign-in on record, "known" = this browser+OS was used before from a network seen before (or the
 * network can't be told), "new_device" = a browser+OS never used: notify, "new_network" = a known browser+OS from a network
 * none of the account's recorded sign-ins used: notify (rate-limited).
 */
export function judgeSignIn(prior: KnownDevice[], current: { userAgent: string; netHash?: string }): "first" | "known" | "new_device" | "new_network" {
  if (prior.length === 0) return "first";
  const label = deviceLabel(current.userAgent);
  if (!prior.some((p) => deviceLabel(p.userAgent) === label)) return "new_device";
  const nets = prior.map((p) => p.netHash ?? "").filter(Boolean);
  if (!current.netHash || nets.length === 0 || nets.includes(current.netHash)) return "known";
  return "new_network";
}

const VIA: Record<string, string> = { "magic-link": "an email sign-in link", google: "Google", microsoft: "Microsoft", password: "your password", passkey: "a passkey" };

export function newDeviceEmail(a: { device: string; provider: string; at: Date; secureUrl: string; accountUrl: string; newNetwork?: boolean }) {
  const when = a.at.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return {
    subject: `New sign-in to your ${brand.name} account`,
    text: [
      a.newNetwork
        ? `Your ${brand.name} account was just signed in to from a network we haven't seen it use before (on a kind of device it has used).`
        : `Your ${brand.name} account was just signed in to from a device we haven't seen before.`,
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
    const verdict = judgeSignIn(await priorDevices(a.userId), { userAgent, netHash: hashNetwork(ipFromHeaders(a.headers)) });
    if (verdict !== "new_device" && verdict !== "new_network") return;
    if (verdict === "new_network" && (await countHit(`newdev:net:${a.userId}`, NEW_NETWORK_NOTICE_SEC, { shared: true })) > 1) return;
    const origin = new URL(process.env.BETTER_AUTH_URL || "https://keplar.one").origin;
    const token = createActionToken(authSecret(), "secure", { email: a.email, fp: "-" });
    const mail = newDeviceEmail({
      device: deviceLabel(userAgent),
      provider: a.provider,
      at: new Date(),
      secureUrl: `${origin}/secure-account?token=${encodeURIComponent(token)}`,
      accountUrl: `${origin}/account#devices`,
      newNetwork: verdict === "new_network",
    });
    await sendEmail({ to: a.email, kind: "new-device", ...mail });
  } catch {
    console.error("[auth] could not check or send the new-device notice");
  }
}
