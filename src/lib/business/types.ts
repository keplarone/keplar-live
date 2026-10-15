/** Business OS domain types. Every row is tenant-scoped by workspaceId (RLS in Postgres). */

export type Money = { amount: number; currency: string }; // amount in minor units

export type ConnectAccount = {
  id: string;
  workspaceId: string;
  /** Stripe Accounts v2 id (acct_…). */
  stripeAccountId: string;
  mode: "test" | "live";
  /** Accounts v2 configuration we request (docs/business-os.md §2). */
  config: { dashboard: "full"; fees_collector: "stripe"; losses_collector: "stripe"; charge_type: "direct" };
  status: "onboarding" | "active" | "restricted";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  country: string;
  createdAt: string;
  /** Requirements Stripe still needs (from account webhooks). */
  requirementsDue?: string[];
  /** Last account webhook applied (Stripe event id + time). */
  lastEventId?: string;
  updatedAt?: string;
};

export type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";
export type Order = {
  id: string;
  workspaceId: string;
  projectId: string;
  productId: string;
  productName: string;
  amount: number;
  currency: string;
  /** Optional Keplar platform fee on the direct charge (application_fee_amount). 0 by default. */
  applicationFeeAmount: number;
  status: OrderStatus;
  checkoutSessionId: string;
  customerEmail: string | null;
  contactId: string | null;
  returnPath: string;
  createdAt: string;
  paidAt: string | null;
  /** "keplar": created by startCheckout; "stripe": first seen in a Connect webhook (e.g. a Payment Link). */
  source?: "keplar" | "stripe";
  /** Connected account the direct charge was made on (acct_…). */
  stripeAccountId?: string;
  /** PaymentIntent of the direct charge; refunds are matched on it. */
  paymentIntentId?: string | null;
  /** Cumulative refunded amount (minor units). status becomes "refunded" when fully refunded. */
  refundedAmount?: number;
  refundedAt?: string | null;
  /** Set when Stripe reports a dispute on the charge (the seller responds in their Stripe Dashboard). */
  disputedAt?: string | null;
  /** Stripe mode the order was made in. Missing = test (older rows). Views filter by the current mode. */
  livemode?: boolean;
};

export type Contact = {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  source: "form" | "checkout" | "manual" | "import";
  projectId: string | null;
  tags: string[];
  createdAt: string;
  lastActivityAt: string;
};

export type DealStage = "new" | "qualified" | "proposal" | "won" | "lost";
export type Deal = {
  id: string;
  workspaceId: string;
  contactId: string;
  title: string;
  value: number;
  currency: string;
  stage: DealStage;
  createdAt: string;
  updatedAt: string;
};

export type Activity = {
  id: string;
  workspaceId: string;
  contactId: string | null;
  kind: "form_submitted" | "order_paid" | "order_refunded" | "email_sent" | "email_received" | "note" | "deal_stage" | "agent_action";
  text: string;
  ref?: string;
  at: string;
};

export type InboxMessage = {
  id: string;
  workspaceId: string;
  channel: "form" | "email" | "order" | "agent";
  direction: "in" | "out";
  from: string;
  to: string;
  subject: string;
  body: string;
  contactId: string | null;
  read: boolean;
  /** Legacy flag, always false. */
  mock: boolean;
  at: string;
};

export type ConnectorId = "gmail" | "outlook" | "gcal" | "stripe" | "social" | "slack" | "sheets" | "github";
export type Connection = {
  id: string;
  workspaceId: string;
  connector: ConnectorId;
  status: "connected" | "disconnected" | "error";
  account: string;
  /** AES-256-GCM (KMS envelope in production) encrypted OAuth token. Never returned by the API. */
  tokenEnc: string | null;
  scopes: string[];
  connectedAt: string;
  /** Per-tool switches (OAuth connectors). A tool missing or false is OFF. */
  tools?: Record<string, boolean>;
};

