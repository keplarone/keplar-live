/**
 * Referral program: codes, claims, rewards.
 *
 *  - A reward is EXTRA USAGE CREDIT only: rows in `limit_extensions` (pack "referral"), the same credits as a purchased pack, spent only on paid
 *    plans after the plan's own allowance. Nothing here pays cash, issues a coupon or touches billing.
 *  - One reward per verified new account: the claim row id is derived from the new account's workspace, and a second claim is also refused when the
 *    same mailbox (normalised) or the same browser already has one. A claim is only taken from an account whose email is verified (every Keplar
 *    sign-in verifies the address) and that is less than `claimWindowDays` old.
 *  - Caps (per referrer per month and lifetime, and for the whole program per day) use atomic counters, so two parallel claims cannot both slip under a cap.
 *  - Anything suspicious (same network as the referrer, work-domain clusters, a very new referrer, program cap) is HELD for an admin instead of granted.
 */
import { createHash, randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { grantExtension } from "@/lib/create/platform/extensions";
import { authSecret } from "@/lib/accounts/secret";
import { now } from "@/lib/create/platform/ids";
import { assess, canonicalEmail, domainOf, hashSignal, maskEmail, networkOf, type Peer, type Signals } from "./abuse";
import { CODE_RE, referralConfig } from "./config";

export type ReferralProfile = {
  id: string;
  workspaceId: string;
  userId: string | null;
  code: string;
  emailHash: string;
  domain: string;
  ipHashes: string[];
  deviceHashes: string[];
  accountCreatedAt: string;
  createdAt: string;
};

export type ClaimStatus = "pending" | "granted" | "approved" | "held" | "capped" | "blocked" | "denied";
export type ReferralClaim = {
  id: string;
  /** The new account (the friend). */
  workspaceId: string;
  referrerWs: string;
  code: string;
  maskedEmail: string;
  emailHash: string;
  domain: string;
  ipHash: string | null;
  deviceHash: string | null;
  status: ClaimStatus;
  reasons: string[];
  referrerCredits: number;
  friendCredits: number;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
};

type Counter = { id: string; workspaceId: string; n: number };

const profiles = () => collection<ReferralProfile>("referral_profiles");
const claims = () => collection<ReferralClaim>("referral_claims");
const counters = () => collection<Counter>("referral_counters");
const SYSTEM = "system";
const GRANTED = new Set<ClaimStatus>(["granted", "approved"]);

const secret = () => authSecret();
const iso = (d = new Date()) => d.toISOString();
const monthKey = (at = new Date()) => `m_${iso(at).slice(0, 7)}`;
const dayKey = (at = new Date()) => `d_${iso(at).slice(0, 10)}`;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/i/l: a code read out loud or typed stays unambiguous

export function newCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}
/** Shareable link. `/?ref=CODE` redirects to `/invite/CODE` (proxy). */
export const inviteUrl = (origin: string, code: string) => `${origin.replace(/\/$/, "")}/?ref=${code}`;

export function signalsFrom(email: string, ip: string, deviceId: string | null): Signals {
  const net = networkOf(ip);
  return {
    emailHash: hashSignal(secret(), "email", canonicalEmail(email)),
    domain: domainOf(email),
    ipHash: net ? hashSignal(secret(), "ip", net) : null,
    deviceHash: deviceId ? hashSignal(secret(), "dev", deviceId) : null,
  };
}

const push = (list: string[], v: string | null, max = 8) => (v && !list.includes(v) ? [...list, v].slice(-max) : list);

export type OwnerRef = { workspaceId: string; userId: string | null; email: string };

