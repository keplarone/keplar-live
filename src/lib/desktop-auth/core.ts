/**
 * Desktop sign-in through the system browser: the pure pieces (no I/O), shared by the server and unit-tested alone.
 *
 * The desktop app never shows a login form. It asks the server for a sign-in request, opens that page in the user's
 * default browser (where Google, Microsoft, password and email links already work), and gets back a ONE-TIME CODE that
 * only its own PKCE verifier can redeem:
 *
 *   app    : verifier = 32 random bytes; challenge = base64url(sha256(verifier))        -> POST /desktop/start {challenge}
 *   browser: signs in, types the short code the app shows, presses Connect                -> POST /desktop/approve {rid, code}
 *            -> keplar://auth?code=<one-time>&rid=<id>   (the app's custom protocol)
 *   app    : POST /desktop/exchange {rid, code, verifier}  -> a finish ticket            (single use, 60 s)
 *            then loads GET /desktop/finish?ticket=...   in its window, which sets the session cookie (only there: see
 *            src/lib/accounts/desktop-auth.ts, so nobody can sign YOUR browser in to THEIR account with their ticket)
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

/**
 * Which desktop app started a sign-in. Keplar One (keplar.one, keplar:// links) and Keplar Business (business.keplar.one,
 * keplar-business:// links, its own repo) share this protocol; each finishes on its own host, so each gets its own session.
 */
export type DesktopApp = "one" | "business" | "extension";
export const DESKTOP_APPS: Record<DesktopApp, { name: string; scheme: string; home: string }> = {
  one: { name: "Keplar One", scheme: DEEP_LINK_SCHEME, home: "/app" },
  business: { name: "Keplar Business", scheme: "keplar-business:", home: "/work" },
  // The browser extension (extension/): it has no link scheme of its own and never gets a browser session. It polls with its verifier
  // and receives an API key for the person's own workspace (src/lib/api/extension.ts); /desktop/finish refuses its tickets.
  extension: { name: "Keplar One extension", scheme: "keplar-extension:", home: "/app" },
};
/** "business" and "extension" by name; anything else is Keplar One (older apps send nothing). */
export const appOf = (raw: unknown): DesktopApp => (raw === "business" ? "business" : raw === "extension" ? "extension" : "one");

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
 * A short code the app shows ("K7F-2QM") and the person types on the browser page to approve, so they can only approve the
 * request of the app in front of them, not a link someone else started and sent (the page never shows it). Derived from the
 * request id with the server key, so it needs no storage.
 */
export function displayCode(key: string, requestId: string): string {
  const mac = createHmac("sha256", key).update(`keplar:desktop-auth:display:${requestId}`).digest();
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[mac[i] % ALPHABET.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

/** Does what the person typed match the request's code? Case, spaces and the dash don't matter ("k7f 2qm" is "K7F-2QM"). */
export function displayCodeMatches(key: string, requestId: string, typed: unknown): boolean {
  if (typeof typed !== "string" || typed.length > 32) return false;
  const norm = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return same(norm, displayCode(key, requestId).replace("-", ""));
}

export function deepLinkFor(code: string, requestId: string, app: DesktopApp = "one"): string {
  return `${DESKTOP_APPS[app].scheme}//auth?code=${encodeURIComponent(code)}&rid=${encodeURIComponent(requestId)}`;
}

/** What the app does with its auth link (keplar:// or keplar-business://). Returns null for anything that is not a well-formed auth link. */
export function parseAuthDeepLink(raw: string, app: DesktopApp = "one"): { code: string; rid: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== DESKTOP_APPS[app].scheme || url.hostname !== "auth" || url.username || url.password) return null;
  const code = url.searchParams.get("code");
  const rid = url.searchParams.get("rid");
  return isSecret(code) && isRequestId(rid) ? { code, rid } : null;
}

/** A device label for the confirm page ("Keplar One on Windows"): short, printable, nothing the sender can use to impersonate. */
export function cleanLabel(raw: unknown, app: DesktopApp = "one"): string {
  const fallback = app === "extension" ? DESKTOP_APPS.extension.name : `${DESKTOP_APPS[app].name} desktop`;
  if (typeof raw !== "string") return fallback;
  const s = raw.replace(/[^\p{L}\p{N} ._()-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return s || fallback;
}

/** The page that opens in the browser. `rid` is unguessable, so the link itself is the capability to approve. */
export const connectPath = (rid: string) => `/desktop/connect?rid=${encodeURIComponent(rid)}`;
