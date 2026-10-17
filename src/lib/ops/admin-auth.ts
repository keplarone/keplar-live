/**
 * Admin gate: a verified, signed-in session whose email is in KEPLAR_ADMIN_EMAILS (default team@keplar.one). Server-side only.
 * Every /admin page and /api/admin route goes through adminFromHeaders or requireAdmin.
 *
 * KEPLAR_ADMIN_REQUIRE_MFA=1 also requires the admin account to have an authenticator app (TOTP) turned on. That guarantees the
 * session passed a second factor: with TOTP on, every sign-in method leaves the session mfa_pending until the code (or a
 * user-verified passkey) is given, and getSession refuses pending sessions. A passkey alone is not enough here, because an
 * email-link sign-in to a passkey-only account is a single factor. Fails closed: if the 2FA setting can't be read, no admin.
 * Off by default so turning it on can't lock the founder out: set up the authenticator first (Account > Two-factor), then set it.
 */
import { securityEvent } from "@/lib/security/events";
import { getSession } from "@/lib/accounts/auth";
import { mfaEnabled } from "@/lib/accounts/mfa/store";
import { isAdminEmail } from "@/lib/billing/admin";
import { HttpError } from "@/lib/create/platform/http";

export const adminMfaRequired = (env: Record<string, string | undefined> = process.env) => /^(1|true|on|yes)$/i.test(env.KEPLAR_ADMIN_REQUIRE_MFA?.trim() ?? "");

export async function adminFromHeaders(headers: Headers): Promise<{ email: string } | null> {
  const s = await getSession(headers).catch(() => null);
  if (!s || !s.user.emailVerified || !isAdminEmail(s.user.email)) return null;
  if (adminMfaRequired() && !(await mfaEnabled(s.user.id).catch(() => false))) {
    console.warn("[admin] refused: KEPLAR_ADMIN_REQUIRE_MFA is on and this admin account has no authenticator app");
    return null;
  }
  return { email: s.user.email.toLowerCase() };
}

/** API routes: non-admins get a plain 404 (the surface is not advertised). */
export async function requireAdmin(req: Request): Promise<{ email: string }> {
  const a = await adminFromHeaders(req.headers);
  if (!a) {
    securityEvent({ kind: "authz.denied", code: "admin_refused", req, status: 404 });
    throw new HttpError(404, "Not found.", "not_found");
  }
  return a;
}