/** The person's own referral profile (creates the code on first use). Also notes the network and browser it was opened from, to recognise self-referral. */
export async function ensureProfile(o: OwnerRef, seen: { ip: string; deviceId: string | null }, accountCreatedAt: string): Promise<ReferralProfile> {
  const sig = signalsFrom(o.email, seen.ip, seen.deviceId);
  const id = `rp_${o.workspaceId}`;
  const cur = await profiles().get(o.workspaceId, id);
  if (cur) {
    const ipHashes = push(cur.ipHashes, sig.ipHash);
    const deviceHashes = push(cur.deviceHashes, sig.deviceHash);
    if (ipHashes.length === cur.ipHashes.length && deviceHashes.length === cur.deviceHashes.length) return cur;
    return (await profiles().update(o.workspaceId, id, { ipHashes, deviceHashes })) ?? cur;
  }
  for (let i = 0; i < 6; i++) {
    const code = newCode();
    if (await profiles().findSystemBy("code", code)) continue;
    const row: ReferralProfile = {
      id,
      workspaceId: o.workspaceId,
      userId: o.userId,
      code,
      emailHash: sig.emailHash,
      domain: sig.domain,
      ipHashes: push([], sig.ipHash),
      deviceHashes: push([], sig.deviceHash),
      accountCreatedAt,
      createdAt: now(),
    };
    return (await profiles().insertIfAbsent(row)).row;
  }
  throw new Error("Could not make a referral code.");
}

export async function profileByCode(code: string): Promise<ReferralProfile | null> {
  if (!CODE_RE.test(code)) return null;
  return profiles().findSystemBy("code", code);
}

async function bump(ws: string, id: string, by: number): Promise<number> {
  return (await counters().increment(ws, id, { n: by }, { id, workspaceId: ws, n: 0 })).n;
}

/** Take one slot under a cap. Returns false (and gives the slot back) when the cap would be exceeded. */
async function takeSlot(ws: string, id: string, cap: number): Promise<boolean> {
  const n = await bump(ws, id, 1);
  if (n <= cap) return true;
  await bump(ws, id, -1);
  return false;
}

async function grantBoth(c: ReferralClaim, cfg = referralConfig()): Promise<void> {
  const valid = cfg.validDays;
  await grantExtension({ workspaceId: c.referrerWs, paymentId: `referral_${c.id}_referrer`, pack: "referral", credits: c.referrerCredits, validDays: valid });
  await grantExtension({ workspaceId: c.workspaceId, paymentId: `referral_${c.id}_friend`, pack: "referral", credits: c.friendCredits, validDays: valid });
}

export type RedeemResult =
  | { status: "off" | "invalid" | "too_old" }
  | { status: "granted" | "held" | "capped" | "blocked" | "already"; claim: Pick<ReferralClaim, "status" | "friendCredits" | "referrerCredits">; message: string };

const MESSAGES: Record<string, string> = {
  granted: "Your invite worked. You both got extra usage credit.",
  held: "Your invite is being checked. If it passes, you both get the credit.",
  capped: "This invite has reached its limit, so no credit was added for either of you.",
  blocked: "This invite doesn't qualify for credit (see the referral terms). Your account works as normal.",
  already: "This account already used an invite.",
};

/**
 * The new account claims the invite its browser opened. `account` is the signed-in, email-verified owner.
 */
