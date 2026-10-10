/**
 * Keplar Business accounts: the company profile a Keplar account creates before buying a Business plan
 * (business.keplar.one -> keplar.one/business-account). One per workspace; the person who creates it owns it.
 */
import { collection } from "@/lib/create/platform/store";
import { COMPANY_SIZES, INDUSTRIES } from "./account-fields";

export { COMPANY_SIZES, INDUSTRIES };

export type BusinessAccountRow = {
  id: string;
  workspaceId: string;
  company: string;
  website: string;
  size: (typeof COMPANY_SIZES)[number];
  industry: (typeof INDUSTRIES)[number];
  role: string;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessAccountInput = Pick<BusinessAccountRow, "company" | "website" | "size" | "industry" | "role">;
export type BusinessAccountErrors = Partial<Record<keyof BusinessAccountInput, string>>;

const accounts = () => collection<BusinessAccountRow>("business_accounts");

const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/g;
const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A website as an https URL (a bare domain gets https://), or "" when blank; invalid input is reported, never stored. */
export function normaliseWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") || u.username || u.password) return null;
    return `https://${u.hostname.toLowerCase()}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

export function parseBusinessAccount(input: unknown): { ok: true; data: BusinessAccountInput } | { ok: false; errors: BusinessAccountErrors } {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const company = line(o.company, 160);
  const role = line(o.role, 120);
  const websiteRaw = line(o.website, 300);
  const website = normaliseWebsite(websiteRaw);
  const size = (COMPANY_SIZES as readonly string[]).includes(o.size as string) ? (o.size as BusinessAccountInput["size"]) : null;
  const industry = (INDUSTRIES as readonly string[]).includes(o.industry as string) ? (o.industry as BusinessAccountInput["industry"]) : null;
  const errors: BusinessAccountErrors = {};
  if (company.length < 2) errors.company = "Enter your company's name.";
  if (website === null) errors.website = "Enter a website like example.com, or leave it blank.";
  if (!size) errors.size = "Choose your company size.";
  if (!industry) errors.industry = "Choose an industry.";
  if (!role) errors.role = "Enter your role.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { company, website: website ?? "", size: size!, industry: industry!, role } };
}

export async function getBusinessAccount(workspaceId: string): Promise<BusinessAccountRow | null> {
  return accounts().get(workspaceId, workspaceId);
}

/** Creates the account, or updates the profile when it exists. */
export async function saveBusinessAccount(workspaceId: string, ownerEmail: string, data: BusinessAccountInput): Promise<BusinessAccountRow> {
  const now = new Date().toISOString();
  const existing = await getBusinessAccount(workspaceId);
  if (existing) return (await accounts().update(workspaceId, workspaceId, { ...data, updatedAt: now })) ?? { ...existing, ...data, updatedAt: now };
  return accounts().insert({ id: workspaceId, workspaceId, ...data, ownerEmail: ownerEmail.toLowerCase(), createdAt: now, updatedAt: now });
}

/** What business.keplar.one may show about the signed-in account (no billing ids, no other people). */
export function publicAccount(a: BusinessAccountRow | null) {
  return a ? { company: a.company, website: a.website, size: a.size, industry: a.industry, role: a.role, createdAt: a.createdAt } : null;
}
