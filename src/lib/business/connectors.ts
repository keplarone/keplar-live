/**
 * Connectors. OAuth tokens are encrypted at rest (AES-256-GCM here; KMS
 * envelope encryption in production) and never leave the server. A connector is
 * "not set up yet" until its OAuth keys exist; nothing is simulated or recorded
 * as sent. Sheets is built in and needs no third party.
 */
import { inspectAction } from "./firewall";
import { id, now } from "@/lib/create/platform/ids";
import type { ProviderId } from "@/lib/create/platform/config";
import { HttpError } from "@/lib/create/platform/http";
import { audit, connections, tableRows } from "./repo";
import { executeMcpAction } from "@/lib/mcp/gateway";
import { OAUTH_CONNECTORS, executeOAuthAction, isOAuthConnector, oauthConfigured, redirectUri } from "./oauth-connectors";
import type { Workspace } from "@/lib/create/platform/workspace";
import type { Connection, ConnectorId, OutboundAction } from "./types";

export const CONNECTORS: Record<ConnectorId, { label: string; provider: ProviderId; scopes: string[]; what: string; live: string }> = {
  gmail: { label: "Gmail", provider: "email", scopes: ["gmail.send", "gmail.readonly"], what: "Send replies and read lead threads", live: "Google OAuth (restricted scopes need Google verification + CASA assessment)" },
  outlook: { label: "Outlook", provider: "email", scopes: ["Mail.Send", "Mail.Read"], what: "Send replies and read lead threads", live: "Microsoft Entra app (Graph Mail.Send) — PLACEHOLDER, needs MS_OAUTH_CLIENT_ID/SECRET" },
  gcal: { label: "Google Calendar", provider: "email", scopes: ["calendar.events"], what: "Book calls from leads", live: "Same Google OAuth client" },
  stripe: { label: "Stripe", provider: "stripe", scopes: ["connect"], what: "Orders, payouts, invoices", live: "Stripe Connect (Accounts v2)" },
  social: { label: "Social scheduler", provider: "social", scopes: ["posts.write"], what: "Draft and schedule social posts", live: "Self-hosted Postiz public API" },
  slack: { label: "Slack", provider: "slack", scopes: ["chat:write"], what: "Post reports and alerts", live: "Slack app (OAuth v2, chat:write)" },
  github: { label: "GitHub", provider: "store", scopes: ["public_repo"], what: "Open issues from leads and reports", live: "GitHub OAuth app (public_repo)" },
  sheets: { label: "Sheets", provider: "store", scopes: ["tables.write"], what: "Log rows to a data table", live: "Built-in tables in Postgres (no third party)" },
};

export function publicConnection(c: Connection) {
  const { tokenEnc: _t, ...rest } = c;
  return { ...rest, hasToken: Boolean(_t) };
}

export async function listConnections(workspaceId: string) {
  const rows = await connections().list(workspaceId);
  return (Object.keys(CONNECTORS) as ConnectorId[]).map((cid) => {
    const row = rows.find((r) => r.connector === cid);
    const meta = CONNECTORS[cid];
    const oauth = isOAuthConnector(cid) ? OAUTH_CONNECTORS[cid] : null;
    return {
      id: cid,
      ...meta,
      configured: cid === "sheets" || (isOAuthConnector(cid) && oauthConfigured(cid)),
      /** Names (never values) of the server env vars that switch this connector on. */
      needsEnv: oauth && !oauthConfigured(cid as never) ? [oauth.clientIdEnv, oauth.clientSecretEnv] : [],
      setup: oauth?.setup ?? null,
      redirectUri: oauth ? redirectUri() : null,
      tools: oauth ? oauth.tools.map((t) => ({ ...t, enabled: Boolean(row?.status === "connected" && row.tools?.[t.id]) })) : [],
      connection: row && row.status === "connected" ? publicConnection(row) : null,
    };
  });
}

/**
 * Connect a connector. Third-party OAuth flows aren't wired, so those say so;
 * Sheets (built-in tables) connects without a third party.
 */
export async function connect(workspaceId: string, connector: ConnectorId) {
  if (!(connector in CONNECTORS)) throw new HttpError(400, "Unknown connector.");
  const meta = CONNECTORS[connector];
  if (isOAuthConnector(connector)) throw new HttpError(400, `${meta.label} connects through its sign-in page. Use Connect.`, "use_oauth");
  if (connector !== "sheets") throw new HttpError(503, `${meta.label} isn't set up yet.`, "not_configured");
  const existing = (await connections().list(workspaceId, (c) => c.connector === connector))[0];
  const row: Connection = {
    id: existing?.id ?? id("conn"),
    workspaceId,
    connector,
    status: "connected",
    account: "Built-in tables",
    tokenEnc: null,
    scopes: meta.scopes,
    connectedAt: now(),
  };
  if (existing) await connections().update(workspaceId, existing.id, row);
  else await connections().insert(row);
  await audit(workspaceId, "owner", "connector.connected", connector);
  return publicConnection(row);
}

export async function disconnect(workspaceId: string, connector: ConnectorId) {
  const existing = (await connections().list(workspaceId, (c) => c.connector === connector))[0];
  if (!existing) return null;
  await connections().update(workspaceId, existing.id, { status: "disconnected", tokenEnc: null });
  await audit(workspaceId, "owner", "connector.disconnected", connector);
  return true;
}

/** Execute an approved outbound action. Only connectors that really work run; everything else fails honestly. */
export async function execute(workspaceId: string, actor: string, action: OutboundAction, ctx: { approvalId?: string; ws?: Workspace } = {}): Promise<string> {
  // Last line of defence, whatever called us: the AI Firewall refuses credentials, header injection and multi-recipient emails.
  const verdict = inspectAction(action);
  if (verdict.blocked) throw new HttpError(422, verdict.blocked, "firewall_blocked");
  // Connected apps (MCP): the gateway re-checks policy, grants, approval, limits and budgets itself; it is not a Connection row.
  if (action.type === "mcp.call") return executeMcpAction(workspaceId, actor, action, ctx);
  if (isOAuthConnector(action.connector) && action.type !== "sheets.append") {
    const summary = await executeOAuthAction(workspaceId, action);
    await audit(workspaceId, actor, action.type, action.connector, summary);
    return summary;
  }
  const conn = (await connections().list(workspaceId, (c) => c.connector === action.connector && c.status === "connected"))[0];
  if (!conn) throw new HttpError(409, `${CONNECTORS[action.connector].label} isn't connected.`, "not_connected");
  let summary: string;
  switch (action.type) {
    case "sheets.append": {
      await tableRows().insert({ id: id("row"), workspaceId, sheet: action.sheet.slice(0, 80), row: action.row, at: now() });
      summary = `Row added to ${action.sheet}`;
      break;
    }
    default:
      throw new HttpError(503, `${CONNECTORS[action.connector].label} isn't set up yet.`, "not_configured");
  }
  await audit(workspaceId, actor, action.type, action.connector, summary);
  return summary;
}
