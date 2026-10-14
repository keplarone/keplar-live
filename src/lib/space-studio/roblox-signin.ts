/**
 * "Sign in with Roblox" for Space Studio, for Roblox accounts ALREADY LINKED to a Keplar account.
 *
 * Keplar accounts are keyed by a verified email (Better Auth users, src/lib/accounts). Roblox OAuth gives no email, so a Roblox
 * identity can't create an account on its own. Instead:
 *   start     GET /api/space-studio/auth/roblox/start?next=/space-studio  (this repo's route) -> Roblox OAuth (openid profile, PKCE S256,
 *             state + nonce sealed into an httpOnly cookie scoped to /api/auth/space-studio/roblox, 10 minutes).
 *   callback  GET /api/auth/space-studio/roblox/callback (a Better Auth endpoint, src/lib/accounts/space-roblox-auth.ts): state checked
 *             in constant time, code exchanged with the verifier, userinfo read. If that Roblox user id is linked to a workspace
 *             (space_identity_index, claimed by Roblox OAuth while signed in), a normal Keplar session is started for that workspace's
 *             owner the same way every other sign-in does (startSession: session cookies, session record, new-device email, two-factor
 *             still required when the account has it). Otherwise nothing is signed in and the person is sent to /signin with
 *             error=roblox_not_linked to sign in with Keplar or Google and link Roblox from Space Studio.
 * The callback lives under /api/auth so the desktop app's sign-in window (which finishes on any keplar.one page outside /signin and
 * /api/auth) doesn't close before the session exists.
 */
import { getWorkspace } from "@/lib/accounts/workspaces";
import { isTeamId } from "@/lib/team/rows";
import { indexReader, loadIdentities } from "./store";

export type RobloxSignInTarget = { ok: true; workspaceId: string; email: string; userId: string } | { ok: false; code: "roblox_not_linked" | "roblox_account_unavailable" };

/** Which Keplar account (if any) a Roblox user id signs in to. Only a linked, still-present identity on a personal workspace counts. */
export async function robloxSignInTarget(subject: string): Promise<RobloxSignInTarget> {
  const owner = await indexReader.ownerOf("roblox", subject);
  if (!owner) return { ok: false, code: "roblox_not_linked" };
  if (!(await loadIdentities(owner)).some((i) => i.provider === "roblox" && i.subject === subject)) return { ok: false, code: "roblox_not_linked" };
  if (isTeamId(owner)) return { ok: false, code: "roblox_account_unavailable" };
  const ws = await getWorkspace(owner);
  if (!ws?.ownerEmail || !ws.ownerUserId) return { ok: false, code: "roblox_account_unavailable" };
  return { ok: true, workspaceId: owner, email: ws.ownerEmail, userId: ws.ownerUserId };
}
