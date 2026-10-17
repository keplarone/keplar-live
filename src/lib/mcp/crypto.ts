/**
 * Secrets for connected apps (bearer tokens / API keys), encrypted at rest with AES-256-GCM.
 * Key = HKDF-SHA256(server secret BETTER_AUTH_SECRET, per-workspace info), so one tenant's key never opens another's blob,
 * and the additional authenticated data binds a blob to its workspace + server row (a copied blob fails to decrypt).
 * Plain text exists only inside a server function while a request to that very server is built. It is never returned,
 * logged, put in an error message or written to an audit entry.
 * Production without a configured BETTER_AUTH_SECRET: refuse to store secrets (a random per-process key would make them unreadable).
 */
import { securityEvent } from "@/lib/security/events";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { authSecret } from "@/lib/accounts/secret";

const SALT = Buffer.from("keplar.mcp.secrets.v1");

export function secretsAvailable(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (process.env.BETTER_AUTH_SECRET?.trim().length ?? 0) >= 16;
}

function key(workspaceId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret(), SALT, `mcp:${workspaceId}`, 32));
}

export function sealSecret(plain: string, workspaceId: string, rowId: string): string {
  if (!secretsAvailable()) throw new Error("secrets_unavailable");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(workspaceId), iv);
  c.setAAD(Buffer.from(`${workspaceId}|${rowId}`));
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["m1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

/** Returns null when the blob can't be opened (wrong key, tampered, copied from another row). Never throws details. */
export function openSecret(blob: string | null | undefined, workspaceId: string, rowId: string): string | null {
  if (!blob) return null;
  // Auditable secret access: one security event per unseal (hashed workspace id only), alert past 200 per 10 minutes per workspace.
  securityEvent({ kind: "secret.access", code: "open", where: "mcp/crypto", accountId: workspaceId });
  try {
    const [v, iv, tag, data] = blob.split(".");
    if (v !== "m1") return null;
    const d = createDecipheriv("aes-256-gcm", key(workspaceId), Buffer.from(iv, "base64"));
    d.setAAD(Buffer.from(`${workspaceId}|${rowId}`));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Replace any occurrence of a secret in text (defence in depth for error strings that might echo a header). */
export function scrub(text: string, secret: string | null | undefined): string {
  if (!secret || secret.length < 6) return text;
  return text.split(secret).join("[secret]");
}
