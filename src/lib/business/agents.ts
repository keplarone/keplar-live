/**
 * Agents: scheduled or event-triggered workflows that run server-side.
 * Guardrails (all enforced here, not in the UI):
 *   - Every outbound action becomes an Approval unless the agent has
 *     autoSend enabled (per-agent opt-in, paid plans only).
 *   - Per-agent caps: credits / month, runs / day, outbound / day,
 *     and a USD spend cap; the workspace Usage allowance is checked first.
 *   - Kill switch per agent and for the whole workspace; killing cancels
 *     pending approvals.
 *   - Every step and decision lands in the audit log.
 */
import { securityEvent } from "@/lib/security/events";
import { inCurrentMode } from "./stripe";
import { needMessage, requiredFor, unmetNeeds } from "./oauth-connectors";
import { id, now } from "@/lib/create/platform/ids";
import { charge, estimateUnits, assertCanSpend, USD_PER_UNIT } from "@/lib/create/platform/compute";
import { isLive } from "@/lib/create/platform/config";
import { collection } from "@/lib/create/platform/store";
import { defineJob } from "@/lib/create/platform/queue";
import { HttpError } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { projects } from "@/lib/create/repo";
import { activities, agents, approvalClaims, approvals, audit, contacts, deals, inbox, logActivity, orders, runs } from "./repo";
import { execute } from "./connectors";
import { auditActor, requireBusinessRole } from "./team";
import { inspectAction } from "./firewall";
import { acceptDraft, draftMessages } from "./draft-safety";
import type { Agent, AgentRun, Approval, OutboundAction, WorkflowTemplate } from "./types";
import { assertTimeZone, describeCron, minIntervalMinutes, parseCron } from "./cron";
import { cadenceName, minIntervalFor } from "./schedule-limits";
import { changeSummary, checkPage } from "./monitor";
import { checkUrl } from "@/lib/mcp/ssrf";
import { grantForNewAgent, preflightAgentAction, validateAgentTask } from "@/lib/mcp/gateway";
import { askScheduled, cleanQuestion } from "@/lib/personalize/scheduled";
import { cleanEventConfig, hashHookToken, inboundEmailConfig, newHookToken, newInboxRoute, planEvent, type EventPayload } from "./event-agents";

export const TEMPLATES: Record<WorkflowTemplate, { name: string; description: string; trigger: Agent["trigger"]; outbound: string }> = {
  "lead-followup": { name: "Lead follow-up", description: "Drafts a reply when someone submits a contact form.", trigger: { type: "event", event: "form.submitted" }, outbound: "Email (Gmail/Outlook)" },
  "invoice-reminder": { name: "Proposal reminder", description: "Nudges contacts whose deal has sat in Proposal.", trigger: { type: "schedule", cron: "0 14 * * 1-5", label: "Weekdays 10:00 ET" }, outbound: "Email (Gmail/Outlook)" },
  "weekly-report": { name: "Weekly report", description: "Summarizes revenue, orders, and leads; posts to Slack and logs a row.", trigger: { type: "schedule", cron: "0 13 * * 1", label: "Mondays 9:00 ET" }, outbound: "Slack + Sheets" },
  "mcp-task": { name: "Connected app task", description: "Calls one tool on a connected app (MCP server) with fixed arguments when you run it. Read-only tools you allow can run on their own; everything else waits for your approval.", trigger: { type: "manual", label: "Run now" }, outbound: "Connected app (MCP)" },
  "daily-brief": { name: "Daily brief", description: "Every morning, summarizes the last 24 hours from your own Business data (new leads, paid orders, pending approvals, agent runs) and puts it in your Keplar inbox. It sends nothing outside Keplar.", trigger: { type: "schedule", cron: "0 8 * * *", tz: "America/New_York", label: "Every day at 08:00 (America/New_York)" }, outbound: "None (in-app)" },
  monitor: { name: "Page monitor (BETA)", description: "Watches one public web page and tells you in your Keplar inbox what changed. Reads the page text only (no JavaScript), so pages that build themselves in the browser can't be watched reliably. Sends nothing outside Keplar.", trigger: { type: "schedule", cron: "0 9 * * *", tz: "America/New_York", label: "Every day at 09:00 (America/New_York)" }, outbound: "None (in-app)" },
  "lead-sweep": { name: "Lead follow-ups", description: "On a schedule, finds leads from your site who haven't been answered yet and drafts a follow-up for each. Every draft waits for your approval; nothing is sent on its own.", trigger: { type: "schedule", cron: "0 9 * * 1-5", tz: "America/New_York", label: "Weekdays at 09:00 (America/New_York)" }, outbound: "Email (Gmail/Outlook), always a draft for your approval" },
  "scheduled-question": { name: "Scheduled question", description: "Asks Keplar a question you write, on your schedule (a morning market summary, a weekly update on a topic). The panel answers and cross-checks it as in a chat, and the answer goes to your Keplar inbox with how far the models agreed. Uses your plan's credits like a chat question. Sends nothing outside Keplar.", trigger: { type: "schedule", cron: "0 8 * * *", tz: "America/New_York", label: "Every day at 08:00 (America/New_York)" }, outbound: "None (in-app)" },
  "event-reply": { name: "Event responder", description: "Starts when something arrives: an email to its own Keplar address, or a POST to its own secret webhook URL. It records what came in to your Keplar inbox and drafts a reply (email) or a summary (webhook, optionally for a Slack channel). Every reply or post waits for your approval; this agent never sends on its own.", trigger: { type: "event", event: "webhook.received" }, outbound: "Email reply or Slack post, always waiting for your approval" },
  "social-post": { name: "Social post", description: "Drafts a post about a product and schedules it.", trigger: { type: "schedule", cron: "0 15 * * 2,4", label: "Tue + Thu 11:00 ET" }, outbound: "Social scheduler" },
};

