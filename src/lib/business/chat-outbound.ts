/**
 * Email and calendar requests from the chat ("email Sam about Friday", "put a meeting with Sam on Friday") go through the
 * person's own connectors (Gmail, Google Calendar), never through Keplar Browser.
 *
 *  - The chat card shows the whole draft or event first. Nothing leaves Keplar until the person presses Send or Add.
 *  - That press queues one approval (agent "chat", like Ask's connected-app calls) and approves it through the same decide()
 *    path the Approvals page uses: AI Firewall, connector checks, and a provider reply that must confirm the write.
 *  - The card only says "Sent" or "Added" when that approval comes back "sent". Anything else is shown as it is.
 */
import { HttpError } from "@/lib/create/platform/http";
import { id as newId, now } from "@/lib/create/platform/ids";
import { isLive } from "@/lib/create/platform/config";
import type { Workspace } from "@/lib/create/platform/workspace";
import { acceptDraft, draftMessages } from "./draft-safety";
import { inspectAction } from "./firewall";
import { OAUTH_CONNECTORS, oauthConfigured } from "./oauth-connectors";
import { approvals, audit, connections } from "./repo";
import type { Approval, OutboundAction } from "./types";

export const CHAT_OUTBOUND_AGENT = "chat";
const TOOL = { gmail: "send_email", gcal: "create_event" } as const;
export type ChatConnector = keyof typeof TOOL;
export type ConnectorState = "ready" | "not_connected" | "tool_off" | "not_configured";

/** Whether the person's Gmail or Calendar can take this action right now, and if not, what is missing. */
export async function connectorState(workspaceId: string, connector: ChatConnector): Promise<ConnectorState> {
  if (!oauthConfigured(connector)) return "not_configured";
  const conn = (await connections().list(workspaceId, (c) => c.connector === connector && c.status === "connected"))[0];
  if (!conn) return "not_connected";
  return conn.tools?.[TOOL[connector]] ? "ready" : "tool_off";
}

const ADDRESS = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]{2,}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The email exactly as the person approved it, or a 422 that says which field is wrong. */
export function emailAction(input: { to?: unknown; subject?: unknown; body?: unknown }): Extract<OutboundAction, { type: "email.send" }> {
  const to = text(input.to, 254);
  const subject = text(input.subject, 200).replace(/[\r\n]+/g, " ");
  const body = text(input.body, 10_000);
  if (!ADDRESS.test(to)) throw new HttpError(422, "Add one email address to send to.", "bad_recipient");
  if (!subject) throw new HttpError(422, "Add a subject.", "no_subject");
  if (!body) throw new HttpError(422, "The email is empty.", "no_body");
  return { type: "email.send", connector: "gmail", to, subject, body };
}

/** The event exactly as the person approved it. Start and end carry their time-zone offset from the person's device. */
export function eventAction(input: { title?: unknown; description?: unknown; start?: unknown; end?: unknown }): Extract<OutboundAction, { type: "gcal.event" }> {
  const title = text(input.title, 200);
  const start = text(input.start, 40);
  const end = text(input.end, 40);
  if (!title) throw new HttpError(422, "Give the event a name.", "no_title");
  if (!DATETIME.test(start) || !DATETIME.test(end)) throw new HttpError(422, "Pick a day and a time.", "bad_time");
  if (Date.parse(end) <= Date.parse(start)) throw new HttpError(422, "The event has to end after it starts.", "bad_time");
  if (Date.parse(end) - Date.parse(start) > 24 * 3_600_000) throw new HttpError(422, "Events from the chat can be up to a day long.", "bad_time");
  return { type: "gcal.event", connector: "gcal", title, description: text(input.description, 4000), start, end };
}

/** The starting draft before any model touches it: plain, honest, and complete enough to send as is. */
export function templateEmail(to: string, about: string): { subject: string; body: string } {
  const name = ADDRESS.test(to) ? "" : to.replace(/^(?:my|our|the)\s+/i, "");
  const topic = about.replace(/^(?:to\s+)?(?:say|tell (?:them|him|her)|let (?:them|him|her) know)\s+(?:that\s+)?/i, "").replace(/[.!?]+$/, "").trim();
  const subject = topic ? topic.charAt(0).toUpperCase() + topic.slice(1, 80) : "Quick note";
  const hello = name ? `Hi ${name.charAt(0).toUpperCase()}${name.slice(1)},` : "Hi,";
  return { subject, body: `${hello}\n\nI wanted to reach out about ${topic || "something"}.\n\nThanks,` };
}

