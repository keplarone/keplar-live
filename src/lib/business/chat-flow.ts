/**
 * Agents started from the chat (Agent mode): which workflow a message asks for, the four steps the card shows
 * (Schedule → data step → Draft → Owner approval), and how a real run's steps and approvals fill those cards in.
 * Pure (no I/O), shared by the route and the chat card, and unit-tested. The run itself is the normal agent run
 * (agents.ts runAgent with forceApproval), so every outbound action waits for the owner.
 */
import type { OutboundAction, WorkflowTemplate } from "./types";

export type ChatTemplate = Extract<WorkflowTemplate, "lead-sweep" | "invoice-reminder" | "weekly-report" | "daily-brief" | "monitor" | "social-post">;
export const CHAT_TEMPLATES: ChatTemplate[] = ["lead-sweep", "daily-brief", "weekly-report", "invoice-reminder", "monitor", "social-post"];

/** Names and schedules of the chat workflows before anything runs; a test keeps them equal to agents.ts TEMPLATES. */
export const CHAT_INFO: Record<ChatTemplate, { name: string; trigger: string }> = {
  "lead-sweep": { name: "Lead follow-ups", trigger: "Weekdays at 09:00 (America/New_York)" },
  "daily-brief": { name: "Daily brief", trigger: "Every day at 08:00 (America/New_York)" },
  "weekly-report": { name: "Weekly report", trigger: "Mondays 9:00 ET" },
  "invoice-reminder": { name: "Proposal reminder", trigger: "Weekdays 10:00 ET" },
  monitor: { name: "Page monitor (BETA)", trigger: "Every day at 09:00 (America/New_York)" },
  "social-post": { name: "Social post", trigger: "Tue + Thu 11:00 ET" },
};

export type ChatPick = { template: ChatTemplate; monitor?: { url: string; keyword?: string } };

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;

/** The workflow a chat message asks for, by plain keywords; null when it doesn't clearly name one (the card then lists them). */
export function pickTemplate(prompt: string): ChatPick | null {
  const t = prompt.toLowerCase();
  const url = prompt.match(URL_RE)?.[0]?.replace(/[.,;:]+$/, "");
  if (url && /\b(watch|monitor|track|keep an eye|tell me when|alert me|notify me|changes?)\b/.test(t)) {
    const kw = prompt.match(/\b(?:mentions?|says?|contains?|for the word|keyword)\s+["“']?([^"”'\s,.]{2,40})/i)?.[1];
    return { template: "monitor", monitor: { url, ...(kw ? { keyword: kw } : {}) } };
  }
  if (/\b(daily|morning|every day|each day)\b.*\b(brief|summary|digest|update)\b|\bdaily brief\b|\bmorning brief\b/.test(t)) return { template: "daily-brief" };
  if (/\bweekly\b.*\b(report|summary|metrics|numbers)\b|\b(report|summary)\b.*\b(every|each) week\b/.test(t) && !/\blead/.test(t)) return { template: "weekly-report" };
  if (/\bproposals?\b|\binvoices?\b|\bunpaid\b|\bdeals?\b.*\b(stuck|sitting|stale|nudge|remind)/.test(t)) return { template: "invoice-reminder" };
  if (/\bleads?\b|\bfollow[- ]?ups?\b|\bunanswered\b|\bcontact form\b|\binquir(y|ies)\b|\benquir(y|ies)\b/.test(t)) return { template: "lead-sweep" };
  if (/\b(social|instagram|tweet|linkedin|post about)\b/.test(t)) return { template: "social-post" };
  return null;
}

export type FlowNodeKind = "schedule" | "data" | "draft" | "approval";
export type FlowNodeState = "pending" | "active" | "done" | "waiting" | "failed" | "skipped";
export type FlowNode = { kind: FlowNodeKind; label: string; value: string; sub: string; state: FlowNodeState };

/** What each workflow's data, draft and approval steps are called before it runs. */
const PLAN: Record<ChatTemplate, { data: [string, string]; draft: [string, string]; inApp: boolean; noun: string }> = {
  "lead-sweep": { data: ["CRM leads", "Leads from your site nobody has answered"], draft: ["Draft follow-ups", "Short and personal"], inApp: false, noun: "follow-up email" },
  "invoice-reminder": { data: ["Deals in Proposal", "Deals waiting on a reply"], draft: ["Draft reminders", "Polite check-ins"], inApp: false, noun: "reminder email" },
  "weekly-report": { data: ["Orders and leads", "The last 7 days"], draft: ["Write the report", "Two lines for Slack + a Sheets row"], inApp: false, noun: "report post" },
  "daily-brief": { data: ["Business data", "The last 24 hours"], draft: ["Write the brief", "Three sentences, numbers as found"], inApp: true, noun: "brief" },
  monitor: { data: ["Read the page", "Page text only, no JavaScript"], draft: ["Compare", "Lines added and removed"], inApp: true, noun: "change note" },
  "social-post": { data: ["Pick a product", "From your shop"], draft: ["Draft a post", "Under 200 characters"], inApp: false, noun: "scheduled post" },
};

export const isInApp = (t: ChatTemplate) => PLAN[t].inApp;
export const outboundNoun = (t: ChatTemplate) => PLAN[t].noun;

/** The cards before anything ran. `trigger` is the workflow's real schedule label (agents.ts TEMPLATES). */
export function plannedNodes(template: ChatTemplate, trigger: string): FlowNode[] {
  const p = PLAN[template];
  return [
    { kind: "schedule", label: "Schedule", value: scheduleValue(trigger), sub: scheduleSub(trigger), state: "pending" },
    { kind: "data", label: p.data[0], value: "Not run yet", sub: p.data[1], state: "pending" },
    { kind: "draft", label: p.draft[0], value: "Not run yet", sub: p.draft[1], state: "pending" },
    { kind: "approval", label: "Owner approval", value: p.inApp ? "Not needed" : "Required", sub: p.inApp ? "Nothing leaves Keplar" : "Nothing sends without you", state: "pending" },
  ];
}

const scheduleValue = (label: string) => label.replace(/\s*\(([^)]+)\)\s*$/, "").replace(/\s+at\s+\d.*$/i, "").trim() || label;
const scheduleSub = (label: string) => {
  const time = label.match(/\b(\d{1,2}:\d{2})\b/)?.[1];
  const zone = label.match(/\(([^)]+)\)\s*$/)?.[1] ?? label.match(/\b(ET|PT|UTC)\b/)?.[1];
  return [time, zone].filter(Boolean).join(" · ") || "On a schedule";
};