export type WorkflowTemplate = "lead-followup" | "invoice-reminder" | "weekly-report" | "social-post" | "mcp-task" | "daily-brief" | "monitor" | "lead-sweep" | "scheduled-question" | "event-reply";
export type Agent = {
  id: string;
  workspaceId: string;
  name: string;
  template: WorkflowTemplate;
  trigger: { type: "event"; event: "form.submitted" | "order.paid" | "webhook.received" | "email.received" } | { type: "schedule"; cron: string; label: string; /** IANA zone the cron fields are read in (DST-safe). Missing = UTC (older agents). */ tz?: string } | { type: "manual"; label: string };
  /** mcp-task agents: the one connected-app tool this agent may call, with fixed arguments. */
  mcp?: { serverId: string; tool: string; args: Record<string, unknown> };
  /** monitor agents: the one public page this agent watches, and what it saw last time. */
  /** scheduled-question agents: the question asked on each run (src/lib/personalize/scheduled.ts). */
  question?: string;
  /** event-reply agents (src/lib/business/event-agents.ts): where events come from and what to do with them. */
  event?: { source: "email" | "webhook"; allowFrom?: string[]; slackChannel?: string; instructions: string };
  /** sha256 of the agent's webhook token (the token itself is shown once and never stored). */
  hookHash?: string;
  /** Incoming-email route: mail to agent+<inboxRoute>@<domain> starts this agent. */
  inboxRoute?: string;
  monitor?: { url: string; keyword?: string; hash?: string; /** The page text seen last time (capped), so a change can be shown line by line. */ snapshot?: string; checkedAt?: string; lastChangeAt?: string };
  /** Default false: every outbound action waits for the owner's approval. */
  autoSend: boolean;
  status: "active" | "paused" | "killed";
  caps: { monthlyUnits: number; runsPerDay: number; outboundPerDay: number; spendUsdPerMonth: number };
  createdAt: string;
  lastRunAt: string | null;
};

export type RunStep = { at: string; text: string; units: number };
export type AgentRun = {
  id: string;
  workspaceId: string;
  agentId: string;
  trigger: string;
  status: "running" | "succeeded" | "failed" | "waiting_approval" | "stopped";
  steps: RunStep[];
  units: number;
  error?: string;
  /** Set when the run was refused because a connector it needs isn't connected (or its tool is off). */
  needs?: { connector: ConnectorId; label: string; problem: "not_connected" | "tool_off" }[];
  startedAt: string;
  endedAt: string | null;
};

export type OutboundAction =
  | { type: "email.send"; connector: "gmail" | "outlook"; to: string; subject: string; body: string; contactId?: string | null }
  | { type: "slack.post"; connector: "slack"; channel: string; text: string }
  | { type: "social.schedule"; connector: "social"; network: string; text: string; at: string }
  | { type: "gcal.event"; connector: "gcal"; title: string; description: string; start: string; end: string }
  | { type: "github.issue"; connector: "github"; repo: string; title: string; body: string }
  | { type: "sheets.append"; connector: "sheets"; sheet: string; row: (string | number)[] }
  /**
   * A call to a tool on a connected app (MCP server). `toolRisk` is stamped by Keplar from the owner's stored setting when the
   * action is queued, and re-read from the database when it runs; nothing the server (or a model) says can change it.
   */
  | { type: "mcp.call"; connector: "mcp"; serverId: string; serverName: string; tool: string; args: Record<string, unknown>; toolRisk: "read" | "write" | "unknown"; idempotencyKey: string };

export type Approval = {
  id: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  action: OutboundAction;
  /** "executing": claimed and being sent right now (src/lib/business/agents.ts decide). */
  status: "pending" | "approved" | "rejected" | "cancelled" | "executing" | "sent" | "failed";
  decidedAt: string | null;
  result?: string;
  createdAt: string;
  /** AI Firewall verdict recorded when the action was queued (firewall.ts). */
  risk?: "low" | "medium" | "high";
  riskReasons?: string[];
  /** Estimated provider cost (USD) of the run that produced this action. */
  runUsd?: number;
};

export type AuditEntry = {
  id: string;
  workspaceId: string;
  actor: string; // "owner" | "agent:<id>" | "system" | "public"
  action: string;
  target?: string;
  detail?: string;
  at: string;
};

export type PageView = { id: string; workspaceId: string; projectId: string; path: string; day: string; at: string; /** Site analytics: daily-rotating visitor mark (never an IP) and the referring host. */ v?: string; ref?: string };