export const DEFAULT_CAPS: Agent["caps"] = { monthlyUnits: 1500, runsPerDay: 24, outboundPerDay: 20, spendUsdPerMonth: 3 };

type Settings = { id: string; workspaceId: string; agentsHalted: boolean; haltedAt: string | null };
const settings = () => collection<Settings>("biz_settings");

export async function getSettings(workspaceId: string): Promise<Settings> {
  return (await settings().get(workspaceId, "settings")) ?? { id: "settings", workspaceId, agentsHalted: false, haltedAt: null };
}

export async function setHalted(ws: Workspace, halted: boolean) {
  const cur = await settings().get(ws.id, "settings");
  const next = { agentsHalted: halted, haltedAt: halted ? now() : null };
  if (cur) await settings().update(ws.id, "settings", next);
  else await settings().insert({ id: "settings", workspaceId: ws.id, ...next });
  if (halted) await cancelPending(ws.id);
  await audit(ws.id, auditActor(ws), halted ? "agents.halted" : "agents.resumed", "workspace");
}

async function cancelPending(workspaceId: string, agentId?: string) {
  const pending = await approvals().list(workspaceId, (a) => a.status === "pending" && (!agentId || a.agentId === agentId));
  for (const a of pending) await approvals().update(workspaceId, a.id, { status: "cancelled", decidedAt: now(), result: "Canceled by kill switch" });
  const waiting = await runs().list(workspaceId, (r) => r.status === "waiting_approval" && (!agentId || r.agentId === agentId));
  for (const r of waiting) await runs().update(workspaceId, r.id, { status: "stopped", endedAt: now() });
}

export type ScheduleInput = { cron?: unknown; tz?: unknown };

/** A saved schedule: the cron must parse, the zone must exist, and it must not run faster than the plan allows. Returns the trigger to store. */
export function validateSchedule(ws: Pick<Workspace, "plan" | "admin">, input: ScheduleInput): Extract<Agent["trigger"], { type: "schedule" }> {
  const cron = typeof input.cron === "string" ? input.cron.trim() : "";
  if (!cron || cron.length > 80) throw new HttpError(400, "Give the schedule as a cron, like 0 8 * * * (minute hour day month weekday).", "bad_schedule");
  try {
    parseCron(cron);
  } catch (e) {
    throw new HttpError(400, `That schedule isn't valid: ${e instanceof Error ? e.message : "bad cron"}`, "bad_schedule");
  }
  let tz = "UTC";
  if (input.tz !== undefined && input.tz !== null && input.tz !== "") {
    try {
      tz = assertTimeZone(String(input.tz));
    } catch {
      throw new HttpError(400, "That time zone isn't known. Use a name like America/New_York.", "bad_schedule");
    }
  }
  const limit = minIntervalFor(ws.plan);
  if (!Number.isFinite(limit)) throw new EntitlementError("Scheduled agents are available on Plus and up.", "plus");
  const every = minIntervalMinutes(cron, tz);
  if (every < limit) throw new EntitlementError(`Your plan can schedule an agent ${cadenceName(limit)} at most. This schedule runs every ${every} minutes.`, ws.plan === "plus" ? "pro" : "business");
  return { type: "schedule", cron, tz, label: describeCron(cron, tz) };
}

function cleanMonitor(input: { url?: unknown; keyword?: unknown }) {
  const raw = typeof input.url === "string" ? input.url.trim() : "";
  let url: URL;
  try {
    url = checkUrl(raw);
  } catch {
    throw new HttpError(400, "Give the full public address of the page to watch, starting with https://.", "bad_url");
  }
  const keyword = typeof input.keyword === "string" ? input.keyword.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60) : "";
  return { url: url.toString().slice(0, 500), ...(keyword ? { keyword } : {}) };
}

export type AgentConfig = { schedule?: ScheduleInput; monitor?: { url?: unknown; keyword?: unknown }; question?: unknown; event?: unknown };

function questionFor(v: unknown): string {
  const q = cleanQuestion(v);
  if ("error" in q) throw new HttpError(400, q.error, "bad_question");
  return q.question;
}

