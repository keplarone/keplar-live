import { checkOrigin, database, failure, viewer } from "@/lib/server";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const user = await viewer(), { id } = await params, db = database();
    const event = await db.prepare("SELECT status,starts_at FROM events WHERE id=?").bind(id).first<{ status: string; starts_at: string }>();
    if (!event) return Response.json({ error: "Event not found." }, { status: 404 });
    if (event.status !== "published" || Date.parse(event.starts_at) <= Date.now()) return Response.json({ error: "Registration is closed for this event." }, { status: 409 });
    // Capacity and insertion are checked atomically. The unique index makes retries safe.
    await db.prepare(`INSERT OR IGNORE INTO rsvps (id,event_id,user_id,name,email,created_at)
      SELECT ?,id,?,?,?,? FROM events WHERE id=? AND status='published' AND starts_at>?
      AND (SELECT count(*) FROM rsvps WHERE event_id=events.id)<capacity`)
      .bind(crypto.randomUUID(), user.userId, user.displayName, user.email, new Date().toISOString(), id, new Date().toISOString()).run();
    const saved = await db.prepare("SELECT id FROM rsvps WHERE event_id=? AND user_id=?").bind(id, user.userId).first();
    if (!saved) return Response.json({ error: "This event just filled up. Try another event." }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const user = await viewer(), { id } = await params;
    await database().prepare("DELETE FROM rsvps WHERE event_id=? AND user_id=?").bind(id, user.userId).run();
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
