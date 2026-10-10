/**
 * Connector OAuth tokens are encrypted at rest with AES-256-GCM using a key
 * from KMS / env (KEPLAR_TOKEN_ENC_KEY, 32 bytes base64). Production: envelope
 * encryption with a per-workspace data key wrapped by a cloud KMS key.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.KEPLAR_TOKEN_ENC_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length === 32) return k;
  }
  // In production a missing key is an error, never a silent fallback to a publicly known key.
  if (process.env.NODE_ENV === "production") throw new Error("secrets_unavailable");
  // Dev/test only: deterministic key, never use for real tokens.
  return createHash("sha256").update("keplar-dev-only-token-key").digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
