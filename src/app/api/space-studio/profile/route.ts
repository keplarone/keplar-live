import { limitRequest } from "@/lib/create/platform/ratelimit";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { spaceOwner, spaceSession } from "@/lib/space-studio/account";
import { loadProfile, profileView, saveProfile, validateProfile } from "@/lib/space-studio/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET -> { profile: { completed, ageBand, role, experience, goals, workspaces, consents, parentConsent: { status, emailSent? } } | null }
 * The birth date and the parent's email are never returned.
 */
export async function GET(req: Request) {
  try {
    const ws = await spaceOwner(req, false);
    return json({ profile: profileView(await loadProfile(ws.id)) });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST { birthDate: "YYYY-MM-DD", role?, experience?, goals?, workspaces?, consents: { productEmails, improveWithUsage }, parentEmail? }
 * -> { profile }. Under 13 needs parentEmail (not the account's own); a consent email is sent and chat waits for the parent's approval.
 * 400 bad_birth_date / bad_consents / parent_email_required / bad_parent_email, 409 birth_date_locked.
 */
export async function POST(req: Request) {
  try {
    await limitRequest(req, "space-profile", { perIp: 20 });
    const ws = await spaceOwner(req, true, 20);
    const s = await spaceSession(req);
    if (!s) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
    const input = validateProfile(await body<unknown>(req), s.email);
    return json({ profile: profileView(await saveProfile(ws.id, s.email, input)) });
  } catch (e) {
    return errorResponse(e);
  }
}
