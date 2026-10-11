/**
 * Revenue Guard (Keplar Enterprise): an agent swarm that tests the money paths of a company's OWN app (signup, checkout,
 * billing, cancellation, account recovery) and turns failures into evidence-backed, reproduced reports with proposed fixes.
 *
 * Where things run:
 *   - The browsers run in the Keplar desktop app (keplar-desktop src/main/guard): hidden windows that can only visit the
 *     target's verified origin (plus any checkout origins the company lists), recording network failures and console errors.
 *   - The agents' thinking runs here (src/lib/business/guard/agents.ts), metered in credits against the run's budget.
 *   - Targets, runs and reports are stored here, per workspace.
 * Safety: a target must be verified (a file on the site or a DNS TXT record) before any run; nothing is ever deployed or
 * merged; test credentials never leave the desktop app (the model only sees {{test_email}} / {{test_password}} placeholders).
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";
import type { Workspace } from "@/lib/create/platform/workspace";
import { BUSINESS_TIERS } from "@/lib/business/tiers";

export const JOURNEYS = ["signup", "login", "checkout", "plan_change", "cancellation", "account_recovery", "refund"] as const;
export type Journey = (typeof JOURNEYS)[number];
export const JOURNEY_LABEL: Record<Journey, string> = {
  signup: "Signup", login: "Login", checkout: "Checkout", plan_change: "Plan change", cancellation: "Cancellation", account_recovery: "Account recovery", refund: "Refunds",
};

export const GUARD_LIMITS = { maxTargets: 20, maxAgents: 48, maxConcurrency: 16, maxStepsPerAgent: 40, minBudget: 500, maxBudget: 200_000, maxReportsPerRun: 200, maxEvidenceShots: 4, maxShotBytes: 400_000 };

export type GuardTargetRow = {
  id: string; workspaceId: string;
  name: string;
  /** https origin, e.g. https://staging.acme.com */
  origin: string;
  /** Extra origins agents may visit during a run (a hosted checkout, an auth provider). Never verified; never the start page. */
  extraOrigins: string[];
  token: string;
  verifiedAt: string | null;
  verifiedBy: "file" | "dns" | null;
  createdAt: string;
};

export type RunStatus = "running" | "paused" | "stopped" | "finished";
export type GuardRunRow = {
  id: string; workspaceId: string;
  targetId: string; origin: string;
  journeys: Journey[];
  agents: number;
  concurrency: number;
  budget: number;
  spent: number;
  actions: number;
  status: RunStatus;
  createdAt: string; updatedAt: string; finishedAt: string | null;
};

export type ReportState = "filed" | "duplicate" | "insufficient" | "accepted" | "reproduced" | "not_reproduced" | "patched" | "approved" | "rejected";
export type GuardReportRow = {
  id: string; workspaceId: string; runId: string;
  agentId: string;
  journey: Journey;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  revenueImpact: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence: { urls: string[]; consoleErrors: string[]; failedRequests: string[]; shots: string[] };
  state: ReportState;
  duplicateOf: string | null;
  screenNote: string;
  reproNote: string;
  patch: { summary: string; location: string; diff: string; regressionTest: string } | null;
  review: { approve: boolean; concerns: string[] } | null;
  createdAt: string; updatedAt: string;
};

export const targets = () => collection<GuardTargetRow>("guard_targets");
export const runs = () => collection<GuardRunRow>("guard_runs");
export const reports = () => collection<GuardReportRow>("guard_reports");

/** Revenue Guard is Keplar Enterprise only (and Keplar's own admins). */
export function assertGuardAccess(ws: Workspace): void {
  if (ws.admin) return;
  if (ws.plan === "business" && ws.entitlements.label === BUSINESS_TIERS.enterprise.name) return;
  throw new HttpError(403, "Revenue Guard is part of Keplar Enterprise. Contact sales at business.keplar.one to add it.", "enterprise_only");
}

const id = (p: string) => `${p}_${randomBytes(9).toString("base64url")}`;

/** An https origin from user input (bare host allowed); null when it is not a public https site. */
export function parseOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 300) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443") return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || /^[\d.]+$/.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return null;
    // Keplar's own properties are not test targets.
    if (host === "keplar.one" || host.endsWith(".keplar.one")) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

/** The file and DNS record that prove a company controls the target. */
export function verificationFor(t: Pick<GuardTargetRow, "origin" | "token">) {
  const host = new URL(t.origin).hostname;
  return {
    fileUrl: `${t.origin}/.well-known/keplar-verify.txt`,
    fileContents: `keplar-verify=${t.token}`,
    dnsName: `_keplar-verify.${host}`,
    dnsValue: `keplar-verify=${t.token}`,
  };
}

