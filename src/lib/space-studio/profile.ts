/**
 * Space Studio onboarding profile and parental consent for under-13s.
 *
 * - space_profiles         per workspace, id "profile": birth date (kept for the age check only; never logged or returned),
 *                          the age band computed here, onboarding answers, consents, completion time, parental consent state.
 * - space_parent_consents  system rows (workspace "space_parent_consent"), id = sha256(consent token) -> owner workspace, expiry.
 *                          The token travels only in the email to the parent; it is single use and expires after 7 days.
 *
 * Under 13: a parent's email (not the account's own) is required; the profile waits in "awaiting_parent" and Space Studio chat is
 * refused (403 parent_consent_required) until the parent approves from the emailed link. The birth date can't be changed once set
 * (409 birth_date_locked), so the age gate can't be stepped around by re-answering.
 */
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/create/platform/http";
import { collection, type Row } from "@/lib/create/platform/store";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { siteUrl } from "@/lib/site";

export type AgeBand = "under13" | "13to17" | "adult";
export type ConsentStatus = "not_needed" | "awaiting_parent" | "approved";
export type ParentConsent = { status: ConsentStatus; emailSent?: boolean; parentEmail?: string; requestedAt?: string; approvedAt?: string };
export type ProfileRow = Row & {
  birthDate: string;
  ageBand: AgeBand;
  role: string | null;
  experience: string | null;
  goals: string[];
  workspaces: string[];
  consents: { productEmails: boolean; improveWithUsage: boolean };
  completedAt: string;
  parentConsent: ParentConsent;
};
type ConsentTokenRow = Row & { owner: string; expiresAt: string; createdAt: string };

export const profiles = () => collection<ProfileRow>("space_profiles");
export const parentConsents = () => collection<ConsentTokenRow>("space_parent_consents");
export const CONSENT_WS = "space_parent_consent";
export const CONSENT_TTL_MS = 7 * 86_400_000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Whole years between a YYYY-MM-DD birth date and `now` (UTC). Throws 400 for anything that isn't a real past date within 120 years. */
export function ageFrom(birthDate: unknown, now = Date.now()): number {
  const bad = (m = "Enter your birth date as YYYY-MM-DD.") => new HttpError(400, m, "bad_birth_date");
  if (typeof birthDate !== "string") throw bad();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) throw bad();
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw bad("That date doesn't exist.");
  const today = new Date(now);
  if (t > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) throw bad("Your birth date can't be in the future.");
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() < mo - 1 || (today.getUTCMonth() === mo - 1 && today.getUTCDate() < d)) age--;
  if (age > 120) throw bad("Check the year of your birth date.");
  return age;
}

export const ageBandOf = (age: number): AgeBand => (age < 13 ? "under13" : age < 18 ? "13to17" : "adult");

export type ProfileInput = {
  birthDate: string; ageBand: AgeBand; role: string | null; experience: string | null; goals: string[]; workspaces: string[];
  consents: { productEmails: boolean; improveWithUsage: boolean }; parentEmail: string | null;
};

