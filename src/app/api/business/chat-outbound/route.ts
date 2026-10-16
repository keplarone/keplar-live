import { body, errorResponse, json, HttpError } from "@/lib/create/platform/http";
import { decide } from "@/lib/business/agents";
import { connectorState, draftEmail, emailAction, eventAction, queueChatOutbound, type ChatConnector } from "@/lib/business/chat-outbound";
import { owner } from "../_owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isConnector = (c: unknown): c is ChatConnector => c === "gmail" || c === "gcal";

/** Whether Gmail or Google Calendar can take an action from the chat right now. */
export async function GET(req: Request) {
  try {
    const ws = await owner(req);
    const c = new URL(req.url).searchParams.get("connector");
    if (!isConnector(c)) throw new HttpError(400, "Unknown connector.");
    return json({ state: await connectorState(ws.id, c) });
  } catch (e) {
    return errorResponse(e);
  }
}

type Post =
  | { op: "draft"; to?: string; about?: string }
  | { op: "send"; kind: "email"; key: string; to?: string; subject?: string; body?: string }
  | { op: "send"; kind: "event"; key: string; title?: string; description?: string; start?: string; end?: string };

/**
 * draft: a starting email for the card (nothing is sent).
 * send:  the person pressed Send or Add on the card. The exact action they saw is queued as one approval and approved through
 *        the Approvals path; the reply is that approval as it stands ("sent" only when the provider confirmed it).
 */
export async function POST(req: Request) {
  try {
    const ws = await owner(req);
    const b = await body<Post>(req);
    if (b.op === "draft") {
      const to = String(b.to ?? "").trim().slice(0, 254);
      const about = String(b.about ?? "").trim().slice(0, 600);
      const [draft, state] = await Promise.all([draftEmail(to, about), connectorState(ws.id, "gmail")]);
      return json({ ...draft, state });
    }
    if (b.op !== "send") throw new HttpError(400, "Unknown request.");
    const action = b.kind === "email" ? emailAction(b) : b.kind === "event" ? eventAction(b) : null;
    if (!action) throw new HttpError(400, "Unknown request.");
    const queued = await queueChatOutbound(ws, action, String(b.key ?? ""));
    if (queued.status !== "pending") return json({ approval: { id: queued.approvalId, status: queued.status, result: queued.result ?? null } });
    const done = await decide(ws, queued.approvalId, "approve");
    return json({ approval: { id: queued.approvalId, status: done?.status ?? "pending", result: done?.result ?? null } });
  } catch (e) {
    return errorResponse(e);
  }
}
