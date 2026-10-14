/**
 * Google + Microsoft sign-in (Better Auth socialProviders), DB-less.
 *
 * - A provider is enabled only when both its env vars are set; otherwise it is
 *   left out of `socialProviders` entirely and its button is hidden, so a
 *   missing key can never produce an error page.
 * - Callback URLs are Better Auth's `${BETTER_AUTH_URL}/api/auth/callback/<id>`:
 *   https://keplar.one/api/auth/callback/google and …/callback/microsoft.
 * - Stateless: OAuth state/PKCE live in an encrypted cookie (Better Auth's
 *   default with no `database`), and the session is the same JWE cookie the
 *   magic link sets. The user id is derived from the verified email exactly as
 *   in the magic-link flow (userIdForEmail), so Google, Microsoft and the email
 *   link all land on the same account for the same address.
 * - Only provider-verified emails are accepted (an unverified email claim
 *   could otherwise impersonate another address's account).
 */
import type { SocialProviders } from "better-auth/social-providers";

export type OAuthProviderId = "google" | "microsoft";
type Env = Record<string, string | undefined>;

/** Microsoft's fixed tenant id for personal (consumer) Microsoft accounts. */
export const MICROSOFT_CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

const val = (env: Env, ...keys: string[]) => {
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return undefined;
};

export function oauthCredentials(env: Env = process.env) {
  // GOOGLE_SIGNIN_* was the earlier name; still honored.
  const googleId = val(env, "GOOGLE_CLIENT_ID", "GOOGLE_SIGNIN_CLIENT_ID");
  const googleSecret = val(env, "GOOGLE_CLIENT_SECRET", "GOOGLE_SIGNIN_CLIENT_SECRET");
  const msId = val(env, "MICROSOFT_CLIENT_ID");
  const msSecret = val(env, "MICROSOFT_CLIENT_SECRET");
  return {
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
    microsoft: msId && msSecret ? { clientId: msId, clientSecret: msSecret } : null,
  };
}

/** Which buttons to render. Safe to pass to client components (booleans only). */
export function enabledOAuthProviders(env: Env = process.env): Record<OAuthProviderId, boolean> {
  const c = oauthCredentials(env);
  return { google: Boolean(c.google), microsoft: Boolean(c.microsoft) };
}

/**
 * Is the email on a Microsoft ID token verified by Microsoft?
 * - Personal accounts (consumer tenant): the address is the Microsoft account itself.
 * - Work/school accounts: `email_verified`, `verified_primary_email` /
 *   `verified_secondary_email`, or `xms_edov` (email domain verified by the
 *   tenant) — the latter two are optional claims (see oauth-setup.md).
 */
export function microsoftEmailVerified(profile: Record<string, unknown>): boolean {
  const email = typeof profile.email === "string" ? profile.email.toLowerCase() : "";
  if (!email) return false;
  if (profile.email_verified === true || profile.email_verified === "true") return true;
  if (profile.tid === MICROSOFT_CONSUMER_TENANT_ID) return true;
  const lists = [profile.verified_primary_email, profile.verified_secondary_email].flatMap((l) => (Array.isArray(l) ? l : typeof l === "string" ? [l] : []));
  if (lists.some((e) => typeof e === "string" && e.toLowerCase() === email)) return true;
  return profile.xms_edov === true || profile.xms_edov === "true" || profile.xms_edov === 1;
}

export function socialProvidersFromEnv(env: Env = process.env): SocialProviders {
  const c = oauthCredentials(env);
  const out: SocialProviders = {};
  if (c.google) {
    out.google = { ...c.google, prompt: "select_account" };
  }
  if (c.microsoft) {
    out.microsoft = {
      ...c.microsoft,
      // "common": personal Microsoft accounts and any work/school tenant.
      tenantId: "common",
      // No offline_access: tokens aren't kept, so don't ask for long-lived access.
      disableDefaultScope: true,
      scope: ["openid", "profile", "email", "User.Read"],
      prompt: "select_account",
      // The photo would be inlined as a data URL into the session cookie.
      disableProfilePhoto: true,
      mapProfileToUser: (profile) => ({ emailVerified: microsoftEmailVerified(profile as Record<string, unknown>) }),
    };
  }
  return out;
}

/** OAuth error codes → short, human copy for /signin?error=… */
export function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "link") return "That link expired or was already used. Request a new one.";
  if (code === "desktop_link_used") return "That desktop sign-in link expired or was already used. Click Sign in in the Keplar One app to start again.";
  if (code === "roblox_not_linked") return "That Roblox account isn't linked to a Keplar account yet. Sign in with your email or Google first, then link Roblox in Space Studio (Account). After that, Sign in with Roblox works.";
  if (code === "roblox_not_configured") return "Sign in with Roblox isn't available right now. Sign in with your email or Google.";
  if (code === "roblox_account_unavailable") return "We couldn't sign you in with that Roblox account. Sign in with your email or Google.";
  if (code === "access_denied") return "Sign-in was canceled. Try again, or use an email link.";
  if (code === "unable_to_create_user" || code === "email_not_verified" || code === "email_not_found")
    return "We couldn't confirm a verified email address from that account. Try another account, or use an email link.";
  return "That sign-in didn't complete. Try again, or use an email link.";
}
