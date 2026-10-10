/** GET -> everything shared in the team as one JSON file (owner only): members, invites, audit log, shared projects, chats and sites. Secrets are redacted. */
import { errorResponse } from "@/lib/create/platform/http";
import { exportChunks } from "@/lib/privacy/account-data";
import { teamAs } from "@/lib/team/api";
import { audit } from "@/lib/team/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const a = await teamAs(req, id, "owner");
    const team = a.access.team;
    await audit(team.id, a.actor, "export.downloaded", team.name);
    const enc = new TextEncoder();
    const gen = exportChunks(team.id, { id: team.id, email: a.email, name: team.name });
    const stream = new ReadableStream<Uint8Array>({
      async pull(c) {
        const n = await gen.next();
        if (n.done) c.close();
        else c.enqueue(enc.encode(n.value));
      },
    });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(stream, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="keplar-team-export-${day}.json"`, "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