export async function createAgent(ws: Workspace, template: WorkflowTemplate, name?: string, mcp?: unknown, config: AgentConfig = {}) {
  if (!(template in TEMPLATES)) throw new HttpError(400, "Unknown workflow.");
  const task = template === "mcp-task" ? await validateAgentTask(ws, mcp) : undefined;
  const count = (await agents().list(ws.id, (a) => a.status !== "killed")).length;
  if (count >= ws.entitlements.agents) {
    throw new EntitlementError(ws.entitlements.agents === 0 ? "Agents are available on Plus and up." : `Your plan includes ${ws.entitlements.agents} agents.`, ws.plan === "free" ? "plus" : "business");
  }
  const t = TEMPLATES[template];
  const monitor = template === "monitor" ? cleanMonitor(config.monitor ?? {}) : undefined;
  const question = template === "scheduled-question" ? questionFor(config.question) : undefined;
  let event: Agent["event"];
  if (template === "event-reply") {
    try { event = cleanEventConfig(config.event, { emailAvailable: Boolean(inboundEmailConfig()) }); } catch (e) { throw new HttpError(400, (e as Error).message, "not_available"); }
  }
  const hookToken = event?.source === "webhook" ? newHookToken() : undefined;
  const trigger: Agent["trigger"] = event ? { type: "event", event: event.source === "email" ? "email.received" : "webhook.received" } : t.trigger.type === "schedule" && config.schedule ? validateSchedule(ws, config.schedule) : t.trigger;
  if (trigger.type === "schedule" && !config.schedule) validateSchedule(ws, { cron: trigger.cron, tz: trigger.tz }); // the defaults obey the plan too
  const agent: Agent = { id: id("agt"), workspaceId: ws.id, name: name?.slice(0, 80) || (task ? `${t.name}: ${task.tool}`.slice(0, 80) : monitor ? `Watch ${new URL(monitor.url).hostname}`.slice(0, 80) : question ? `Ask: ${question}`.slice(0, 80) : event ? (event.source === "email" ? "Reply to incoming email" : "Webhook responder") : t.name), template, trigger, autoSend: false, status: "active", caps: { ...DEFAULT_CAPS }, createdAt: now(), lastRunAt: null, ...(task ? { mcp: task } : {}), ...(monitor ? { monitor } : {}), ...(question ? { question } : {}), ...(event ? { event } : {}), ...(hookToken ? { hookHash: hashHookToken(hookToken) } : {}), ...(event?.source === "email" ? { inboxRoute: newInboxRoute() } : {}) };
  await agents().insert(agent);
  if (task) await grantForNewAgent(ws, agent.id, task);
  await audit(ws.id, auditActor(ws), "agent.created", agent.id, template);
  return hookToken ? { ...agent, hookToken } : agent; // the webhook token is shown once; only its hash is stored
}

export async function updateAgent(ws: Workspace, agentId: string, patch: { autoSend?: boolean; status?: "active" | "paused" | "killed"; caps?: Partial<Agent["caps"]>; schedule?: ScheduleInput; monitor?: { url?: unknown; keyword?: unknown }; question?: unknown; rotateHook?: boolean }) {
  const agent = await agents().get(ws.id, agentId);
  if (!agent) throw new HttpError(404, "Agent not found.");
  if (agent.status === "killed" && patch.status !== undefined) throw new HttpError(409, "This agent was stopped with the kill switch. Create a new one.");
  // Auto-send and spending caps decide what goes out from the owner's accounts without a review: owner only.
  if (patch.autoSend !== undefined || patch.caps !== undefined) requireBusinessRole(ws, "change auto-send or an agent's caps");
  const next: Partial<Agent> = {};
  if (typeof patch.autoSend === "boolean") {
    if (patch.autoSend && !ws.entitlements.autoSendAllowed) throw new EntitlementError("Auto-send is available on Plus and up.", "plus");
    if (patch.autoSend && agent.template === "event-reply") throw new HttpError(400, "Event responders always wait for your approval before sending.", "approval_required");
    next.autoSend = patch.autoSend;
  }
  if (patch.status) next.status = patch.status;
  if (patch.schedule) {
    if (agent.trigger.type !== "schedule") throw new HttpError(400, "This agent runs on an event or by hand, not on a schedule.", "not_scheduled");
    next.trigger = validateSchedule(ws, patch.schedule);
  }
  if (patch.monitor) {
    if (agent.template !== "monitor") throw new HttpError(400, "Only a page monitor watches a page.", "not_monitor");
    const m = cleanMonitor({ url: patch.monitor.url ?? agent.monitor?.url, keyword: patch.monitor.keyword ?? agent.monitor?.keyword });
    // A different page or keyword starts a fresh baseline: the old snapshot says nothing about it.
    next.monitor = m.url === agent.monitor?.url && m.keyword === agent.monitor?.keyword ? { ...agent.monitor, ...m } : m;
  }
  let hookToken: string | undefined;
  if (patch.rotateHook) {
    if (agent.event?.source !== "webhook") throw new HttpError(400, "Only a webhook responder has a webhook URL.", "not_webhook");
    hookToken = newHookToken();
    next.hookHash = hashHookToken(hookToken); // the old URL stops working at once
  }
  if (patch.question !== undefined) {
    if (agent.template !== "scheduled-question") throw new HttpError(400, "Only a scheduled question has a question.", "not_question");
    next.question = questionFor(patch.question);
  }
  if (patch.caps) next.caps = { ...agent.caps, ...Object.fromEntries(Object.entries(patch.caps).filter(([, v]) => typeof v === "number" && v >= 0)) };
  const updated = await agents().update(ws.id, agentId, next);
  if (patch.status === "killed") await cancelPending(ws.id, agentId);
  await audit(ws.id, auditActor(ws), patch.status === "killed" ? "agent.killed" : "agent.updated", agentId, JSON.stringify(patch));
  return hookToken && updated ? { ...updated, hookToken } : updated;
}

