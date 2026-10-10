// Server-only. Imported by the /api/inquire route handler.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/create/platform/store";
import { neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import type { Inquiry } from "./schema";

/**
 * Every submission is persisted before anything else happens, so a failed email never loses one.
 * - Neon (DATABASE_URL / POSTGRES_URL set): the `inquiries` table. This is the durable backup.
 * - Otherwise a JSON file in DATA_DIR (development only; /tmp on Vercel is ephemeral, so the
 *   route treats that as "not durable" and relies on the email alone).
 */
const FILE = path.join(DATA_DIR, "inquiries.json");

export type EmailStatus = "pending" | "sent" | "failed";
export type StoredInquiry = Inquiry & { id: string; receivedAt: string; userAgent: string | null; ipHash: string | null; emailStatus: EmailStatus; emailId: string | null; emailError: string | null };

export const inquiryStoreDurable = () => neonConfigured();

/** One-way hash of the client IP (abuse triage without keeping the address itself). */
export const hashIp = (ip: string) => createHash("sha256").update(`keplar-inquiry:${ip}`).digest("hex").slice(0, 32);

let schemaReady: Promise<void> | null = null;
function ensureInquirySchema(): Promise<void> {
  schemaReady ??= (async () => {
    await neonQuery(`CREATE TABLE IF NOT EXISTS inquiries (
      id text PRIMARY KEY,
      received_at timestamptz NOT NULL DEFAULT now(),
      name text NOT NULL,
      email text NOT NULL,
      company text NOT NULL DEFAULT '',
      company_size text NOT NULL DEFAULT '',
      interests jsonb NOT NULL DEFAULT '[]'::jsonb,
      message text NOT NULL,
      business jsonb,
      user_agent text,
      ip_hash text,
      email_status text NOT NULL DEFAULT 'pending',
      email_id text,
      email_error text,
      emailed_at timestamptz
    )`);
    await neonQuery("CREATE INDEX IF NOT EXISTS inquiries_received_at ON inquiries (received_at DESC)");
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

let queue: Promise<unknown> = Promise.resolve();
/** Serialised, atomic JSON-file update (development fallback). */
function fileUpdate<R>(fn: (list: StoredInquiry[]) => R): Promise<R> {
  const job = queue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    let list: StoredInquiry[] = [];
    try {
      const parsed = JSON.parse(await readFile(FILE, "utf8"));
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      /* first write, or unreadable file: start a new list */
    }
    const out = fn(list);
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(list, null, 2));
    await rename(tmp, FILE);
    return out;
  });
  queue = job.catch(() => undefined);
  return job;
}

export async function saveInquiry(data: Inquiry, meta: { userAgent: string | null; ipHash?: string | null }): Promise<StoredInquiry> {
  const record: StoredInquiry = {
    ...data,
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ipHash: meta.ipHash ?? null,
    emailStatus: "pending",
    emailId: null,
    emailError: null,
  };
  if (neonConfigured()) {
    await ensureInquirySchema();
    await neonQuery(
      `INSERT INTO inquiries (id, received_at, name, email, company, company_size, interests, message, business, user_agent, ip_hash, email_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11, 'pending')`,
      [record.id, record.receivedAt, record.name, record.email, record.company, record.companySize, JSON.stringify(record.interests), record.message, record.business ? JSON.stringify(record.business) : null, record.userAgent, record.ipHash],
    );
    return record;
  }
  await fileUpdate((list) => void list.push(record));
  return record;
}

/** Records the outcome of the notification email on the stored row. Never throws (the submission is already saved). */
export async function markInquiryEmail(id: string, result: { status: "sent" | "failed"; emailId?: string | null; error?: string | null }): Promise<void> {
  try {
    if (neonConfigured()) {
      await neonQuery("UPDATE inquiries SET email_status = $2, email_id = $3, email_error = $4, emailed_at = CASE WHEN $2 = 'sent' THEN now() ELSE emailed_at END WHERE id = $1", [
        id,
        result.status,
        result.emailId ?? null,
        result.error?.slice(0, 500) ?? null,
      ]);
      return;
    }
    await fileUpdate((list) => {
      const r = list.find((x) => x.id === id);
      if (r) Object.assign(r, { emailStatus: result.status, emailId: result.emailId ?? null, emailError: result.error?.slice(0, 500) ?? null });
    });
  } catch (e) {
    console.error("[inquire] could not record email status", id, e instanceof Error ? e.message : e);
  }
}
