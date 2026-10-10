/**
 * Desktop sign-in through the system browser: the pure pieces (no I/O), shared by the server and unit-tested alone.
 *
 * The desktop app never shows a login form. It asks the server for a sign-in request, opens that page in the user's
 * default browser (where Google, Microsoft, password and email links already work), and gets back a ONE-TIME CODE that
 * only its own PKCE verifier can redeem:
 *
 *   app    : verifier = 32 random bytes; challenge = base64url(sha256(verifier))        -> POST /desktop/start {challenge}
 *   browser: signs in, then presses "Open Keplar One"                                    -> POST /desktop/approve {rid}
 *            -> keplar://auth?code=<one-time>&rid=<id>   (the app's custom protocol)
 *   app    : POST /desktop/exchange {rid, code, verifier}  -> a finish ticket            (single use, 60 s)
 *            then loads GET /desktop/finish?ticket=...   in its window, which sets the session cookie
 *   fallback (protocol handler not registered): the app polls POST /desktop/poll {rid, verifier} and receives the same code.
 *
 * A stolen code is useless without the verifier (the app instance that started the request), codes work once and die
 * after 2 minutes, and a request itself dies after 10.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const REQUEST_TTL_SECONDS = 10 * 60;
export const CODE_TTL_SECONDS = 2 * 60;
export const FINISH_TTL_SECONDS = 60;
/** Wrong verifier / wrong code guesses on one request before it is cancelled. */
export const MAX_BAD_ATTEMPTS = 6;
export const DEEP_LINK_SCHEME = "keplar:";

export type Status = "pending" | "approved" | "used" | "finished" | "cancelled" | "denied";

const B64URL = /^[A-Za-z0-9_-]+$/;
/** base64url(sha256(...)) is always 43 characters. */
export const isChallenge = (v: unknown): v is string => typeof v === "string" && v.length === 43 && B64URL.test(v);
/** RFC 7636: 43 to 128 unreserved characters. */
export const isVerifier = (v: unknown): v is string => typeof v === "string" && v.length >= 43 && v.length <= 128 && B64URL.test(v);
export const isRequestId = (v: unknown): v is string => typeof v === "string" && v.length === 32 && B64URL.test(v);
export const isSecret = (v: unknown): v is string => typeof v === "string" && v.length === 43 && B64URL.test(v);

export const challengeOf = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");
export const newRequestId = (): string => randomBytes(24).toString("base64url");
export const newSecret = (): string => randomBytes(32).toString("base64url");
export const hashSecret = (secret: string): string => createHash("sha256").update(secret).digest("hex");

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export const verifierMatches = (challenge: string, verifier: string): boolean => isVerifier(verifier) && same(challengeOf(verifier), challenge);
export const secretMatches = (storedHash: string, presented: string): boolean => isSecret(presented) && same(hashSecret(presented), storedHash);

/** Letters and digits without look-alikes (no 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/**
 * A short code both the app and the browser page show ("K7F-2QM") so the person can see they are approving the request
 * they just started, not someone else's link. Derived from the request id with the server key, so it needs no storage.
 */
export function displayCode(key: string, requestId: string): string {
  const mac = createHmac("sha256", key).update(`keplar:desktop-auth:display:${requestId}`).digest();
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[mac[i] % ALPHABET.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export function deepLinkFor(code: string, requestId: string): string {
  return `keplar://auth?code=${encodeURIComponent(code)}&rid=${encodeURIComponent(requestId)}`;
}

/** What the app does with a keplar:// link. Returns null for anything that is not a well-formed auth link. */
export function parseAuthDeepLink(raw: string): { code: string; rid: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== DEEP_LINK_SCHEME || url.hostname !== "auth" || url.username || url.password) return null;
  const code = url.searchParams.get("code");
  const rid = url.searchParams.get("rid");
  return isSecret(code) && isRequestId(rid) ? { code, rid } : null;
}

/** A device label for the confirm page ("Keplar One on Windows"): short, printable, nothing the sender can use to impersonate. */
export function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") return "Keplar One desktop";
  const s = raw.replace(/[^\p{L}\p{N} ._()-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return s || "Keplar One desktop";
}

/** The page that opens in the browser. `rid` is unguessable, so the link itself is the capability to approve. */
export const connectPath = (rid: string) => `/desktop/connect?rid=${encodeURIComponent(rid)}`;