const today = () => now().slice(0, 10);

async function usage(ws: Workspace, agent: Agent) {
  const [rs, aps] = await Promise.all([runs().list(ws.id, (r) => r.agentId === agent.id), approvals().list(ws.id, (a) => a.agentId === agent.id)]);
  return {
    runsToday: rs.filter((r) => r.startedAt.startsWith(today())).length,
    unitsThisMonth: rs.filter((r) => r.startedAt >= ws.period.start).reduce((s, r) => s + r.units, 0),
    outboundToday: aps.filter((a) => a.status === "sent" && (a.decidedAt ?? "").startsWith(today())).length,
  };
}

const DRAFT_TIMEOUT_MS = 45_000;
const DRAFT_MAX_TOKENS = 1200;

/** One model call. Live: OpenRouter chat completions (KEPLAR_AGENT_MODEL). Not live: the starting draft. */
async function draft(fallback: string, instruction: string): Promise<{ text: string; usd?: number }> {
  if (!isLive("codegen")) return { text: fallback };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.KEPLAR_AGENT_MODEL || "openrouter/auto", max_tokens: DRAFT_MAX_TOKENS, usage: { include: true }, provider: { data_collection: "deny" }, messages: draftMessages(fallback, instruction) }),
      // A hung model never holds a run open: on timeout the starting draft is used (catch below).
      signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
    return { text: acceptDraft(data.choices?.[0]?.message?.content ?? "", fallback) ?? fallback, usd: data.usage?.cost };
  } catch {
    return { text: fallback };
  }
}

type Plan = { steps: string[]; actions: OutboundAction[]; llmCalls: { text: string; usd?: number }[] };