export async function redeemReferral(input: { code: string; account: OwnerRef & { createdAt: string }; ip: string; deviceId: string | null }): Promise<RedeemResult> {
  const cfg = referralConfig();
  if (!cfg.enabled) return { status: "off" };
  const referrer = await profileByCode(input.code);
  if (!referrer) return { status: "invalid" };
  const ws = input.account.workspaceId;
  const claimId = `rc_${ws}`;
  const existing = await claims().get(ws, claimId);
  if (existing && existing.status !== "pending") return { status: "already", claim: existing, message: MESSAGES.already! };
  if (!existing && Date.now() - Date.parse(input.account.createdAt) > cfg.claimWindowDays * 864e5) return { status: "too_old" };

  const sig = signalsFrom(input.account.email, input.ip, input.deviceId);
  const all = await claims().listSystem((c) => c.workspaceId !== ws);
  const peers: Peer[] = all.map((c) => ({ ipHash: c.ipHash, deviceHash: c.deviceHash, emailHash: c.emailHash, domain: c.domain, status: c.status }));
  const mine: Peer[] = all.filter((c) => c.referrerWs === referrer.workspaceId).map((c) => ({ ipHash: c.ipHash, deviceHash: c.deviceHash, emailHash: c.emailHash, domain: c.domain, status: c.status }));
  const verdict = assess({
    friend: { ...sig, workspaceId: ws },
    referrer: { workspaceId: referrer.workspaceId, emailHash: referrer.emailHash, domain: referrer.domain, deviceHashes: referrer.deviceHashes, ipHashes: referrer.ipHashes, createdAt: referrer.accountCreatedAt },
    earlier: peers,
    referrerClaims: mine,
    referrerMinAgeHours: cfg.referrerMinAgeHours,
  });

  const base: ReferralClaim = {
    id: claimId,
    workspaceId: ws,
    referrerWs: referrer.workspaceId,
    code: referrer.code,
    maskedEmail: maskEmail(input.account.email),
    emailHash: sig.emailHash,
    domain: sig.domain,
    ipHash: sig.ipHash,
    deviceHash: sig.deviceHash,
    status: verdict.action === "block" ? "blocked" : verdict.action === "hold" ? "held" : "pending",
    reasons: verdict.reasons,
    referrerCredits: 0,
    friendCredits: 0,
    createdAt: now(),
  };
  const ins = existing ? { row: existing, inserted: false } : await claims().insertIfAbsent(base);
  let claim = ins.row;
  // A parallel request already decided this account.
  if (!ins.inserted && !existing) return { status: "already", claim, message: MESSAGES.already! };
  if (claim.status === "blocked" || claim.status === "held") return { status: claim.status, claim, message: MESSAGES[claim.status]! };

  // Auto path: caps first, then the grants (idempotent by payment id, so a retry after a crash grants once).
  const over = async (status: ClaimStatus, reason: string) => (await claims().update(ws, claimId, { status, reasons: [...claim.reasons, reason], decidedAt: now() })) ?? { ...claim, status };
  if (!(await takeSlot(SYSTEM, dayKey(), cfg.dailyProgramCap))) {
    claim = await over("held", "daily program cap reached; waiting for review");
    return { status: "held", claim, message: MESSAGES.held! };
  }
  const month = await takeSlot(referrer.workspaceId, monthKey(), cfg.perMonth);
  const life = month ? await takeSlot(referrer.workspaceId, "life", cfg.lifetime) : false;
  if (!month || !life) {
    if (month) await bump(referrer.workspaceId, monthKey(), -1);
    await bump(SYSTEM, dayKey(), -1);
    claim = await over("capped", month ? `referrer lifetime cap (${cfg.lifetime}) reached` : `referrer monthly cap (${cfg.perMonth}) reached`);
    return { status: "capped", claim, message: MESSAGES.capped! };
  }
  claim = (await claims().update(ws, claimId, { status: "granted", referrerCredits: cfg.referrerCredits, friendCredits: cfg.friendCredits, decidedAt: now() })) ?? claim;
  await grantBoth(claim, cfg);
  return { status: "granted", claim, message: MESSAGES.granted! };
}

// ---- Referrer's own view ----

export type ReferralSummary = {
  enabled: boolean;
  code: string;
  rewards: { referrerCredits: number; friendCredits: number; validDays: number };
  caps: { perMonth: number; lifetime: number };
  usage: { thisMonth: number; lifetime: number };
  creditsEarned: number;
  friends: { when: string; who: string; status: "rewarded" | "under review" | "no reward"; credits: number }[];
};

