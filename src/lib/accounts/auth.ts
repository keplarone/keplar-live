/**
 * Accounts: Better Auth (chosen over Auth.js — see docs/accounts-billing.md §1).
 * - Email magic link (the link proves the address, so new users are created
 *   with emailVerified: true), Google and Microsoft (verified emails only;
 *   each shown only when its env vars are set, see ./oauth.ts).
 * - Email + password (verified email required) via ./password-auth.ts, available when DATABASE_URL is set.
 * - Each new user gets a workspace (tenant) via databaseHooks.
 * - Built-in rate limiting on auth endpoints (memory; Upstash-backed
 *   secondary storage in production).
 * - Stateless (no `database`): Vercel serves each request from whichever
 *   serverless instance is free, so nothing may live in process memory.
 *   Sessions are Better Auth's encrypted JWE cookie cache and magic links are
 *   HMAC-signed tokens (./magic-token.ts), both verifiable on any instance.
 * - With DATABASE_URL (Neon) set, accounts and sessions are ALSO recorded in
 *   Neon (./persist.ts): users by verified email, one row per signed-in
 *   device. The cookie stays the fast path; `getSession` checks the row, so a
 *   revoked or signed-out-everywhere session stops working on every device
 *   within seconds. Cookies are persistent (60 days, sliding). Without
 *   DATABASE_URL nothing changes: sessions are the stateless cookie alone.
 */
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { siteUrl } from "@/lib/site";
import { passkeyAuth } from "./passkeys/auth-plugin";
import { statelessMagicLink } from "./stateless-magic-link";
import { passwordAuth } from "./password-auth";
import { desktopAuth } from "./desktop-auth";
import { spaceRobloxAuth } from "./space-roblox-auth";
import { businessAuth } from "./business-auth";
import { BUSINESS_URL } from "@/lib/business-site";
import { userIdForEmail } from "./magic-token";
import { enabledOAuthProviders, socialProvidersFromEnv } from "./oauth";
import { devToolsEnabled, emailConfigured, sendEmail } from "./outbox";
import { ensureWorkspaceForUser } from "./workspaces";
import { authSecret as secretFromEnv } from "./secret";
import { SESSION_COOKIE_MAX_AGE } from "./session-cookies";
import { guardSession } from "./session-guard";
import { storedUserId } from "./persist";

const oauthEnabled = enabledOAuthProviders();
export const authProviders = { magicLink: true, ...oauthEnabled };

/** Also keys the magic-link HMAC and the plan cookie; never exposed. */
const authSecret = secretFromEnv();

export const auth = betterAuth({
  appName: "Keplar",
  baseURL: process.env.BETTER_AUTH_URL || siteUrl,
  secret: authSecret,
  // Passwords are handled by our own plugin (./password-auth.ts), which fits the stateless-cookie + Neon session
  // model; Better Auth's built-in emailAndPassword would need its own database adapter and tables.
  emailAndPassword: { enabled: false },
  socialProviders: socialProvidersFromEnv(),
  account: {
    // Same verified email = same account, whichever way you sign in.
    accountLinking: { enabled: true, trustedProviders: ["google", "microsoft"] },
    // No provider tokens are needed after sign-in; keep them out of cookies.
    storeAccountCookie: false,
  },
  session: {
    // Persistent login: 60-day cookies, re-issued (sliding) at most once a day while the user is active
    // (the cache refreshes once less than 59 of its 60 days remain).
    expiresIn: SESSION_COOKIE_MAX_AGE,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, strategy: "jwe", maxAge: SESSION_COOKIE_MAX_AGE, refreshCache: { updateAge: SESSION_COOKIE_MAX_AGE - 60 * 60 * 24 } },
  },
  rateLimit: { enabled: true, window: 60, max: 30, storage: "memory" },
  advanced: { useSecureCookies: (process.env.BETTER_AUTH_URL || siteUrl).startsWith("https://") },
  // business.keplar.one (Keplar Business) runs on this same server with its own session cookie (src/lib/business/handoff.ts).
  trustedOrigins: [siteUrl, BUSINESS_URL, "http://localhost:3000", "http://localhost:3001"],
  databaseHooks: {
    user: {
      create: {
        // OAuth sign-ins (magic links never create through the adapter): with no
        // database the user record is rebuilt on every sign-in, so its id must be
        // derived from the verified email, matching the magic-link flow.
        before: async (user) => {
          const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
          if (!email || user.emailVerified !== true) throw new APIError("FORBIDDEN", { code: "email_not_verified", message: "The provider did not confirm a verified email address." });
          return { data: { ...user, id: userIdForEmail(authSecret, email), email, emailVerified: true } };
        },
        after: async (user) => {
          // The stored account id wins over the derived one (same person, same workspace).
          await ensureWorkspaceForUser({ id: (await storedUserId(user.email)) ?? user.id, email: user.email, name: user.name });
        },
      },
    },
  },
  plugins: [
    statelessMagicLink({
      secret: authSecret,
      sendMagicLink: async ({ email, url, expiresInMinutes }) => {
        const sent = await sendEmail({
          to: email,
          kind: "magic-link",
          subject: "Your Keplar sign-in link",
          text: `Sign in to Keplar:\n\n${url}\n\nOpen the link and press "Sign in". It expires in ${expiresInMinutes} minutes and works once. If you didn't ask for it, ignore this email.`,
        });
        // Never answer "sent" for an email that wasn't: Resend refused it, or there is no email provider at all.
        if (!sent && !devToolsEnabled()) {
          throw new APIError(emailConfigured() ? "BAD_GATEWAY" : "SERVICE_UNAVAILABLE", {
            code: emailConfigured() ? "EMAIL_FAILED" : "EMAIL_NOT_CONFIGURED",
            message: emailConfigured() ? "We couldn't send the email just now. Try again in a minute." : "Email delivery isn't configured on this server yet, so we can't send sign-in links.",
          });
        }
      },
    }),
    passwordAuth({ secret: authSecret, origin: () => new URL(process.env.BETTER_AUTH_URL || siteUrl).origin }),
    passkeyAuth(),
    desktopAuth({ secret: authSecret, origin: () => new URL(process.env.BETTER_AUTH_URL || siteUrl).origin }),
    businessAuth({ secret: authSecret }),
    spaceRobloxAuth({ secret: authSecret }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

/** For the /signin/verify landing page (checks a link without consuming it). */
export const magicLinkSecret = () => authSecret;

export async function getSession(headers: Headers): Promise<Session | null> {
  try {
    const s = await auth.api.getSession({ headers });
    if (!s) return null;
    // Revoked / signed-out-everywhere sessions stop here; the account id is the persisted one.
    const checked = await guardSession(s, headers);
    return checked;
  } catch {
    return null;
  }
}
