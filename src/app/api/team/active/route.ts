/** POST { teamId: string | null } -> switch the workspace the app works in (a cookie; membership is re-checked on every request). null = personal. */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { teamAs, accountOf } from "@/lib/team/api";
import { teamCookie } from "@/lib/team/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = await body<{ teamId?: unknown }>(req);
    const secure = new URL(req.url).protocol === "https:";
    if (b.teamId === null || b.teamId === undefined || b.teamId === "") {
      await accountOf(req);
      const res = json({ ok: true, active: null });
      res.headers.append("set-cookie", teamCookie(null, secure));
      return res;
    }
    const a = await teamAs(req, String(b.teamId), "read");
    const res = json({ ok: true, active: a.access.team.id, role: a.access.role, name: a.access.team.name });
    res.headers.append("set-cookie", teamCookie(a.access.team.id, secure));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