async function plan(ws: Workspace, agent: Agent, payload: Record<string, unknown>, live?: (text: string) => void): Promise<Plan> {
  const steps: string[] = [];
  // Each step is reported the moment it happens (a run started from chat streams them), and kept for the run record.
  const say = (text: string) => { steps.push(text); live?.(text); };
  const actions: OutboundAction[] = [];
  const llmCalls: Plan["llmCalls"] = [];
  switch (agent.template) {
    case "lead-followup": {
      const cid = typeof payload.contactId === "string" ? payload.contactId : null;
      const cs = await contacts().list(ws.id);
      const contact = cid ? cs.find((c) => c.id === cid) : cs.filter((c) => c.source === "form").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!contact) { say("No leads yet; nothing to follow up."); break; }
      const msg = (await inbox().list(ws.id, (m) => m.contactId === contact.id && m.direction === "in" && m.channel === "form")).sort((a, b) => b.at.localeCompare(a.at))[0];
      say(`Read the latest message from ${contact.email}`);
      const first = contact.name.split(" ")[0];
      const d = await draft(`Hi ${first},\n\nThanks for reaching out${msg ? ` about "${msg.body.slice(0, 80)}"` : ""}. I'd be glad to help. Would a quick call this week work? Reply with a time that suits you.\n\nBest,\nThe team`, "Write a reply to this lead.");
      llmCalls.push(d);
      say("Drafted a reply");
      actions.push({ type: "email.send", connector: "gmail", to: contact.email, subject: "Re: your message", body: d.text, contactId: contact.id });
      break;
    }
    case "invoice-reminder": {
      const stale = await deals().list(ws.id, (d) => d.stage === "proposal");
      say(`Found ${stale.length} deal${stale.length === 1 ? "" : "s"} in Proposal`);
      for (const deal of stale.slice(0, 3)) {
        const c = await contacts().get(ws.id, deal.contactId);
        if (!c) continue;
        const d = await draft(`Hi ${c.name.split(" ")[0]},\n\nJust checking in on the proposal I sent. Happy to answer any questions or adjust anything.\n\nBest,\nThe team`, "Write a polite proposal follow-up.");
        llmCalls.push(d);
        actions.push({ type: "email.send", connector: "gmail", to: c.email, subject: `Following up: ${deal.title}`, body: d.text, contactId: c.id });
      }
      if (actions.length) say(`Drafted ${actions.length} reminder${actions.length === 1 ? "" : "s"}`);
      break;
    }
    case "weekly-report": {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const paid = await orders().list(ws.id, (o) => inCurrentMode(o) && o.status === "paid" && (o.paidAt ?? "") >= since);
      const leads = await contacts().list(ws.id, (c) => c.createdAt >= since);
      const revenue = paid.reduce((s, o) => s + o.amount, 0) / 100;
      say("Pulled last 7 days of orders and leads");
      const d = await draft(`Weekly report: $${revenue.toFixed(2)} revenue, ${paid.length} orders, ${leads.length} new leads.`, "Write a two-line weekly business summary.");
      llmCalls.push(d);
      say("Wrote the summary");
      actions.push({ type: "slack.post", connector: "slack", channel: "#general", text: d.text });
      actions.push({ type: "sheets.append", connector: "sheets", sheet: "Weekly metrics", row: [today(), revenue, paid.length, leads.length] });
      break;
    }
    case "mcp-task": {
      if (!agent.mcp) { say("This agent has no connected-app task configured."); break; }
      say(`Prepared a call to ${agent.mcp.tool}`);
      actions.push({ type: "mcp.call", connector: "mcp", serverId: agent.mcp.serverId, serverName: "", tool: agent.mcp.tool, args: agent.mcp.args, toolRisk: "unknown", idempotencyKey: "" });
      break;
    }
    case "daily-brief": {
      const since = new Date(Date.now() - 864e5).toISOString();
      const [paid, leads, pending, recent, proposals] = await Promise.all([
        orders().list(ws.id, (o) => inCurrentMode(o) && o.status === "paid" && (o.paidAt ?? "") >= since),
        contacts().list(ws.id, (c) => c.createdAt >= since),
        approvals().list(ws.id, (a) => a.status === "pending"),
        runs().list(ws.id, (r) => r.startedAt >= since && r.agentId !== agent.id),
        deals().list(ws.id, (d) => d.stage === "proposal"),
      ]);
      say("Read the last 24 hours of leads, orders, approvals and agent runs");
      const revenue = paid.reduce((sum, o) => sum + o.amount, 0) / 100;
      const failed = recent.filter((r) => r.status === "failed").length;
      const facts = [
        `${leads.length} new lead${leads.length === 1 ? "" : "s"}`,
        `${paid.length} paid order${paid.length === 1 ? "" : "s"}${paid.length ? ` ($${revenue.toFixed(2)})` : ""}`,
        `${pending.length} agent action${pending.length === 1 ? "" : "s"} waiting for your approval`,
        `${recent.length} agent run${recent.length === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`,
        `${proposals.length} deal${proposals.length === 1 ? "" : "s"} sitting in Proposal`,
      ];
      const quiet = !leads.length && !paid.length && !pending.length && !recent.length && !proposals.length;
      let body = quiet ? "Quiet day: nothing new in the last 24 hours." : `Since yesterday: ${facts.join("; ")}.`;
      if (!quiet) {
        const d = await draft(body, "Rewrite this as a friendly three-sentence morning brief. Keep every number exactly as given and add none.");
        llmCalls.push(d);
        body = d.text;
      }
      await inbox().insert({ id: id("msg"), workspaceId: ws.id, channel: "agent", direction: "in", from: "Daily brief", to: "you", subject: `Daily brief · ${today()}`, body, contactId: null, read: false, mock: false, at: now() });
      say("Put the brief in your Keplar inbox (nothing was sent outside Keplar)");
      break;
    }
    case "monitor": {
      if (!agent.monitor?.url) { say("This monitor has no page to watch yet."); break; }
      const r = await checkPage(agent.monitor);
      const base = { ...agent.monitor, hash: r.hash, checkedAt: now() };
      if (r.kind === "keyword_missing") {
        say(`The word "${agent.monitor.keyword}" isn't on the page right now`);
        await agents().update(ws.id, agent.id, { monitor: { ...base, snapshot: "" } });
      } else if (r.kind === "baseline") {
        say(`Saved a starting copy of the page (${r.lines} lines). You'll be told when it changes.`);
        await agents().update(ws.id, agent.id, { monitor: { ...base, snapshot: r.snapshot } });
      } else if (r.kind === "unchanged") {
        say("No change since the last check");
        await agents().update(ws.id, agent.id, { monitor: base });
      } else {
        say(`The page changed: ${r.added.length} line${r.added.length === 1 ? "" : "s"} added, ${r.removed.length} removed`);
        await inbox().insert({ id: id("msg"), workspaceId: ws.id, channel: "agent", direction: "in", from: "Page monitor", to: "you", subject: `Page changed: ${new URL(agent.monitor.url).hostname}`, body: changeSummary(agent.monitor.url, r), contactId: null, read: false, mock: false, at: now() });
        await agents().update(ws.id, agent.id, { monitor: { ...base, snapshot: r.snapshot, lastChangeAt: now() } });
        say("Put the change in your Keplar inbox (nothing was sent outside Keplar)");
      }
      break;
    }
    case "scheduled-question": {
      if (!agent.question) { say("This agent has no question yet."); break; }
      say(`Asked Keplar: “${agent.question.length > 90 ? `${agent.question.slice(0, 90)}…` : agent.question}”`);
      const r = await askScheduled(ws, agent.question);
      if (!r.ok) { say(r.error); break; }
      await inbox().insert({ id: id("msg"), workspaceId: ws.id, channel: "agent", direction: "in", from: "Scheduled question", to: "you", subject: `${agent.name} · ${today()}`, body: r.body, contactId: null, read: false, mock: false, at: now() });
      say("Put the answer in your Keplar inbox (nothing was sent outside Keplar)");
      break;
    }
    case "lead-sweep": {
      const cs = await contacts().list(ws.id, (c) => c.source === "form" && c.createdAt <= new Date(Date.now() - 36e5).toISOString());
      const acts = await activities().list(ws.id, (a) => a.kind === "email_sent");
      const answered = new Set(acts.map((a) => a.contactId));
      const open = cs.filter((c) => !answered.has(c.id) && c.email).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      say(`Found ${open.length} lead${open.length === 1 ? "" : "s"} nobody has answered yet`);
      // Leads that already have a follow-up waiting for approval are skipped, so a daily sweep never stacks duplicates.
      const waiting = new Set((await approvals().list(ws.id, (a) => a.status === "pending" && a.action.type === "email.send")).map((a) => (a.action.type === "email.send" ? a.action.to.toLowerCase() : "")));
      for (const c of open.filter((x) => !waiting.has(x.email.toLowerCase())).slice(0, 3)) {
        const msg = (await inbox().list(ws.id, (m) => m.contactId === c.id && m.direction === "in" && m.channel === "form")).sort((a, b) => b.at.localeCompare(a.at))[0];
        const d = await draft(`Hi ${c.name.split(" ")[0]},\n\nThanks for getting in touch${msg ? ` about "${msg.body.slice(0, 80)}"` : ""}. I wanted to follow up and see how I can help. Would a short call this week work?\n\nBest,\nThe team`, "Write a short, polite follow-up to this lead.");
        llmCalls.push(d);
        actions.push({ type: "email.send", connector: "gmail", to: c.email, subject: "Following up on your message", body: d.text, contactId: c.id });
      }
      if (actions.length) say(`Drafted ${actions.length} follow-up${actions.length === 1 ? "" : "s"}; each waits for your approval`);
      break;
    }
    case "event-reply": {
      const ev = payload.event as EventPayload | undefined;
      if (!ev || (ev.kind !== "email" && ev.kind !== "webhook")) { say("Nothing arrived to respond to. This agent runs when an email or webhook comes in."); break; }
      const [mailNeed, slackNeed] = await Promise.all([
        unmetNeeds(ws.id, [{ connector: "gmail", label: "Gmail", reason: "it sends approved replies", kind: "oauth" }]),
        unmetNeeds(ws.id, [{ connector: "slack", label: "Slack", reason: "it posts approved summaries", kind: "oauth" }]),
      ]);
      const r = await planEvent({
        agent, payload: ev, mail: mailNeed.length ? null : "gmail", slackConnected: !slackNeed.length, draft, say,
        record: async (m) => { await inbox().insert({ id: id("msg"), workspaceId: ws.id, channel: m.channel, direction: "in", from: m.from.slice(0, 254), to: "you", subject: m.subject.slice(0, 200), body: m.body, contactId: null, read: false, mock: false, at: now() }); },
      });
      actions.push(...r.actions);
      llmCalls.push(...r.llmCalls);
      break;
    }
    case "social-post": {
      const ps = await projects().list(ws.id, (p) => Boolean(p.spec?.products.length));
      const p = ps[0];
      const product = p?.spec?.products[Math.floor(Math.random() * (p?.spec?.products.length ?? 1))];
      if (!p || !product) { say("No products to post about yet."); break; }
      say(`Picked ${product.name} from ${p.name}`);
      const d = await draft(`${product.name}: ${product.description} Now in the ${p.name} shop.`, "Write a short social post (under 200 characters, no hashtags spam).");
      llmCalls.push(d);
      const at = new Date(Date.now() + 864e5); at.setUTCHours(15, 0, 0, 0);
      actions.push({ type: "social.schedule", connector: "social", network: "Instagram", text: d.text, at: at.toISOString() });
      say("Drafted a post for tomorrow 11:00 ET");
      break;
    }
  }
  return { steps, actions, llmCalls };
}

