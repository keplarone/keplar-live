/**
 * Pending biz_approvals for the business work page activity center.
 * Reads rows the approvals API already returns. No new table, and the lines shown to the owner
 * never include message bodies, spreadsheet cells, or tool arguments.
 */

export const ACTIVITY_LIMIT = 8;

export type ActivityAction = {
  type?: string;
  to?: string;
  subject?: string;
  channel?: string;
  network?: string;
  tool?: string;
  serverName?: string;
  sheet?: string;
  title?: string;
  repo?: string;
};

export type ActivityItem = {
  id: string;
  label: string;
  agentName: string;
  createdAt: string;
};

const MAX_TEXT = 160;

function clip(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return "";
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** One line an owner can recognize. Bodies, row cells, and tool arguments are not read. */
export function activityLabel(action: ActivityAction | null | undefined): string {
  const type = action?.type;
  if (type === "email.send") {
    const to = clip(action?.to) || "someone";
    const subject = clip(action?.subject);
    return subject ? `Email to ${to}: ${subject}` : `Email to ${to}`;
  }
  if (type === "slack.post") return `Slack message to ${clip(action?.channel) || "a channel"}`;
  if (type === "social.schedule") return clip(action?.network) ? `${clip(action?.network)} post` : "Social post";
  if (type === "gcal.event") return clip(action?.title) ? `Calendar event: ${clip(action?.title)}` : "Calendar event";
  if (type === "github.issue") return clip(action?.repo) ? `GitHub issue in ${clip(action?.repo)}` : "GitHub issue";
  if (type === "sheets.append") return clip(action?.sheet) ? `Add a row to ${clip(action?.sheet)}` : "Add a spreadsheet row";
  if (type === "mcp.call") {
    const tool = clip(action?.tool);
    const server = clip(action?.serverName);
    return tool && server ? `Call ${tool} on ${server}` : "Connected app call";
  }
  return "Action waiting for approval";
}

function pendingCountOf(value: unknown, seen: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return seen;
  return Math.max(seen, Math.min(1_000_000, Math.floor(value)));
}

/**
 * Pending rows only, newest first, capped for the work page. `pendingCount` from the API is the full
 * queue length (the list itself is the newest page). A missing or nonsense count falls back to the rows in hand.
 */
export function activityView(input: unknown, limit = ACTIVITY_LIMIT): { count: number; items: ActivityItem[] } {
  const body = input && typeof input === "object" ? (input as { approvals?: unknown; pendingCount?: unknown }) : {};
  const rows = Array.isArray(body.approvals) ? body.approvals : [];
  const pending = rows.filter((row): row is { id: string; createdAt?: unknown; agentName?: unknown; action?: ActivityAction } => {
    if (!row || typeof row !== "object") return false;
    const r = row as { id?: unknown; status?: unknown };
    return r.status === "pending" && typeof r.id === "string" && r.id.length > 0 && r.id.length <= 80;
  });
  pending.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const cap = Number.isFinite(limit) ? Math.max(0, Math.min(20, Math.floor(limit))) : ACTIVITY_LIMIT;
  return {
    count: pendingCountOf(body.pendingCount, pending.length),
    items: pending.slice(0, cap).map((row) => ({
      id: row.id,
      label: activityLabel(row.action),
      agentName: clip(row.agentName) || "Agent",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    })),
  };
}