export async function createTarget(ws: Workspace, input: { name?: unknown; url?: unknown; extraOrigins?: unknown }): Promise<GuardTargetRow> {
  const origin = parseOrigin(input.url);
  if (!origin) throw new HttpError(400, "Enter your app's https address, like staging.example.com.", "bad_origin");
  const existing = await targets().list(ws.id);
  if (existing.length >= GUARD_LIMITS.maxTargets) throw new HttpError(409, `Up to ${GUARD_LIMITS.maxTargets} apps.`, "too_many");
  if (existing.some((t) => t.origin === origin)) throw new HttpError(409, "That app is already added.", "duplicate");
  const extra = Array.isArray(input.extraOrigins) ? input.extraOrigins.map(parseOrigin).filter((o): o is string => Boolean(o) && o !== origin).slice(0, 5) : [];
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 80) : new URL(origin).hostname;
  return targets().insert({ id: id("tg"), workspaceId: ws.id, name, origin, extraOrigins: [...new Set(extra)], token: randomBytes(18).toString("base64url"), verifiedAt: null, verifiedBy: null, createdAt: new Date().toISOString() });
}

type Deps = { fetch?: typeof fetch; resolveTxt?: (name: string) => Promise<string[][]> };

/** Checks the verification file, then the DNS TXT record. Marks the target verified on success. */
export async function verifyTarget(ws: Workspace, targetId: string, deps: Deps = {}): Promise<GuardTargetRow> {
  const t = await targets().get(ws.id, targetId);
  if (!t) throw new HttpError(404, "App not found.", "not_found");
  const v = verificationFor(t);
  const doFetch = deps.fetch ?? fetch;
  let by: "file" | "dns" | null = null;
  try {
    const res = await doFetch(v.fileUrl, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "user-agent": "KeplarRevenueGuard/1.0 (+https://business.keplar.one)" } });
    if (res.ok) {
      const text = (await res.text()).slice(0, 2000);
      if (text.split(/\s+/).includes(v.fileContents)) by = "file";
    }
  } catch { /* fall through to DNS */ }
  if (!by) {
    try {
      const resolveTxt = deps.resolveTxt ?? (await import("node:dns")).promises.resolveTxt;
      const records = await resolveTxt(v.dnsName);
      if (records.some((parts) => parts.join("").trim() === v.dnsValue)) by = "dns";
    } catch { /* not found */ }
  }
  if (!by) throw new HttpError(422, "We couldn't find the verification file or DNS record yet. DNS can take a few minutes to update.", "not_verified");
  return (await targets().update(ws.id, t.id, { verifiedAt: new Date().toISOString(), verifiedBy: by })) ?? { ...t, verifiedAt: new Date().toISOString(), verifiedBy: by };
}

const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

export async function createRun(ws: Workspace, input: { targetId?: unknown; journeys?: unknown; agents?: unknown; concurrency?: unknown; budget?: unknown }): Promise<GuardRunRow> {
  const t = typeof input.targetId === "string" ? await targets().get(ws.id, input.targetId) : null;
  if (!t) throw new HttpError(404, "Choose one of your apps.", "not_found");
  if (!t.verifiedAt) throw new HttpError(409, "Verify that you own this app before testing it.", "not_verified");
  const journeys = Array.isArray(input.journeys) ? [...new Set(input.journeys.filter((j): j is Journey => (JOURNEYS as readonly string[]).includes(j as string)))] : [];
  if (!journeys.length) throw new HttpError(400, "Choose at least one journey to test.", "no_journeys");
  const active = await runs().list(ws.id, (r) => r.status === "running" || r.status === "paused");
  if (active.length) throw new HttpError(409, "Finish or stop the current run first.", "run_active");
  const now = new Date().toISOString();
  return runs().insert({
    id: id("run"), workspaceId: ws.id, targetId: t.id, origin: t.origin, journeys,
    agents: clampInt(input.agents, 1, GUARD_LIMITS.maxAgents, 12),
    concurrency: clampInt(input.concurrency, 1, GUARD_LIMITS.maxConcurrency, 6),
    budget: clampInt(input.budget, GUARD_LIMITS.minBudget, GUARD_LIMITS.maxBudget, 20_000),
    spent: 0, actions: 0, status: "running", createdAt: now, updatedAt: now, finishedAt: null,
  });
}

export async function getRun(ws: Workspace, runId: string): Promise<GuardRunRow> {
  const r = await runs().get(ws.id, runId);
  if (!r) throw new HttpError(404, "Run not found.", "not_found");
  return r;
}

export function publicTarget(t: GuardTargetRow) {
  return { id: t.id, name: t.name, origin: t.origin, extraOrigins: t.extraOrigins, verified: Boolean(t.verifiedAt), verifiedBy: t.verifiedBy, verification: t.verifiedAt ? null : verificationFor(t), createdAt: t.createdAt };
}

export const newReportId = () => id("rp");
