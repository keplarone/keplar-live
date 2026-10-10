/**
 * Inquiry schema, shared by the form (client) and the route handler (server).
 * Hand-rolled because zod isn't a project dependency; the shape mirrors what a
 * zod schema would give: a typed parse that returns data or field errors.
 */

export const companySizes = ["Just me", "2–10", "11–50", "51–200", "201–1,000", "1,000+"] as const;
export const interests = [
  "Keplar Business",
  "Autonomous Agents",
  "Enterprise",
  "API / Developers",
  "Partnerships",
  "Investing",
  "Press",
  "General Inquiry",
] as const;
export const estimatedUsers = ["1–10", "11–50", "51–250", "251–1,000", "1,000+"] as const;
export const useCases = [
  "Research",
  "Software Development",
  "Customer Operations",
  "Marketing",
  "Data Analysis",
  "Internal Operations",
  "Autonomous Agents",
  "Other",
] as const;
export const expectedUsage = ["Exploring", "Light", "Moderate", "Heavy", "Enterprise-scale", "Not sure"] as const;

export const BUSINESS = "Keplar Business" as const;

export type Inquiry = {
  name: string;
  email: string;
  company: string;
  companySize: (typeof companySizes)[number] | "";
  interests: (typeof interests)[number][];
  message: string;
  business?: {
    handle: string;
    estimatedUsers: (typeof estimatedUsers)[number] | "";
    useCase: (typeof useCases)[number] | "";
    expectedUsage: (typeof expectedUsage)[number] | "";
  };
};

export type InquiryField =
  | "name"
  | "email"
  | "company"
  | "companySize"
  | "interests"
  | "message"
  | "handle"
  | "estimatedUsers"
  | "useCase"
  | "expectedUsage";

export type FieldErrors = Partial<Record<InquiryField, string>>;

export const limits = { name: 120, email: 254, company: 160, message: 5000, handle: 2000, messageMin: 10 } as const;

// No whitespace, quotes, angle brackets, commas or semicolons: the address goes into a Reply-To header.
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;

// Control characters (incl. CR/LF) are stripped from single-line fields, so none can reach an email header or subject.
const CONTROL = /[\u0000-\u001f\u007f\u2028\u2029]/g;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const oneOf = <T extends readonly string[]>(v: unknown, list: T): T[number] | "" =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : "";

/** Validate a single field against the current values (used for inline errors). */
export function validateField(field: InquiryField, v: Inquiry): string | undefined {
  switch (field) {
    case "name":
      return v.name.trim() ? undefined : "Enter your name.";
    case "email":
      if (!v.email.trim()) return "Enter your work email.";
      return EMAIL.test(v.email.trim()) ? undefined : "Enter a valid email address, like name@company.com.";
    case "company":
      if (v.companySize === "Just me") return undefined;
      return v.company.trim() ? undefined : "Enter your company, or choose “Just me” below.";
    case "companySize":
      return v.companySize ? undefined : "Choose a company size.";
    case "interests":
      return v.interests.length ? undefined : "Choose at least one.";
    case "message": {
      const n = v.message.trim().length;
      if (!n) return "Tell us what you’re looking to accomplish.";
      return n < limits.messageMin ? "Add a little more detail." : undefined;
    }
    case "estimatedUsers":
      return !v.interests.includes(BUSINESS) || v.business?.estimatedUsers ? undefined : "Choose an estimate.";
    case "useCase":
      return !v.interests.includes(BUSINESS) || v.business?.useCase ? undefined : "Choose a primary use case.";
    case "handle":
    case "expectedUsage":
      return undefined;
  }
}

export const fieldOrder: InquiryField[] = ["name", "email", "company", "companySize", "interests", "handle", "estimatedUsers", "useCase", "expectedUsage", "message"];

export function validate(v: Inquiry): FieldErrors {
  const errors: FieldErrors = {};
  for (const f of fieldOrder) {
    const e = validateField(f, v);
    if (e) errors[f] = e;
  }
  return errors;
}

/** Server-side parse: coerces unknown JSON into an Inquiry, then validates. */
export function parseInquiry(input: unknown): { ok: true; data: Inquiry } | { ok: false; errors: FieldErrors } {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const picked = Array.isArray(b.interests) ? b.interests.map((x) => oneOf(x, interests)).filter((x): x is (typeof interests)[number] => !!x) : [];
  const biz = (b.business && typeof b.business === "object" ? b.business : {}) as Record<string, unknown>;
  const data: Inquiry = {
    name: line(b.name, limits.name),
    email: line(b.email, limits.email),
    company: line(b.company, limits.company),
    companySize: oneOf(b.companySize, companySizes),
    interests: [...new Set(picked)],
    message: str(b.message, limits.message),
  };
  if (data.interests.includes(BUSINESS)) {
    data.business = {
      handle: str(biz.handle, limits.handle),
      estimatedUsers: oneOf(biz.estimatedUsers, estimatedUsers),
      useCase: oneOf(biz.useCase, useCases),
      expectedUsage: oneOf(biz.expectedUsage, expectedUsage),
    };
  }
  const errors = validate(data);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

/** Fields that count as "complete" for the convergence visual, in form order. */
export function completedFields(v: Inquiry): InquiryField[] {
  const business = v.interests.includes(BUSINESS);
  const fields: InquiryField[] = ["name", "email", "company", "companySize", "interests", "message"];
  if (business) fields.splice(5, 0, "handle", "estimatedUsers", "useCase", "expectedUsage");
  return fields.filter((f) => {
    if (f === "handle") return !!v.business?.handle.trim();
    if (f === "expectedUsage") return !!v.business?.expectedUsage;
    if (f === "company") return !!v.company.trim() || v.companySize === "Just me";
    return !validateField(f, v);
  });
}

export function totalFields(v: Inquiry) {
  return v.interests.includes(BUSINESS) ? 10 : 6;
}
