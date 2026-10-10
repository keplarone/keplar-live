/**
 * Abuse heuristics for the referral program. Pure functions (no store, no network) so they are easy to test.
 * Nothing here is a verdict about a person: a "block" is a rule the terms state (one reward per account, no self-referral,
 * no throwaway mailboxes) and a "hold" only sends the claim to a human (admin) instead of granting it at once.
 */
import { createHmac } from "node:crypto";

/** Throwaway-mailbox domains. Not exhaustive on purpose: the one-reward-per-account and per-referrer caps do the rest. Extend with KEPLAR_REFERRAL_BLOCK_DOMAINS. */
export const DISPOSABLE_DOMAINS = [
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "grr.la", "10minutemail.com", "10minutemail.net",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmailo.com", "tempail.com", "throwawaymail.com", "yopmail.com", "yopmail.net", "yopmail.fr",
  "trashmail.com", "trashmail.net", "trashmail.de", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com", "mintemail.com",
  "fakeinbox.com", "mohmal.com", "emailondeck.com", "burnermail.io", "spamgourmet.com", "mytemp.email", "moakt.com", "tmpmail.org", "tmpmail.net",
  "mail.tm", "discard.email", "mailcatch.com", "inboxkitten.com", "harakirimail.com", "33mail.com", "anonaddy.com", "simplelogin.com", "dropmail.me",
  "emailfake.com", "fakemailgenerator.com", "gettempmail.com", "tempinbox.com", "spambox.us", "jetable.org", "getairmail.com", "mailforspam.com", "byom.de",
] as const;

/** Large public mailbox providers: two people sharing one is normal, so a shared domain says nothing here. */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me", "aol.com", "gmx.com", "gmx.de", "mail.com", "zoho.com", "fastmail.com", "hey.com", "qq.com", "163.com",
]);

const extra = () => (process.env.KEPLAR_REFERRAL_BLOCK_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

export const domainOf = (email: string) => email.trim().toLowerCase().slice(email.trim().lastIndexOf("@") + 1);

export function isDisposableDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  const list = [...DISPOSABLE_DOMAINS, ...extra()];
  return list.some((x) => d === x || d.endsWith(`.${x}`));
}

/**
 * One mailbox, one identity: lower-case, Gmail ignores dots and "+tag", and most providers ignore "+tag". Used only to tell whether two
 * sign-ups are the same mailbox (so `a.b+1@gmail.com` and `ab@gmail.com` cannot both earn a reward).
 */
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  local = local.split("+")[0] ?? local;
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** a***@example.com — enough for an admin or the referrer to recognise a person, not enough to contact them. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** Coarse network id: IPv4 /24 or IPv6 /48, so a household or an office shares one value but a different network does not. */
export function networkOf(ip: string): string | null {
  const v = ip.trim().toLowerCase();
  if (!v || v === "local" || v === "unknown") return null;
  const v4 = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (v.includes(":")) return `${v.split(":").slice(0, 3).join(":")}::/48`;
  return null;
}

/** Keyed hash, so a stored value can be compared but not read back as an address or a cookie. */
export const hashSignal = (secret: string, kind: "ip" | "dev" | "email", value: string) => createHmac("sha256", secret).update(`ref:${kind}:${value}`).digest("hex").slice(0, 32);

export type Signals = { emailHash: string; domain: string; ipHash: string | null; deviceHash: string | null };
export type Peer = { ipHash: string | null; deviceHash: string | null; emailHash: string; domain: string; status: string };
export type ReferrerView = { workspaceId: string; emailHash: string; domain: string; deviceHashes: string[]; ipHashes: string[]; createdAt: string };

export type Verdict =
  | { action: "block"; reasons: string[] }
  | { action: "hold"; reasons: string[] }
  | { action: "grant"; reasons: string[] };

/**
 * Decide what happens to a claim. `earlier` are the other claims already on file (any status). Blocks win over holds; a hold needs a human.
 */
export function assess(input: {
  friend: Signals & { workspaceId: string };
  referrer: ReferrerView;
  /** Claims already made by anyone (other than this friend). */
  earlier: Peer[];
  /** Claims this referrer has already received, newest first. */
  referrerClaims: Peer[];
  now?: number;
  referrerMinAgeHours: number;
}): Verdict {
  const { friend, referrer, earlier, referrerClaims } = input;
  const now = input.now ?? Date.now();
  const blocks: string[] = [];
  const holds: string[] = [];

  if (friend.workspaceId === referrer.workspaceId) blocks.push("self-referral: same account");
  else if (friend.emailHash === referrer.emailHash) blocks.push("self-referral: same mailbox");
  if (friend.deviceHash && referrer.deviceHashes.includes(friend.deviceHash)) blocks.push("self-referral: same browser as the referrer");
  if (isDisposableDomain(friend.domain)) blocks.push("throwaway email domain");
  if (earlier.some((p) => p.emailHash === friend.emailHash && p.status !== "blocked")) blocks.push("this mailbox already earned or is awaiting a reward");
  if (friend.deviceHash && earlier.some((p) => p.deviceHash === friend.deviceHash && (p.status === "granted" || p.status === "held" || p.status === "approved"))) blocks.push("this browser already claimed a reward");

  if (friend.ipHash && referrer.ipHashes.includes(friend.ipHash)) holds.push("same network as the referrer");
  if (friend.ipHash && earlier.filter((p) => p.ipHash === friend.ipHash && p.status !== "blocked").length >= 2) holds.push("3 or more claims from one network");
  if (!FREE_MAIL_DOMAINS.has(friend.domain) && friend.domain === referrer.domain) holds.push("same work or school email domain as the referrer");
  if (!FREE_MAIL_DOMAINS.has(friend.domain) && referrerClaims.filter((p) => p.domain === friend.domain && p.status !== "blocked").length >= 2) holds.push("3 or more friends from one non-public email domain");
  if (now - Date.parse(referrer.createdAt) < input.referrerMinAgeHours * 36e5) holds.push(`referrer account is under ${input.referrerMinAgeHours} hours old`);

  if (blocks.length) return { action: "block", reasons: blocks };
  if (holds.length) return { action: "hold", reasons: holds };
  return { action: "grant", reasons: [] };
}