/** A short email draft for the person to read and edit. Live: one model call (links and addresses it adds are refused). */
export async function draftEmail(to: string, about: string): Promise<{ subject: string; body: string; by: "keplar" | "template" }> {
  const start = templateEmail(to, about);
  if (!isLive("codegen") || !process.env.OPENROUTER_API_KEY) return { ...start, by: "template" };
  try {
    const instruction = `Write a short email from the person to ${to}. What it is about, in the person's words: "${about.slice(0, 400)}". Keep it under 120 words, in the person's voice, with no invented dates, prices or promises. Reply with the subject on the first line as "Subject: ..." and then the body. No signature name.`;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.KEPLAR_AGENT_MODEL || "openrouter/auto", provider: { data_collection: "deny" }, messages: draftMessages(`Subject: ${start.subject}\n\n${start.body}`, instruction) }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const out = acceptDraft(data.choices?.[0]?.message?.content ?? "", `${to}\n${start.body}`);
    const m = out ? /^\s*subject:\s*(.+)\n+([\s\S]+)$/i.exec(out) : null;
    if (!m) return { ...start, by: "template" };
    return { subject: m[1].trim().slice(0, 200), body: m[2].trim().slice(0, 10_000), by: "keplar" };
  } catch {
    return { ...start, by: "template" };
  }
}

/**
 * The person pressed Send or Add: queue exactly this action as one pending approval (one per press key, so a double press or
 * a retry never queues twice). Refuses up front when the connector can't take it, so nothing waits on a dead connection.
 */
export async function queueChatOutbound(ws: Workspace, action: OutboundAction, key: string): Promise<{ approvalId: string; status: Approval["status"]; result?: string }> {
  if (!/^[\w-]{8,80}$/.test(key)) throw new HttpError(400, "Missing request key.");
  const connector: ChatConnector = action.type === "email.send" ? "gmail" : action.type === "gcal.event" ? "gcal" : (() => { throw new HttpError(400, "Only email and calendar events can be sent from here."); })();
  const label = OAUTH_CONNECTORS[connector].label;
  const state = await connectorState(ws.id, connector);
  if (state === "not_configured") throw new HttpError(503, `${label} isn't available on Keplar yet. Nothing was sent.`, "not_configured");
  if (state === "not_connected") throw new HttpError(409, `Connect ${label} first. Nothing was sent.`, "not_connected");
  if (state === "tool_off") throw new HttpError(409, `${OAUTH_CONNECTORS[connector].tools[0].label} is switched off for ${label}. Nothing was sent.`, "tool_disabled");
  const runId = `chat_${key}`;
  const dup = (await approvals().list(ws.id, (a) => a.agentId === CHAT_OUTBOUND_AGENT && a.runId === runId))[0];
  if (dup) return { approvalId: dup.id, status: dup.status, ...(dup.result ? { result: dup.result } : {}) };
  const verdict = inspectAction(action);
  if (verdict.blocked) {
    await audit(ws.id, `agent:${CHAT_OUTBOUND_AGENT}`, "firewall.blocked", action.type, verdict.blocked);
    throw new HttpError(422, verdict.blocked, "firewall_blocked");
  }
  const ap: Approval = { id: newId("apr"), workspaceId: ws.id, agentId: CHAT_OUTBOUND_AGENT, runId, action, status: "pending", decidedAt: null, createdAt: now(), risk: verdict.risk, riskReasons: verdict.reasons, runUsd: 0 };
  await approvals().insert(ap);
  await audit(ws.id, `agent:${CHAT_OUTBOUND_AGENT}`, `${action.type}.queued`, connector, `awaiting approval ${ap.id}`);
  return { approvalId: ap.id, status: "pending" };
}