/** Validates the onboarding body. `accountEmail` is the signed-in account's own address (a parent email must differ). */
export function validateProfile(raw: unknown, accountEmail: string, now = Date.now()): ProfileInput {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bad = (m: string, code = "bad_request") => new HttpError(400, m, code);
  const ageBand = ageBandOf(ageFrom(b.birthDate, now));
  const text = (v: unknown, name: string) => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || v.trim().length > 80) throw bad(`${name} must be text of at most 80 characters.`);
    return v.trim() || null;
  };
  const list = (v: unknown, name: string) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > 12 || v.some((x) => typeof x !== "string" || !x.trim() || x.length > 80)) throw bad(`${name} must be a list of at most 12 short texts.`);
    return [...new Set((v as string[]).map((x) => x.trim()))];
  };
  const c = (b.consents && typeof b.consents === "object" ? b.consents : null) as Record<string, unknown> | null;
  if (!c || typeof c.productEmails !== "boolean" || typeof c.improveWithUsage !== "boolean") throw bad("consents.productEmails and consents.improveWithUsage must be true or false.", "bad_consents");
  let parentEmail: string | null = null;
  if (ageBand === "under13") {
    const p = typeof b.parentEmail === "string" ? b.parentEmail.trim().toLowerCase() : "";
    if (!p) throw bad("Under 13: enter a parent's or guardian's email so they can approve your account.", "parent_email_required");
    if (p.length > 254 || !EMAIL.test(p)) throw bad("Enter a valid email address for your parent or guardian.", "bad_parent_email");
    if (p === accountEmail.trim().toLowerCase()) throw bad("Use your parent's or guardian's own email, not your account's.", "bad_parent_email");
    parentEmail = p;
  }
  return {
    birthDate: b.birthDate as string, ageBand, role: text(b.role, "role"), experience: text(b.experience, "experience"), goals: list(b.goals, "goals"), workspaces: list(b.workspaces, "workspaces"),
    consents: { productEmails: c.productEmails, improveWithUsage: c.improveWithUsage }, parentEmail,
  };
}

export type ProfileView = {
  completed: boolean; ageBand: AgeBand; role: string | null; experience: string | null; goals: string[]; workspaces: string[];
  consents: { productEmails: boolean; improveWithUsage: boolean }; parentConsent: { status: ConsentStatus; emailSent?: boolean };
};

/** What clients see: never the birth date or the parent's address. */
export function profileView(p: ProfileRow | null, now = Date.now()): ProfileView | null {
  if (!p) return null;
  const pc = p.parentConsent;
  return {
    completed: Boolean(p.completedAt), ageBand: currentBand(p, now), role: p.role, experience: p.experience, goals: p.goals, workspaces: p.workspaces, consents: p.consents,
    parentConsent: currentBand(p, now) !== "under13" ? { status: pc.status === "approved" ? "approved" : "not_needed" } : pc.status === "awaiting_parent" ? { status: pc.status, emailSent: pc.emailSent === true } : { status: pc.status },
  };
}

export const loadProfile = (wsId: string) => profiles().get(wsId, "profile");

/** The age band today (a birthday since onboarding moves it on). */
export function currentBand(p: ProfileRow, now = Date.now()): AgeBand {
  try {
    return ageBandOf(ageFrom(p.birthDate, now));
  } catch {
    return p.ageBand;
  }
}

/** For /me: the onboarding summary. Turning 13 ends the need for parental consent. */
export function onboardingView(p: ProfileRow | null, now = Date.now()) {
  if (!p) return { completed: false, ageBand: null, parentConsent: "not_needed" as ConsentStatus };
  const band = currentBand(p, now);
  return { completed: Boolean(p.completedAt), ageBand: band, parentConsent: band === "under13" ? p.parentConsent.status : p.parentConsent.status === "approved" ? "approved" : ("not_needed" as ConsentStatus) };
}

/** True when this workspace's person is under 13 today without an approved parental consent. */
export const needsParentConsent = (p: ProfileRow | null, now = Date.now()) => Boolean(p) && currentBand(p!, now) === "under13" && p!.parentConsent.status !== "approved";

const mask = (email: string) => {
  const [local, domain] = email.split("@");
  return `${(local ?? "").slice(0, 1)}***@${domain ?? ""}`;
};
const consentUrl = (token: string) => `${(process.env.BETTER_AUTH_URL || siteUrl).replace(/\/$/, "")}/api/space-studio/profile/consent?token=${token}`;

