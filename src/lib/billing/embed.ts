/**
 * Identity for the embedded Whop checkout. The embed runs in the browser, so anything it sends as metadata could be
 * edited by the buyer. The server therefore signs the account email (keplar_ref) when it renders /checkout; the webhook
 * only trusts an email that carries a valid signature. Without one it falls back to the buyer's own Whop email.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/accounts/secret";

export const EMBED_SOURCE = "keplar-embed";

const sig = (email: string) => createHmac("sha256", authSecret()).update(`whop-embed|${email}`).digest("base64url");

export function signEmbedRef(email: string): string {
  const e = email.trim().toLowerCase();
  return `${Buffer.from(e, "utf8").toString("base64url")}.${sig(e)}`;
}

/** The email inside a valid ref, or null. */
export function verifyEmbedRef(ref: unknown): string | null {
  if (typeof ref !== "string" || ref.length > 400) return null;
  const [b, s] = ref.split(".");
  if (!b || !s) return null;
  const email = Buffer.from(b, "base64url").toString("utf8");
  const want = Buffer.from(sig(email));
  const got = Buffer.from(s);
  return got.length === want.length && timingSafeEqual(got, want) ? email : null;
}

/** Metadata the embed attaches to the payment/membership. Values are strings (Whop limit: 40 pairs). */
export function embedMetadata(input: { email: string; plan: string; workspaceId: string }): Record<string, string> {
  const email = input.email.trim().toLowerCase();
  return { email, plan: input.plan, workspace_id: input.workspaceId, source: EMBED_SOURCE, keplar_ref: signEmbedRef(email) };
}
