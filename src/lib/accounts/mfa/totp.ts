/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s) and one-time recovery codes. Dependency-free (node:crypto).
 * Pure functions: storage and the sign-in gate live in ./store.ts and the routes.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, base32 (what authenticator apps expect). */
export const generateSecret = () => base32Encode(randomBytes(20));

export function hotp(secretB32: string, counter: number, digits = DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);
export const totpAt = (secretB32: string, ms = Date.now()) => hotp(secretB32, stepAt(ms));

/**
 * Check a code against the current step and one step either side (clock drift). Returns the matching step so the caller can refuse
 * a second use of the same step (replay), or null.
 */
export function verifyTotp(secretB32: string, code: string, ms = Date.now(), window = 1): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const now = stepAt(ms);
  let hit: number | null = null;
  for (let d = -window; d <= window; d++) {
    const expect = hotp(secretB32, now + d);
    // Constant-time compare, and no early exit: every step is always checked.
    if (timingSafeEqual(Buffer.from(expect), Buffer.from(given)) && hit === null) hit = now + d;
  }
  return hit;
}

export function otpauthUri(issuer: string, account: string, secretB32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/* ── recovery codes ─────────────────────────────────────────────────────── */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const RECOVERY_COUNT = 10;

/** `XXXXX-XXXXX`, ~50 bits each. */
export function generateRecoveryCodes(n = RECOVERY_COUNT): string[] {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(10);
    const s = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** What the user typed, normalized to the stored form (case, spaces and the dash do not matter). */
export const normalizeRecovery = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const looksLikeRecovery = (input: string) => normalizeRecovery(input).length === 10;