export type RunOptions = {
  /**
   * Queue every outbound action for owner approval even if the agent has autoSend on. Only a run the owner starts by hand
   * (trigger "manual", the Run button) may auto-send; every other trigger (events such as form.submitted or order.paid,
   * schedules, chat, webhooks, email) is forced to approval inside runAgent whatever the caller passes (docs/business-os.md §4).
   */
  forceApproval?: boolean;
  /** Called with each step as it happens (a run started from the chat streams them to the card). Never affects the run. */
  onStep?: (step: AgentRun["steps"][number]) => void;
};

/** The only trigger that is a direct owner action in the UI. Anything else is unattended or driven by outside input. */
export const OWNER_TRIGGERS: ReadonlySet<string> = new Set(["manual"]);

export async function runAgent(ws: Workspace, agentId: string, trigger: string, payload: Record<string, unknown> = {}, opts: RunOptions = {}): Promise<AgentRun> {
  // Fail closed: an event, schedule or any unknown trigger never auto-sends, even if a caller forgets forceApproval.
  const forceApproval = opts.forceApproval === true || !OWNER_TRIGGERS.has(trigger);
  const agent = await agents().get(ws.id, agentId);
  if (!agent) throw new HttpError(404, "Agent not found.");
  if ((await getSettings(ws.id)).agentsHalted) throw new HttpError(409, "All agents are halted. Resume them first.", "halted");
  if (agent.status !== "active") throw new HttpError(409, `This agent is ${agent.status}.`, "agent_inactive");
  // Needs first: an agent whose connector isn't connected (or whose tool is off) does not run, spend Usage, or invent output.
  const unmet = await unmetNeeds(ws.id, requiredFor(agent.template));
  if (unmet.length) {
    const msg = needMessage(unmet);
    const t = now();
    const blocked: AgentRun = { id: id("run"), workspaceId: ws.id, agentId, trigger, status: "failed", steps: [{ at: t, text: `Started (${trigger})`, units: 0 }, { at: t, text: msg, units: 0 }], units: 0, startedAt: t, endedAt: t, error: msg, needs: unmet.map((n) => ({ connector: n.connector, label: n.label, problem: n.problem })) };
    await runs().insert(blocked);
    await audit(ws.id, `agent:${agent.id}`, "agent.needs_connector", blocked.id, unmet.map((n) => n.connector).join(","));
    return blocked;
  }
  const u = await usage(ws, agent);
  const estimate = estimateUnits("agent.run.base") + estimateUnits("agent.step") * 3;
  if (u.runsToday >= agent.caps.runsPerDay) throw new HttpError(429, "This agent hit its runs-per-day cap.", "cap_runs");
  if (u.unitsThisMonth + estimate > agent.caps.monthlyUnits) throw new HttpError(402, "This agent hit its monthly Usage cap.", "cap_units");
  if ((u.unitsThisMonth + estimate) * USD_PER_UNIT > agent.caps.spendUsdPerMonth) throw new HttpError(402, "This agent hit its monthly spend cap.", "cap_spend");
  await assertCanSpend(ws, estimate, { kind: "agent" });

  const run: AgentRun = { id: id("run"), workspaceId: ws.id, agentId, trigger, status: "running", steps: [], units: 0, startedAt: now(), endedAt: null };
  await runs().insert(run);
  await agents().update(ws.id, agentId, { lastRunAt: run.startedAt });
  const notify = (st: AgentRun["steps"][number]) => { try { opts.onStep?.(st); } catch { /* a closed stream never breaks the run */ } };
  const step = (text: string, units = 0) => { const st = { at: now(), text, units }; run.steps.push(st); notify(st); };
  try {
    run.units += await charge(ws, "agent.run.base", { ref: run.id });
    step(`Started (${trigger})`);
    const p = await plan(ws, agent, payload, (text) => notify({ at: now(), text, units: 0 }));
    for (const c of p.llmCalls) run.units += await charge(ws, "agent.step", { ref: run.id, usd: c.usd });
    p.steps.forEach((text) => run.steps.push({ at: now(), text, units: 0 })); // already reported live
    if (p.llmCalls.length) step(`${p.llmCalls.length} model call${p.llmCalls.length === 1 ? "" : "s"}`, run.units);
    let waiting = 0;
    let sent = u.outboundToday;
    const known = await knownEmails(ws.id);
    let actionIndex = 0;
    for (let action of p.actions) {
      actionIndex++;
      let mcpMayAutoRun = true;
      if (action.type === "mcp.call") {
        // Connected app: the gateway checks that the server, tool, agent grant, budget and arguments are all still valid, and stamps the
        // tool's CURRENT risk from the owner's stored setting (never from the model or the server). A refusal is final for this run.
        const pre = await preflightAgentAction(ws, agentId, { ...action, idempotencyKey: `run:${run.id}:${actionIndex}` });
        if (!pre.ok) {
          await audit(ws.id, `agent:${agent.id}`, "mcp.call.refused", run.id, pre.reason);
          step(`Connected app call not made: ${pre.reason}`);
          continue;
        }
        action = pre.action;
        mcpMayAutoRun = pre.autoRun; // the owner must have marked the tool read-only AND allowed it to run without asking
      }
      // AI Firewall: block credentials / injection, rate the rest. Blocked actions are never queued or sent.
      const verdict = inspectAction(action, known);
      securityEvent({ kind: "agent.action", code: verdict.blocked ? "blocked" : `${verdict.risk}:${action.type}`, where: "business/agents/run", accountId: ws.id });
      if (verdict.blocked) {
        await audit(ws.id, `agent:${agent.id}`, "firewall.blocked", run.id, `${action.type}: ${verdict.blocked}`);
        step(`Firewall blocked a ${action.type}: ${verdict.blocked}`);
        continue;
      }
      const runUsd = run.units * USD_PER_UNIT;
      // Event responders act on untrusted input, so their outbound actions always wait for the owner (on every run path).
      if (!forceApproval && agent.template !== "event-reply" && agent.autoSend && verdict.autoSendAllowed && mcpMayAutoRun && ws.entitlements.autoSendAllowed && sent < agent.caps.outboundPerDay) {
        const summary = await execute(ws.id, `agent:${agent.id}`, action, { ws });
        await approvals().insert({ id: id("apr"), workspaceId: ws.id, agentId, runId: run.id, action, status: "sent", decidedAt: now(), result: `Auto-sent: ${summary}`, createdAt: now(), risk: verdict.risk, riskReasons: verdict.reasons, runUsd });
        sent += 1;
        step(`Auto-sent: ${summary}`);
      } else {
        await approvals().insert({ id: id("apr"), workspaceId: ws.id, agentId, runId: run.id, action, status: "pending", decidedAt: null, createdAt: now(), risk: verdict.risk, riskReasons: verdict.reasons, runUsd });
        waiting += 1;
        step(agent.autoSend && forceApproval ? `${trigger.startsWith("schedule") ? "Scheduled run" : "Unattended run"}: queued ${action.type} for your approval` : agent.autoSend && !verdict.autoSendAllowed ? `Firewall (${verdict.risk} risk: ${verdict.reasons.join("; ")}): queued ${action.type} for your approval` : agent.autoSend && sent >= agent.caps.outboundPerDay ? "Outbound cap reached; queued for approval" : `Queued ${action.type} for your approval`);
      }
    }
    run.status = waiting ? "waiting_approval" : "succeeded";
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : "Run failed";
    step(`Failed: ${run.error}`);
  }
  run.endedAt = run.status === "waiting_approval" ? null : now();
  await runs().update(ws.id, run.id, run);
  await logActivity(ws.id, null, "agent_action", `${agent.name}: ${run.status.replace("_", " ")}`, run.id);
  await audit(ws.id, `agent:${agent.id}`, "agent.run", run.id, `${run.status}, ${run.units} units`);
  return run;
}

