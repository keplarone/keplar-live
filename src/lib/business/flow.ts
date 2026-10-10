/**
 * The path an agent action takes before anything leaves Keplar: action -> risk -> cost -> permission -> outcome.
 * Pure: every step is read from fields that exist on the stored approval. Nothing here is estimated or invented.
 */

export type FlowTone = "neutral" | "verified" | "attention" | "destructive";
export type FlowStep = { id: "action" | "risk" | "cost" | "permission" | "outcome"; title: string; detail: string; tone: FlowTone; reached: boolean };

const ACTION_LABEL: Record<string, string> = { "email.send": "Send email", "slack.post": "Post to Slack", "social.schedule": "Schedule post", "sheet.append": "Add spreadsheet row", "sheets.append": "Add spreadsheet row", "mcp.call": "Call a connected app tool" };

export type FlowInput = { action: { type: string }; status: string; risk?: "low" | "medium" | "high"; riskReasons?: string[]; runUsd?: number };

export function approvalFlow(a: FlowInput): FlowStep[] {
  const decided = a.status !== "pending";
  const outcome: Record<string, { detail: string; tone: FlowTone }> = {
    pending: { detail: "Awaiting you", tone: "attention" },
    approved: { detail: "Approved", tone: "verified" },
    sent: { detail: "Sent", tone: "verified" },
    rejected: { detail: "Rejected", tone: "destructive" },
    cancelled: { detail: "Canceled", tone: "neutral" },
    failed: { detail: "Approved, sending failed", tone: "destructive" },
  };
  const risk: FlowStep = a.risk
    ? { id: "risk", title: "Risk", detail: `${a.risk[0].toUpperCase()}${a.risk.slice(1)}${a.riskReasons?.length ? `: ${a.riskReasons[0]}` : ""}`, tone: a.risk === "high" ? "destructive" : a.risk === "medium" ? "attention" : "verified", reached: true }
    : { id: "risk", title: "Risk", detail: "Not rated (queued before the AI Firewall)", tone: "neutral", reached: true };
  const sentOrApproved = a.status === "approved" || a.status === "sent" || a.status === "failed";
  return [
    { id: "action", title: "Action", detail: ACTION_LABEL[a.action.type] ?? a.action.type, tone: "neutral", reached: true },
    risk,
    { id: "cost", title: "Cost", detail: typeof a.runUsd === "number" && a.runUsd > 0 ? `About $${a.runUsd.toFixed(3)} for the run` : "No model cost recorded", tone: "neutral", reached: true },
    { id: "permission", title: "Owner approval", detail: decided ? (sentOrApproved ? "You allowed it" : a.status === "rejected" ? "You refused it" : "Withdrawn") : "Needs your approval; nothing is sent before", tone: decided ? (sentOrApproved ? "verified" : a.status === "rejected" ? "destructive" : "neutral") : "attention", reached: true },
    { id: "outcome", title: "Outcome", detail: (outcome[a.status] ?? { detail: a.status, tone: "neutral" as FlowTone }).detail, tone: (outcome[a.status] ?? { tone: "neutral" as FlowTone }).tone, reached: decided },
  ];
}
