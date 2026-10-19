import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { InputError } from "./validation";
export function database() { if (!env.DB) throw new Error("Database unavailable"); return env.DB; }
export async function viewer() {
  const user = await getChatGPTUser();
  if (!user) throw new Response(JSON.stringify({ error: "Sign in to continue." }), { status: 401, headers: { "Content-Type": "application/json" } });
  return user;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Response(JSON.stringify({ error: "Open Gather and try again." }), { status: 403 });
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 20000) throw new InputError("Event details are too long.");
  const raw = await request.text();
  if (raw.length > 20000) throw new InputError("Event details are too long.");
  try { return JSON.parse(raw); } catch { throw new InputError("Check your event details and try again."); }
}
export function failure(error: unknown) {
  if (error instanceof Response) return error;
  if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
  console.error("Gather request failed", error);
  return Response.json({ error: "Unable to save changes right now. Try again." }, { status: 500 });
}
export const eventSelect = `SELECT e.id, e.title, e.description, e.category, e.venue, e.city,
 e.starts_at AS startsAt, e.ends_at AS endsAt, e.timezone, e.capacity, e.theme,
 e.host_name AS hostName, e.status,
 (SELECT count(*) FROM rsvps r WHERE r.event_id=e.id) AS attending,
 CASE WHEN e.owner_id=? THEN 1 ELSE 0 END AS isHost,
 EXISTS(SELECT 1 FROM rsvps r WHERE r.event_id=e.id AND r.user_id=?) AS isGoing
 FROM events e`;
export function normalized(row: Record<string, unknown>) { return { ...row, isHost: Boolean(row.isHost), isGoing: Boolean(row.isGoing) }; }