/** A contact a public form created this recently is not "known" to the firewall: anyone can create one by posting the form. */
export const FRESH_FORM_CONTACT_MS = 60 * 60_000;

export async function knownEmails(workspaceId: string, at = Date.now()): Promise<Set<string>> {
  const fresh = new Date(at - FRESH_FORM_CONTACT_MS).toISOString();
  return new Set((await contacts().list(workspaceId)).filter((c) => !(c.source === "form" && c.createdAt >= fresh)).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));
}

export async function decide(ws: Workspace, approvalId: string, decision: "approve" | "reject", edits?: { body?: string; text?: string }) {
  const a = await approvals().get(ws.id, approvalId);
  if (!a) throw new HttpError(404, "Approval not found.");
  if (a.status !== "pending") throw new HttpError(409, `Already ${a.status}.`);
  if ((await getSettings(ws.id)).agentsHalted && decision === "approve") throw new HttpError(409, "Agents are halted.", "halted");
  let action = a.action;
  if (edits?.body && action.type === "email.send") action = { ...action, body: edits.body.slice(0, 10000) };
  if (edits?.text && (action.type === "slack.post" || action.type === "social.schedule")) action = { ...action, text: edits.text.slice(0, 5000) };
  let patch: Partial<Approval>;
  if (decision === "approve") {
    // Edits are inspected again: the owner can approve a high-risk action they have read, but a blocked one never goes out.
    const v = inspectAction(action, await knownEmails(ws.id));
    securityEvent({ kind: "agent.action", code: v.blocked ? "blocked" : `approved:${action.type}`, where: "business/agents/approve", accountId: ws.id });
    if (v.blocked) {
      await audit(ws.id, auditActor(ws), "firewall.blocked", a.id, `${action.type}: ${v.blocked}`);
      throw new HttpError(422, v.blocked, "firewall_blocked");
    }
  }
  // Atomic claim BEFORE anything runs: of two concurrent clicks (or tabs, or teammates) exactly one gets past this line.
  const claim = await approvalClaims().insertIfAbsent({ id: a.id, workspaceId: ws.id, decision, by: auditActor(ws), at: now() });
  if (!claim.inserted) throw new HttpError(409, "This approval is already being processed.", "already_processing");
  // A kill switch or halt may have cancelled it between the read above and the claim.
  if ((await approvals().get(ws.id, a.id))?.status !== "pending") throw new HttpError(409, "This approval is no longer waiting.", "not_pending");
  if (decision === "reject") {
    patch = { status: "rejected", decidedAt: now(), action };
    await audit(ws.id, auditActor(ws), "approval.rejected", a.id, action.type);
  } else {
    await approvals().update(ws.id, a.id, { status: "executing", action });
    try {
      const summary = await execute(ws.id, auditActor(ws), action, { approvalId: a.id, ws });
      patch = { status: "sent", decidedAt: now(), result: summary, action };
      if (action.type === "email.send" && action.contactId) await logActivity(ws.id, action.contactId, "email_sent", action.subject, a.id);
    } catch (err) {
      patch = { status: "failed", decidedAt: now(), result: err instanceof Error ? err.message : "Failed", action };
    }
    await audit(ws.id, auditActor(ws), "approval.approved", a.id, patch.result);
  }
  const updated = await approvals().update(ws.id, a.id, patch);
  await settleRun(ws.id, a.runId);
  return updated;
}

/**
 * The run's status once nothing of it is waiting: "failed" when any action failed, otherwise "succeeded" (every action was sent,
 * rejected or cancelled by the owner). While anything is pending or executing, the run keeps waiting.
 */
async function settleRun(workspaceId: string, runId: string) {
  const all = await approvals().list(workspaceId, (x) => x.runId === runId);
  if (all.some((x) => x.status === "pending" || x.status === "executing")) return;
  const failed = all.filter((x) => x.status === "failed").length;
  await runs().update(workspaceId, runId, failed ? { status: "failed", endedAt: now(), error: `${failed} of ${all.length} action${all.length === 1 ? "" : "s"} failed` } : { status: "succeeded", endedAt: now() });
}

/** Background execution (Inngest in production). */
defineJob("agent.run", async (payload) => {
  const { agentId, trigger, workspaceId, ...rest } = payload as { agentId: string; trigger: string; workspaceId: string };
  const ws = await workspaceById(workspaceId);
  if (!ws) return;
  // Queued runs come from events (form.submitted, order.paid): never auto-send.
  await runAgent(ws, agentId, trigger, rest, { forceApproval: true }).catch((e) => console.warn("[agent.run]", e instanceof Error ? e.message : e));
});
