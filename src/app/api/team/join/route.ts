/**
 * Accepting an invite. The link's token travels in the URL fragment, so the page posts it here.
 *   POST { token, action: "preview" } -> { teamName, role } if the link is still valid (no sign-in needed; nothing about members is shown).
 *   POST { token, action: "accept" }  -> join (signed in and verified, with the address the invite was sent to).
 */
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { limitRequest } from "@/lib/create/platform/ratelimit";
import { accountOf } from "@/lib/team/api";
import { teamCookie } from "@/lib/team/resolve";
import { acceptInvite, previewInvite } from "@/lib/team/store";
import { effectivePlanOf } from "@/lib/team/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = await body<{ token?: unknown; action?: unknown }>(req);
    const token = typeof b.token === "string" ? b.token.trim() : "";
    await limitRequest(req, "team-join", { perIp: 30 });
    if (b.action === "accept") {
      const acc = await accountOf(req);
      const out = await acceptInvite(token, { userId: acc.userId, email: acc.email, name: acc.name, verified: acc.verified });
      // A Business owner's team: the page offers Keplar Business, where the teammate now works in the owner's workspace.
      const business = (await effectivePlanOf(out.team).catch(() => "free")) === "business";
      const res = json({ ok: true, team: { id: out.team.id, name: out.team.name }, role: out.role, business });
      res.headers.append("set-cookie", teamCookie(out.team.id, new URL(req.url).protocol === "https:"));
      return res;
    }
    const p = await previewInvite(token);
    if (!p) throw new HttpError(404, "This invite link is not valid any more. Ask for a new one.", "invite_invalid");
    return json({ teamName: p.teamName, role: p.role });
  } catch (e) {
    return errorResponse(e);
  }
}