/** Save the profile (and start a parental consent request when needed). */
export async function saveProfile(wsId: string, accountEmail: string, input: ProfileInput, now = Date.now(), deps: { sendEmail?: (m: { to: string; subject: string; text: string; kind: string }) => Promise<boolean> } = {}): Promise<ProfileRow> {
  const prev = await loadProfile(wsId);
  if (prev && prev.birthDate !== input.birthDate) throw new HttpError(409, "Your birth date is already set. Contact support if it's wrong.", "birth_date_locked");
  const at = new Date(now).toISOString();
  let parentConsent: ParentConsent = { status: "not_needed" };
  if (input.ageBand === "under13") {
    const keep = prev?.parentConsent && prev.parentConsent.parentEmail === input.parentEmail && prev.parentConsent.status !== "not_needed";
    if (keep && (prev!.parentConsent.status === "approved" || prev!.parentConsent.emailSent)) parentConsent = prev!.parentConsent;
    else {
      await rateLimit(`space-parent-consent:${wsId}`, 5, 86_400, { shared: true });
      // Older requests for this workspace stop working; only the newest link is valid.
      for (const r of await parentConsents().list(CONSENT_WS, (x) => x.owner === wsId)) await parentConsents().remove(CONSENT_WS, r.id);
      const token = randomBytes(32).toString("base64url");
      await parentConsents().insert({ id: hash(token), workspaceId: CONSENT_WS, owner: wsId, createdAt: at, expiresAt: new Date(now + CONSENT_TTL_MS).toISOString() });
      const send = deps.sendEmail ?? (await import("@/lib/accounts/outbox")).sendEmail;
      const emailSent = await send({
        to: input.parentEmail!,
        kind: "space-parent-consent",
        subject: "Approve your child's Space Studio account",
        text: `Someone using the Keplar account ${mask(accountEmail)} said they are under 13 and gave this address as their parent's or guardian's.\n\nSpace Studio is Keplar's app for building Roblox and Blender projects with AI help. Before they can use its AI assistant, a parent or guardian needs to approve.\n\nTo review and approve, open:\n${consentUrl(token)}\n\nThe link works once and expires in 7 days. If you don't know what this is, ignore this email and nothing will be approved.`,
      }).catch(() => false);
      parentConsent = { status: "awaiting_parent", emailSent, parentEmail: input.parentEmail!, requestedAt: at };
    }
  }
  const row: ProfileRow = {
    id: "profile", workspaceId: wsId, birthDate: input.birthDate, ageBand: input.ageBand, role: input.role, experience: input.experience, goals: input.goals, workspaces: input.workspaces,
    consents: input.consents, completedAt: prev?.completedAt ?? at, parentConsent,
  };
  if (prev) await profiles().update(wsId, "profile", row);
  else {
    const put = await profiles().insertIfAbsent(row);
    if (!put.inserted) await profiles().update(wsId, "profile", row);
  }
  return row;
}

export type ConsentLookup = { ok: true; owner: string } | { ok: false; reason: "invalid" | "expired" };

export async function lookupConsent(token: unknown, now = Date.now()): Promise<ConsentLookup> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, reason: "invalid" };
  const r = await parentConsents().get(CONSENT_WS, hash(token));
  if (!r) return { ok: false, reason: "invalid" };
  if (Date.parse(r.expiresAt) <= now) return { ok: false, reason: "expired" };
  return { ok: true, owner: r.owner };
}

/** The parent's approval: single use. */
export async function approveConsent(token: unknown, now = Date.now()): Promise<ConsentLookup> {
  const l = await lookupConsent(token, now);
  if (!l.ok) return l;
  if (!(await parentConsents().remove(CONSENT_WS, hash(token as string)))) return { ok: false, reason: "invalid" }; // raced: used already
  const p = await loadProfile(l.owner);
  if (!p || p.parentConsent.status !== "awaiting_parent") return { ok: false, reason: "invalid" };
  await profiles().update(l.owner, "profile", { parentConsent: { ...p.parentConsent, status: "approved", approvedAt: new Date(now).toISOString() } });
  return l;
}

/** Account deletion: consent tokens are system rows, freed explicitly. */
export async function freeConsentTokens(wsId: string): Promise<number> {
  let n = 0;
  for (const r of await parentConsents().list(CONSENT_WS, (x) => x.owner === wsId)) if (await parentConsents().remove(CONSENT_WS, r.id)) n++;
  return n;
}
