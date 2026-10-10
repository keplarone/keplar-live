/** Server-side look at an emailed link (verify / reset) for its landing page. Reads only; never consumes the link. */
import { fingerprint, verifyActionToken, type ActionPurpose } from "./action-token";
import { getCredential } from "./credentials";
import { persistenceEnabled } from "./persist";
import { authSecret } from "./secret";

export type LinkState =
  | { state: "ok"; email: string; callback: string }
  | { state: "invalid" | "expired" | "used" | "verified" | "unavailable" };

export async function inspectLink(purpose: ActionPurpose, token: unknown): Promise<LinkState> {
  const res = verifyActionToken(authSecret(), purpose, token);
  if (!res.ok) return { state: res.reason === "expired" ? "expired" : "invalid" };
  if (!persistenceEnabled()) return { state: "unavailable" };
  const { e: email, f, cb } = res.payload;
  try {
    const cred = await getCredential(email);
    if (purpose === "verify" && cred?.verifiedAt && fingerprint(authSecret(), cred.hash) === f) return { state: "verified" };
    if (fingerprint(authSecret(), cred?.hash ?? null) !== f) return { state: "used" };
    if (purpose === "verify" && !cred) return { state: "used" };
    return { state: "ok", email, callback: cb };
  } catch {
    return { state: "unavailable" };
  }
}
