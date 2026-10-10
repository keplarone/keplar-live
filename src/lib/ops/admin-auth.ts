/** Admin gate: a verified, signed-in session whose email is in KEPLAR_ADMIN_EMAILS (default team@keplar.one). Server-side only. */
import { getSession } from "@/lib/accounts/auth";
import { isAdminEmail } from "@/lib/billing/admin";
import { HttpError } from "@/lib/create/platform/http";

export async function adminFromHeaders(headers: Headers): Promise<{ email: string } | null> {
  const s = await getSession(headers).catch(() => null);
  if (!s || !s.user.emailVerified || !isAdminEmail(s.user.email)) return null;
  return { email: s.user.email.toLowerCase() };
}

/** API routes: non-admins get a plain 404 (the surface is not advertised). */
export async function requireAdmin(req: Request): Promise<{ email: string }> {
  const a = await adminFromHeaders(req.headers);
  if (!a) throw new HttpError(404, "Not found.", "not_found");
  return a;
}
