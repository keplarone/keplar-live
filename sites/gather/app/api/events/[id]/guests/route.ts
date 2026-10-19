import { database, failure, viewer } from "@/lib/server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await viewer(), { id } = await params, db = database();
    const event = await db.prepare("SELECT owner_id FROM events WHERE id=?").bind(id).first<{ owner_id: string }>();
    if (!event) return Response.json({ error: "Event not found." }, { status: 404 });
    if (event.owner_id !== user.userId) return Response.json({ error: "Only the host can view the guest list." }, { status: 403 });
    const data = await db.prepare("SELECT name,email,created_at AS createdAt FROM rsvps WHERE event_id=? ORDER BY created_at").bind(id).all();
    return Response.json({ guests: data.results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
