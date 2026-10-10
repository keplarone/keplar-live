/** POST { email, role } -> a DRAFT invite. Nothing is sent. Owner and admins (admins can only invite members and viewers). */
import { body, errorResponse, json } from "@/lib/create/platform/http";
import { teamAs } from "@/lib/team/api";
import { draftInvite } from "@/lib/team/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const a = await teamAs(req, id, "manage");
    const b = await body<{ email?: unknown; role?: unknown }>(req);
    const inv = await draftInvite(a.access.team, a.access.role, a.actor, b.email, b.role);
    return json({ invite: { id: inv.id, email: inv.email, role: inv.role, status: inv.status } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