/** Which card a run step belongs to (agents.ts writes these lines). */
export function stepNode(text: string): FlowNodeKind | "start" | "fail" {
  if (/^Started \(/.test(text)) return "start";
  if (/^Failed:/.test(text)) return "fail";
  if (/queued .* for your approval|^Queued |^Auto-sent|^Firewall|^Outbound cap|^Connected app call not made/i.test(text)) return "approval";
  if (/^(Drafted|Wrote|Prepared)\b|^\d+ model calls?$|^Put the (brief|change) in your Keplar inbox/.test(text)) return "draft";
  return "data";
}

export type FlowApproval = { id: string; status: "pending" | "approved" | "rejected" | "cancelled" | "executing" | "sent" | "failed"; risk?: "low" | "medium" | "high"; result?: string; preview: ActionPreview };
export type ActionPreview = { kind: OutboundAction["type"]; to?: string; title: string; body: string };

/** What the owner reads before approving: who it goes to and the exact text. */
export function previewAction(a: OutboundAction): ActionPreview {
  switch (a.type) {
    case "email.send": return { kind: a.type, to: a.to, title: a.subject, body: a.body.slice(0, 4000) };
    case "slack.post": return { kind: a.type, to: a.channel, title: `Slack post to ${a.channel}`, body: a.text.slice(0, 4000) };
    case "social.schedule": return { kind: a.type, to: a.network, title: `${a.network} post`, body: a.text.slice(0, 4000) };
    case "gcal.event": return { kind: a.type, title: a.title, body: a.description.slice(0, 4000) };
    case "github.issue": return { kind: a.type, to: a.repo, title: a.title, body: a.body.slice(0, 4000) };
    case "sheets.append": return { kind: a.type, to: a.sheet, title: `Row for ${a.sheet}`, body: a.row.join(" · ").slice(0, 4000) };
    case "mcp.call": return { kind: a.type, to: a.serverName || a.serverId, title: `Call ${a.tool}`, body: JSON.stringify(a.args).slice(0, 4000) };
  }
}

const firstNumber = (s: string) => Number(s.match(/\b(\d+)\b/)?.[1] ?? NaN);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * The four cards for a run in progress or finished: built only from the run's own step lines and approvals.
 * `running` = the run hasn't reported its end yet.
 */
export function runNodes(template: ChatTemplate, trigger: string, steps: string[], approvals: FlowApproval[], end: { status?: "succeeded" | "failed" | "waiting_approval" | "running" | "stopped"; needs?: { label: string }[]; error?: string } = {}): FlowNode[] {
  const nodes = plannedNodes(template, trigger);
  const [sched, data, draft, appr] = nodes;
  const by = { data: [] as string[], draft: [] as string[], approval: [] as string[] };
  let started = false;
  let failed: string | null = null;
  for (const t of steps) {
    const k = stepNode(t);
    if (k === "start") started = true;
    else if (k === "fail") failed = t.replace(/^Failed:\s*/, "");
    else if (k !== "schedule") by[k].push(t);
  }
  const running = !end.status || end.status === "running";
  if (end.needs?.length) {
    Object.assign(sched, { state: "done", sub: "Set up · not run" });
    Object.assign(data, { state: "failed", value: `Needs ${end.needs.map((n) => n.label).join(" + ")}`, sub: "Connect it to run this workflow" });
    draft.state = "skipped";
    appr.state = "skipped";
    return nodes;
  }
  if (started || steps.length) Object.assign(sched, { state: "done", sub: `${scheduleSub(trigger)} · ran now from chat` });
  else if (running) sched.state = "active";

  if (by.data.length) {
    const t = by.data[0];
    const n = firstNumber(t);
    data.state = "done";
    if (template === "lead-sweep" && Number.isFinite(n)) data.value = plural(n, "new lead");
    else if (template === "invoice-reminder" && Number.isFinite(n)) data.value = plural(n, "deal");
    else data.value = t.length > 48 ? `${t.slice(0, 46)}…` : t;
    if (by.data.length > 1 && template !== "lead-sweep" && template !== "invoice-reminder") data.sub = by.data.slice(1).join(" · ").slice(0, 90);
  } else if (sched.state === "done" && running) data.state = "active";

  const emails = approvals.length;
  if (by.draft.length || emails) {
    draft.state = "done";
    if (template === "lead-sweep" || template === "invoice-reminder") draft.value = plural(emails, "draft");
    else draft.value = by.draft.find((t) => !/model calls?$/.test(t))?.replace(/\s*\(nothing was sent outside Keplar\)/, "") ?? by.draft[0];
    const calls = by.draft.find((t) => /model calls?$/.test(t));
    if (calls) draft.sub = `${draft.sub} · ${calls}`;
  } else if (data.state === "done" && running) draft.state = "active";
  else if (data.state === "done" && !running) Object.assign(draft, { state: "skipped", value: "Nothing to draft" });

  const pending = approvals.filter((a) => a.status === "pending").length;
  const sent = approvals.filter((a) => a.status === "sent" || a.status === "approved").length;
  const rejected = approvals.filter((a) => a.status === "rejected" || a.status === "cancelled").length;
  const failedSend = approvals.filter((a) => a.status === "failed").length;
  if (pending) Object.assign(appr, { state: "waiting", value: "Awaiting you", sub: `${plural(pending, PLAN[template].noun)} · nothing sends without you` });
  else if (emails && sent && !failedSend) Object.assign(appr, { state: "done", value: "Approved", sub: rejected ? `${sent} sent · ${rejected} rejected` : `${plural(sent, PLAN[template].noun)} sent by you` });
  else if (emails && failedSend) Object.assign(appr, { state: "failed", value: sent ? "Partly sent" : "Not sent", sub: `${failedSend} failed to send` });
  else if (emails && rejected) Object.assign(appr, { state: "done", value: "Rejected", sub: "Nothing was sent" });
  else if (!running && PLAN[template].inApp) Object.assign(appr, { state: "done", value: "Not needed", sub: "Nothing left Keplar" });
  else if (!running && !failed) Object.assign(appr, { state: "skipped", value: "Nothing to approve", sub: by.approval[0] ?? "No outbound action this run" });

  if (failed || end.status === "failed") {
    const target = [data, draft, appr].find((x) => x.state === "active" || x.state === "pending") ?? appr;
    Object.assign(target, { state: "failed", value: "Stopped", sub: (failed ?? end.error ?? "The run failed").slice(0, 90) });
  }
  return nodes;
}
