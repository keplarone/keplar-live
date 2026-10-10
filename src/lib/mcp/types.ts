/** Connected apps (MCP servers). Every row carries workspaceId; every read/write below goes through the tenant-scoped repo. */
import type { JsonSchema } from "./schema";

export type McpAuthType = "none" | "bearer" | "header" | "oauth";
export type McpStatus = "connecting" | "connected" | "failed";
export type McpToolRisk = "unknown" | "read" | "write";

export type McpServer = {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  authType: McpAuthType;
  headerName?: string;
  /** AES-GCM blob (crypto.ts): a token/API key, or for OAuth the sealed token set. Never leaves the server: publicServer() strips it. */
  secretEnc: string | null;
  status: McpStatus;
  /** Machine-readable reason for a failed state (McpErrorKind) and the human sentence shown in the UI. */
  statusKind?: string;
  statusReason?: string;
  serverName?: string;
  serverVersion?: string;
  toolCount: number;
  rejectedTools: number;
  truncatedTools: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
};

/** A started OAuth sign-in waiting for the browser to come back. `payloadEnc` seals the PKCE verifier and client registration. Single use, 10 minutes. */
export type McpOauthPending = { id: string; workspaceId: string; serverId: string; payloadEnc: string; createdAt: string; expiresAt: string };

export type McpTool = {
  id: string;
  workspaceId: string;
  serverId: string;
  name: string;
  description: string;
  descriptionFlagged: boolean;
  inputSchema: JsonSchema;
  /** What the server CLAIMS. Unverified; never grants anything. */
  serverHints: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean };
  schemaHash: string;
  /** Owner-controlled policy. Defaults: off, unknown (= needs approval), no auto-run. */
  enabled: boolean;
  risk: McpToolRisk;
  /** Auto-run without asking: only ever honoured when risk === "read" and an agent grant allows the tool. */
  autoRun: boolean;
  /** The server changed this tool after the owner reviewed it: disabled until re-enabled. */
  schemaChanged: boolean;
  discoveredAt: string;
  updatedAt: string;
};

export type McpGrant = {
  /** `${agentId}:${serverId}` */
  id: string;
  workspaceId: string;
  agentId: string;
  serverId: string;
  tools: string[];
  maxCallsPerDay: number;
  maxUnitsPerMonth: number;
  updatedAt: string;
};

export type McpReceipt = {
  id: string;
  workspaceId: string;
  serverId: string;
  serverName: string;
  tool: string;
  /** "owner" | "agent:<id>" */
  actor: string;
  agentId: string | null;
  via: "approval" | "auto" | "manual";
  approvalId?: string;
  argsHash: string;
  /** Redacted, truncated preview of the arguments. */
  argsPreview: string;
  status: "running" | "ok" | "tool_error" | "failed";
  /** Our own sentence; never raw server text. */
  error?: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  attempts: number;
  bytes: number;
  truncated: boolean;
  removedLines: number;
  units: number;
  /** Sanitized, length-capped output. Untrusted data. */
  output?: string;
};