export async function summaryFor(p: ReferralProfile): Promise<ReferralSummary> {
  const cfg = referralConfig();
  const mine = (await claims().listSystem((c) => c.referrerWs === p.workspaceId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [m, l] = await Promise.all([counters().get(p.workspaceId, monthKey()), counters().get(p.workspaceId, "life")]);
  return {
    enabled: cfg.enabled,
    code: p.code,
    rewards: { referrerCredits: cfg.referrerCredits, friendCredits: cfg.friendCredits, validDays: cfg.validDays },
    caps: { perMonth: cfg.perMonth, lifetime: cfg.lifetime },
    usage: { thisMonth: m?.n ?? 0, lifetime: l?.n ?? 0 },
    creditsEarned: mine.filter((c) => GRANTED.has(c.status)).reduce((n, c) => n + c.referrerCredits, 0),
    // The referrer sees outcomes, never which abuse rule fired.
    friends: mine.slice(0, 50).map((c) => ({
      when: c.createdAt,
      who: c.maskedEmail,
      status: GRANTED.has(c.status) ? "rewarded" : c.status === "held" || c.status === "pending" ? "under review" : "no reward",
      credits: GRANTED.has(c.status) ? c.referrerCredits : 0,
    })),
  };
}

// ---- Admin ----

export type AdminReferralReport = {
  config: ReturnType<typeof referralConfig>;
  today: { granted: number; cap: number };
  totals: Record<ClaimStatus, number> & { all: number; creditsGranted: number };
  claims: (Omit<ReferralClaim, "emailHash" | "ipHash" | "deviceHash"> & { referrerCode: string })[];
  topReferrers: { referrerWs: string; code: string; rewarded: number; held: number; blocked: number }[];
};

export async function adminReport(limit = 200): Promise<AdminReferralReport> {
  const cfg = referralConfig();
  const all = (await claims().listSystem()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totals = { all: all.length, creditsGranted: 0, pending: 0, granted: 0, approved: 0, held: 0, capped: 0, blocked: 0, denied: 0 } as AdminReferralReport["totals"];
  const by = new Map<string, { referrerWs: string; code: string; rewarded: number; held: number; blocked: number }>();
  for (const c of all) {
    totals[c.status]++;
    if (GRANTED.has(c.status)) totals.creditsGranted += c.referrerCredits + c.friendCredits;
    const r = by.get(c.referrerWs) ?? { referrerWs: c.referrerWs, code: c.code, rewarded: 0, held: 0, blocked: 0 };
    if (GRANTED.has(c.status)) r.rewarded++;
    else if (c.status === "held") r.held++;
    else if (c.status === "blocked") r.blocked++;
    by.set(c.referrerWs, r);
  }
  const day = await counters().get(SYSTEM, dayKey());
  return {
    config: cfg,
    today: { granted: day?.n ?? 0, cap: cfg.dailyProgramCap },
    totals,
    // Hashes of a person's network and browser are not shown, only the rule that fired.
    claims: all.slice(0, limit).map((c) => ({
      id: c.id, workspaceId: c.workspaceId, referrerWs: c.referrerWs, code: c.code, maskedEmail: c.maskedEmail, domain: c.domain, status: c.status, reasons: c.reasons,
      referrerCredits: c.referrerCredits, friendCredits: c.friendCredits, createdAt: c.createdAt, decidedAt: c.decidedAt, decidedBy: c.decidedBy, referrerCode: c.code,
    })),
    topReferrers: [...by.values()].sort((a, b) => b.rewarded + b.held + b.blocked - (a.rewarded + a.held + a.blocked)).slice(0, 10),
  };
}

/** Admin decision on a held claim. Approving grants the same credits (idempotent); denying grants nothing. */
export async function decideClaim(claimId: string, decision: "approve" | "deny", adminEmail: string): Promise<ReferralClaim | null> {
  const c = await claims().findSystemBy("id", claimId);
  if (!c) return null;
  if (c.status !== "held") return c; // only a held claim can be decided; everything else is final
  const cfg = referralConfig();
  if (decision === "deny") return (await claims().update(c.workspaceId, c.id, { status: "denied", decidedAt: now(), decidedBy: adminEmail })) ?? c;
  await bump(SYSTEM, dayKey(), 1);
  await bump(c.referrerWs, monthKey(), 1);
  await bump(c.referrerWs, "life", 1);
  const next = (await claims().update(c.workspaceId, c.id, { status: "approved", referrerCredits: cfg.referrerCredits, friendCredits: cfg.friendCredits, decidedAt: now(), decidedBy: adminEmail })) ?? c;
  await grantBoth(next, cfg);
  return next;
}

/** Stable short id for logs (never the code or the email). */
export const shortId = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
