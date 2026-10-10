/**
 * Invite links for a live session (admins and owners).
 * GET → open links and the people who joined by link. POST { role: "editor"|"viewer", days?, maxUses? } → a new link, shown once.
 * DELETE ?invite=<id> revokes a link (and removes everyone who joined through it); ?user=<id> removes one person.
 */
import { errorResponse, HttpError, json, body } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createInvite, listInvites, removePerson, revokeInvite } from "@/lib/collab/access";
import { access } from "@/lib/collab/caller";
import { isInvitable } from "@/lib/collab/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { access: a } = await access(req, (await params).id);
    return json(await listInvites(a));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { access: a, user } = await access(req, (await params).id);
    await rateLimit(`collab:invite:${user.id}`, 20, 3600, { shared: true });
    const input = await body<{ role?: unknown; days?: unknown; maxUses?: unknown }>(req);
    if (!isInvitable(input.role)) throw new HttpError(400, "Pick Editor or Viewer.");
    const { invite, token } = await createInvite(a, { role: input.role, days: Number(input.days) || 7, maxUses: Number(input.maxUses) || 10 });
    const origin = new URL(req.url).origin;
    // The token travels in the fragment, so it never reaches server logs or a Referer header.
    return json({ invite, url: `${origin}/app/create/live/${a.site.id}#join=${token}` });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { access: a } = await access(req, (await params).id);
    const u = new URL(req.url);
    const inv = u.searchParams.get("invite");
    const person = u.searchParams.get("user");
    if (inv) await revokeInvite(a, inv);
    else if (person) await removePerson(a, person);
    else throw new HttpError(400, "Which invite or person?");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
