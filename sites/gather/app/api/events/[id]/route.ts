import { body, checkOrigin, database, failure, viewer } from "@/lib/server";
import { InputError, parseEvent } from "@/lib/validation";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const user = await viewer(), { id } = await params, input = await body(request), db = database();
    if (!input || typeof input !== "object") throw new InputError("Enter your event details.");
    const current = await db.prepare("SELECT owner_id,status FROM events WHERE id=?").bind(id).first<{ owner_id: string; status: string }>();
    if (!current) return Response.json({ error: "Event not found." }, { status: 404 });
    if (current.owner_id !== user.userId) return Response.json({ error: "Only the host can change this event." }, { status: 403 });
    if (input.status === "cancelled") {
      await db.prepare("UPDATE events SET status='cancelled' WHERE id=? AND owner_id=?").bind(id, user.userId).run();
    } else {
      if (current.status === "cancelled") throw new InputError("This event was cancelled. Create a new event to host again.");
      const event = parseEvent(input);
      const result = await db.prepare(`UPDATE events SET host_name=?,title=?,description=?,category=?,venue=?,city=?,starts_at=?,ends_at=?,timezone=?,capacity=?,theme=? WHERE id=? AND owner_id=? AND (SELECT count(*) FROM rsvps WHERE event_id=?) <= ?`)
        .bind(event.hostName, event.title, event.description, event.category, event.venue, event.city, event.startsAt, event.endsAt, event.timezone, event.capacity, event.theme, id, user.userId, id, event.capacity).run();
      if (!result.meta.changes) throw new InputError("Capacity must include everyone who has already registered.");
    }
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}
