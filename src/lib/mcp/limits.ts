/**
 * Plan gating for connected apps (MCP). Decision: Free has none. Calling arbitrary third-party servers on behalf of an
 * account is the most abusable thing Keplar can do (outbound traffic, data egress, spend), agents are Plus+ already,
 * and Free is anonymous-ish and unmetered for abuse. Plus gets a small, safe allowance; Pro and Business more.
 */
import type { PlanId } from "@/lib/create/platform/plans";

export type McpPlanLimits = { servers: number; callsPerDay: number; callsPerMin: number; concurrent: number };
export const MCP_LIMITS: Record<PlanId, McpPlanLimits> = {
  free: { servers: 0, callsPerDay: 0, callsPerMin: 0, concurrent: 0 },
  lite: { servers: 0, callsPerDay: 0, callsPerMin: 0, concurrent: 0 },
  plus: { servers: 3, callsPerDay: 100, callsPerMin: 20, concurrent: 2 },
  pro: { servers: 10, callsPerDay: 500, callsPerMin: 40, concurrent: 3 },
  business: { servers: 25, callsPerDay: 2000, callsPerMin: 80, concurrent: 5 },
};
export const mcpLimitsFor = (plan: PlanId) => MCP_LIMITS[plan];

export const DEFAULT_GRANT = { maxCallsPerDay: 10, maxUnitsPerMonth: 100 };
/** Caps that keep the stored data and the pending queue bounded. */
export const MAX_PENDING_MCP_APPROVALS = 20;
export const OUTPUT_STORE_CHARS = 8000;
export const RUNNING_STALE_MS = 120_000;
