/**
 * Visitor accounts for one published site (BETA). Email + password, kept per site: an account on one site means nothing on another.
 * Passwords are stored as scrypt hashes. A session is a signed, expiring cookie that names the member; every request re-reads the member
 * record, so removing a member in the Features panel signs them out at once. No email is sent (no verification, no reset): listed as limits.
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Site } from "../types";
import { addRecord, records } from "./records";

export const SESSION_DAYS = 14;
export const MIN_PASSWORD = 8;
export const MAX_MEMBERS = 2000;
const secret = () => process.env.BETTER_AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-form-secret");

export const memberKey = "all"; // every account of a site lives under one key, whatever the placeholder id is
export const memberRecordId = (site: Pick<Site, "id">, email: string) => `rec_${site.id}_mb_${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)}`;

export function hashPassword(pw: string, salt = randomBytes(16)): string {
  return `s1$${salt.toString("base64url")}$${scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const got = scryptSync(pw, Buffer.from(salt, "base64url"), 32, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

export const cookieName = (site: Pick<Site, "id">) => `kmem_${site.id}`;
const sig = (siteId: string, rid: string, exp: number) => createHmac("sha256", secret()).update(`km1:${siteId}:${rid}:${exp}`).digest("base64url").slice(0, 27);

export function issueSession(site: Pick<Site, "id">, rid: string, at = Date.now()): string {
  const exp = Math.floor(at / 1000) + SESSION_DAYS * 86400;
  return `${rid}.${exp.toString(36)}.${sig(site.id, rid, exp)}`;
}
/** The member record id a cookie header proves, or null. Signature and expiry only; the caller still checks the record exists. */
export function readSession(site: Pick<Site, "id">, cookieHeader: string | null, at = Date.now()): string | null {
  if (!secret()) return null;
  const name = cookieName(site);
  const raw = (cookieHeader ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  const [rid, e, s] = (raw ?? "").split(".");
  const exp = parseInt(e ?? "", 36);
  if (!rid || !s || !Number.isFinite(exp) || exp * 1000 < at) return null;
  const want = Buffer.from(sig(site.id, rid, exp));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got) ? rid : null;
}
export function setCookie(site: Pick<Site, "id">, base: string, value: string | null, secure: boolean): string {
  return `${cookieName(site)}=${value ?? ""}; Path=${base || "/"}; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}${value ? `Max-Age=${SESSION_DAYS * 86400}` : "Max-Age=0"}`;
}

/** The signed-in member of this site for a request, or null. */
export async function memberFor(site: Site, cookieHeader: string | null): Promise<{ id: string; email: string } | null> {
  const rid = readSession(site, cookieHeader);
  if (!rid) return null;
  const rec = await records().get(site.workspaceId, rid);
  if (!rec || rec.siteId !== site.id || rec.feature !== "members" || rec.status !== "active") return null;
  return { id: rec.id, email: rec.data.email };
}

export async function createMember(site: Site, email: string, password: string, name = "") {
  const id = memberRecordId(site, email);
  const { inserted } = await addRecord({ id, workspaceId: site.workspaceId, siteId: site.id, feature: "members", key: memberKey, data: { email, ...(name ? { name } : {}), pw: hashPassword(password) }, status: "active" });
  return { id, inserted };
}

export async function checkLogin(site: Site, email: string, password: string): Promise<string | null> {
  const id = memberRecordId(site, email);
  const rec = await records().get(site.workspaceId, id);
  // hash even when the account doesn't exist, so timing doesn't say which emails have accounts
  const ok = verifyPassword(password, rec?.data.pw ?? "s1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  return rec && rec.siteId === site.id && rec.status === "active" && ok ? id : null;
}
