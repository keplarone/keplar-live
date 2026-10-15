/**
 * Per-account PIN for Keplar Wants confirmations.
 * Stored as a scrypt hash on the workspace (Neon when DATABASE_URL is set, otherwise the
 * app's JSON file store). There is no shared dev PIN. Without a durable store (Vercel and
 * no database) a PIN still hashes correctly but only lasts for that instance — callers say so.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { collection, storeDurable } from "@/lib/create/platform/store";
import { now } from "@/lib/create/platform/ids";
import { rateLimit } from "@/lib/create/platform/ratelimit";

/**
 * A 4-6 digit PIN is guessable at the general request rate (120/min), so every check of a presented PIN is also limited per
 * account across instances: 10 per 15 minutes, then 429 until the window passes.
 */
export const PIN_ATTEMPTS = { max: 10, windowSec: 15 * 60 };
const countAttempt = (workspaceId: string) => rateLimit(`wants-pin:${workspaceId}`, PIN_ATTEMPTS.max, PIN_ATTEMPTS.windowSec, { shared: true });

const PIN = /^\d{4,6}$/;
type PinRow = { id: string; workspaceId: string; hash: string; updatedAt: string };

const rows = () => collection<PinRow>("wants_pins");

function hashPin(pin: string, salt = randomBytes(16)): string {
  return `s1$${salt.toString("base64url")}$${scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("base64url")}`;
}

function verifyHash(pin: string, stored: string): boolean {
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const got = scryptSync(pin, Buffer.from(salt, "base64url"), 32, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

export const pinStoreDurable = () => storeDurable();

export async function pinIsSet(workspaceId: string): Promise<boolean> {
  return (await rows().get(workspaceId, "pin")) !== null;
}

export type SetPinResult = "set" | "bad_format" | "bad_current";

/** First call sets the PIN. A later call must present the current one. */
export async function setPin(workspaceId: string, pin: string, current?: string | null): Promise<SetPinResult> {
  if (!PIN.test(pin)) return "bad_format";
  const existing = await rows().get(workspaceId, "pin");
  if (existing) {
    await countAttempt(workspaceId);
    if (!current || !verifyHash(current, existing.hash)) return "bad_current";
    await rows().update(workspaceId, "pin", { hash: hashPin(pin), updatedAt: now() });
    return "set";
  }
  await rows().insert({ id: "pin", workspaceId, hash: hashPin(pin), updatedAt: now() });
  return "set";
}

export type PinCheck = "ok" | "bad" | "unset";

export async function verifyPin(workspaceId: string, pin: string | null | undefined): Promise<PinCheck> {
  const existing = await rows().get(workspaceId, "pin");
  if (!existing) return "unset";
  await countAttempt(workspaceId);
  return verifyHash(pin ?? "", existing.hash) ? "ok" : "bad";
}
