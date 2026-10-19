import { body, checkOrigin, database, eventSelect, failure, normalized, viewer } from "@/lib/server";
import { parseEvent } from "@/lib/validation";
export async function GET() {
  try {
    const user = await viewer();
    const data = await database().prepare(eventSelect + " ORDER BY e.starts_at ASC").bind(user.userId, user.userId).all();
    return Response.json({ events: data.results.map(normalized) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await viewer(), event = parseEvent(await body(request)), id = crypto.randomUUID();
    await database().prepare(`INSERT INTO events (id,owner_id,host_name,title,description,category,venue,city,starts_at,ends_at,timezone,capacity,theme,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'published',?)`)
      .bind(id, user.userId, event.hostName, event.title, event.description, event.category, event.venue, event.city, event.startsAt, event.endsAt, event.timezone, event.capacity, event.theme, new Date().toISOString()).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) { return failure(error); }
}
