import { collection } from "@/lib/create/platform/store";
import { id, now } from "@/lib/create/platform/ids";
import type { McpGrant, McpOauthPending, McpReceipt, McpServer, McpTool } from "@/lib/mcp/types";
import type { Activity, Agent, AgentRun, Approval, AuditEntry, Connection, ConnectAccount, Contact, Deal, InboxMessage, Order, PageView } from "./types";

export const connectAccounts = () => collection<ConnectAccount>("biz_connect_accounts");
export const orders = () => collection<Order>("biz_orders");
export const contacts = () => collection<Contact>("biz_contacts");
export const deals = () => collection<Deal>("biz_deals");
export const activities = () => collection<Activity>("biz_activities");
export const inbox = () => collection<InboxMessage>("biz_inbox");
export const connections = () => collection<Connection>("biz_connections");
export const agents = () => collection<Agent>("biz_agents");
export const runs = () => collection<AgentRun>("biz_agent_runs");
export const approvals = () => collection<Approval>("biz_approvals");
/** One row per decided approval (id = approval id), inserted with insertIfAbsent BEFORE anything runs: two clicks can't both execute. */
export type ApprovalClaim = { id: string; workspaceId: string; decision: "approve" | "reject"; by: string; at: string };
export const approvalClaims = () => collection<ApprovalClaim>("biz_approval_claims");
export const auditLog = () => collection<AuditEntry>("biz_audit");
export const tableRows = () => collection<{ id: string; workspaceId: string; sheet: string; row: unknown[]; at: string }>("biz_table_rows");
export const pageViews = () => collection<PageView>("biz_pageviews");
export type BankItem = { id: string; workspaceId: string; provider: "plaid" | "stripe"; status: "pending" | "connected" | "error"; institution: string; linkTokenEnc: string | null; accessEnc: string | null; connectedAt: string | null; createdAt: string };
export const bankItems = () => collection<BankItem>("biz_bank_items");

export async function audit(workspaceId: string, actor: string, action: string, target?: string, detail?: string) {
  await auditLog().insert({ id: id("aud"), workspaceId, actor, action, target, detail, at: now() });
}

export async function logActivity(workspaceId: string, contactId: string | null, kind: Activity["kind"], text: string, ref?: string) {
  await activities().insert({ id: id("act"), workspaceId, contactId, kind, text, ref, at: now() });
  if (contactId) await contacts().update(workspaceId, contactId, { lastActivityAt: now() });
}

export const mcpServers = () => collection<McpServer>("mcp_servers");
export const mcpTools = () => collection<McpTool>("mcp_tools");
export const mcpGrants = () => collection<McpGrant>("mcp_grants");
export const mcpReceipts = () => collection<McpReceipt>("mcp_receipts");
export const mcpOauth = () => collection<McpOauthPending>("mcp_oauth");
