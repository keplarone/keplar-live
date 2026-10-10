/**
 * OpenRouter low-balance alert (part of the spend safety net next to the daily/hourly caps).
 *
 * - `fetchOpenRouterBalance` reads GET https://openrouter.ai/api/v1/credits with the server key
 *   (OPENROUTER_MANAGEMENT_KEY when set, else OPENROUTER_API_KEY). The key is only ever sent in the Authorization header
 *   to openrouter.ai; it is never logged or returned.
 * - `checkOpenRouterBalance` adds the alert: when remaining credit drops below LOW_PERCENT of the total, the ops owner
 *   (KEPLAR_OWNER_EMAIL, else ADMIN_EMAIL, else team@keplar.one — the same address `alertOwner` uses) gets ONE email per
 *   crossing. Dedupe is a store row per "episode": the first check that finds the balance low inserts
 *   `openrouter-low-<episode>` (insert-if-absent, so concurrent checks cannot both send); once the balance is back at or
 *   above the threshold the episode counter is bumped, so the next drop alerts again.
 * - Threshold (src/lib/cost/config.ts `lowBalance`, editable on /admin/profitability): alert when remaining is AT OR BELOW
 *   `percent` (default 1) of the basis: the last top-up (detected when total_credits grows between readings) or the lifetime
 *   total. `floorUsd` adds an absolute floor. Without a management key, /credits answers 403; the check then reads
 *   GET /api/v1/key and uses the key's own credit limit (limit / limit_remaining) when one is set.
 * - Days of runway (financial-model-100k.md: 1% of lifetime credits is only ~3.4 h of spend at scale): remaining ÷ trailing
 *   24h spend, where the spend is the rise in OpenRouter's own `total_usage` across stored readings (extrapolated from at
 *   least 1 h of history until 24 h exists). Warn at `lowBalance.runwayWarnDays` (7), critical at `runwayCriticalDays` (2);
 *   one email each time the level worsens (re-armed once runway recovers), deduped per level per UTC day.
 * - At $0 (or a 402 from a paid call, see src/lib/cost/meter.ts) paid OpenRouter calls fall back to :free models until the
 *   balance is positive again (src/lib/cost/guard.ts markBalanceExhausted / clearBalanceExhausted).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { collection, type Collection } from "@/lib/create/platform/store";
import { brand } from "@/lib/site";
import { sendEmail } from "@/lib/accounts/outbox";
import { logEvent } from "./log";

export const LOW_PERCENT = 1;
const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const TIMEOUT_MS = 8000;
const SYSTEM = "system";

export type OpenRouterBalance = {
  totalCredits: number; totalUsage: number; remaining: number; percent: number; low: boolean; checkedAt: string;
  /** Where the numbers came from: account credits (management key) or the API key's own credit limit. */
  source?: "credits" | "key_limit";
  /** Amount the percent is measured against (last top-up, or the total). */
  basisUsd?: number;
  basis?: "last_topup" | "total";
  lastTopupUsd?: number | null;
  lastTopupAt?: string | null;
  /** Trailing-24h spend (from the rise in OpenRouter's total_usage between readings) and days of runway at that rate. */
  spend24hUsd?: number | null;
  runwayDays?: number | null;
  runway?: RunwayLevel;
};
export type LowRule = { percent: number; basis: "last_topup" | "total"; floorUsd: number; lastTopupUsd?: number | null };
export type BalanceError = { error: string; code: "not_configured" | "management_key_required" | "unauthorized" | "upstream_error" | "bad_response" | "timeout"; checkedAt: string };
export type BalanceResult = ({ ok: true } & OpenRouterBalance) | ({ ok: false } & BalanceError);

type Fetch = typeof fetch;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function openRouterKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.OPENROUTER_MANAGEMENT_KEY?.trim() || env.OPENROUTER_API_KEY?.trim() || null;
}

/**
 * Pure math: remaining, and percent of the basis (the last top-up when known and `basis` is "last_topup", else the purchased
 * total). Low = at or below `percent` of the basis, or at or below `floorUsd`. 0 credits means 0% and low.
 */
export function computeBalance(totalCredits: number, totalUsage: number, now = new Date(), rule: Partial<LowRule> = {}): OpenRouterBalance {
  const remaining = totalCredits - totalUsage;
  const pct = rule.percent ?? LOW_PERCENT;
  const useTopup = (rule.basis ?? "total") === "last_topup" && (rule.lastTopupUsd ?? 0) > 0;
  const basisUsd = useTopup ? (rule.lastTopupUsd as number) : totalCredits;
  const percent = basisUsd > 0 ? (remaining / basisUsd) * 100 : 0;
  const low = basisUsd <= 0 || percent <= pct || remaining <= (rule.floorUsd ?? 0);
  return { totalCredits: round2(totalCredits), totalUsage: round2(totalUsage), remaining: round2(remaining), percent: round2(percent), low, checkedAt: now.toISOString(), basisUsd: round2(basisUsd), basis: useTopup ? "last_topup" : "total" };
}

const KEY_URL = "https://openrouter.ai/api/v1/key";

/** GET /api/v1/key (works with a normal key): the key's own credit limit, when one is set, stands in for the balance. */
async function fetchKeyLimit(f: Fetch, key: string, now: Date, rule: Partial<LowRule>): Promise<BalanceResult> {
  const checkedAt = now.toISOString();
  try {
    const res = await f(KEY_URL, { method: "GET", headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return { ok: false, code: "management_key_required", error: "OpenRouter refused: the credits endpoint needs a management key (set OPENROUTER_MANAGEMENT_KEY).", checkedAt };
    const d = ((await res.json().catch(() => null)) as { data?: { limit?: unknown; limit_remaining?: unknown } } | null)?.data;
    const limit = Number(d?.limit);
    const left = Number(d?.limit_remaining);
    if (typeof d?.limit !== "number" || typeof d?.limit_remaining !== "number" || !Number.isFinite(limit) || !Number.isFinite(left)) {
      return { ok: false, code: "management_key_required", error: "The OpenRouter key has no credit limit, so the account balance needs a management key (set OPENROUTER_MANAGEMENT_KEY).", checkedAt };
    }
    return { ok: true, ...computeBalance(limit, limit - left, now, { ...rule, basis: "total" }), source: "key_limit" };
  } catch {
    return { ok: false, code: "management_key_required", error: "OpenRouter refused: the credits endpoint needs a management key (set OPENROUTER_MANAGEMENT_KEY).", checkedAt };
  }
}

export async function fetchOpenRouterBalance(opts: { fetchImpl?: Fetch; env?: Record<string, string | undefined>; now?: Date; rule?: Partial<LowRule>; keyFallback?: boolean } = {}): Promise<BalanceResult> {
  const now = opts.now ?? new Date();
  const checkedAt = now.toISOString();
  const key = openRouterKey(opts.env);
  if (!key) return { ok: false, code: "not_configured", error: "OpenRouter key is not set.", checkedAt };
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(CREDITS_URL, { method: "GET", headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, code: timeout ? "timeout" : "upstream_error", error: timeout ? "OpenRouter did not answer in time." : "Could not reach OpenRouter.", checkedAt };
  }
  if (res.status === 403) {
    if (opts.keyFallback) return fetchKeyLimit(f, key, now, opts.rule ?? {});
    return { ok: false, code: "management_key_required", error: "OpenRouter refused: the credits endpoint needs a management key (set OPENROUTER_MANAGEMENT_KEY).", checkedAt };
  }
  if (res.status === 401) return { ok: false, code: "unauthorized", error: "OpenRouter rejected the key.", checkedAt };
  if (!res.ok) return { ok: false, code: "upstream_error", error: `OpenRouter answered ${res.status}.`, checkedAt };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "bad_response", error: "OpenRouter sent an unreadable response.", checkedAt };
  }
  const data = (body as { data?: { total_credits?: unknown; total_usage?: unknown } } | null)?.data;
  const credits = Number(data?.total_credits);
  const usage = Number(data?.total_usage);
  if (!data || typeof data.total_credits !== "number" || typeof data.total_usage !== "number" || !Number.isFinite(credits) || !Number.isFinite(usage)) {
    return { ok: false, code: "bad_response", error: "OpenRouter sent an unexpected response.", checkedAt };
  }
  return { ok: true, ...computeBalance(credits, usage, now, opts.rule ?? {}), source: "credits" };
}

export function alertRecipient(env: Record<string, string | undefined> = process.env): string {
  return env.KEPLAR_OWNER_EMAIL?.trim() || env.ADMIN_EMAIL?.trim() || brand.contactEmail;
}

export function lowBalanceEmail(b: OpenRouterBalance): { subject: string; text: string } {
  const subject = "Keplar: the system is running low";
  const of = b.basis === "last_topup" && b.basisUsd ? `of the last top-up of $${b.basisUsd.toFixed(2)}` : `of $${b.totalCredits.toFixed(2)}`;
  const line = b.basis === "last_topup" && b.basisUsd ? `OpenRouter balance $${b.remaining.toFixed(2)} (${b.percent.toFixed(2)}% ${of}; $${b.totalCredits.toFixed(2)} bought in total).` : `OpenRouter balance $${b.remaining.toFixed(2)} of $${b.totalCredits.toFixed(2)} (${b.percent.toFixed(2)}%).`;
  const text = `${subject}\n\n${line}\n\nTop up at https://openrouter.ai/settings/credits. At $0, paid-plan answers fall back to free models (and paid image/video pauses) until the balance is positive again; Free-plan :free models keep working.\n\nChecked ${b.checkedAt}. You get this once per drop to the threshold; it re-arms when the balance is back above.`;
  return { subject, text };
}

type StateRow = { id: string; workspaceId: string; episode: number };
type AlertRow = { id: string; workspaceId: string; at: string; remaining: number; totalCredits: number; percent: number; emailed: boolean };
const STATE_ID = "openrouter-balance-state";

export type AlertDeps = { store?: { state: Collection<StateRow>; alerts: Collection<AlertRow> }; send?: (m: { to: string; subject: string; text: string; kind: string }) => Promise<boolean>; env?: Record<string, string | undefined> };

/** Applies the once-per-crossing alert for one balance reading. Returns whether an email went out on this call. */
export async function applyLowBalanceAlert(b: OpenRouterBalance, deps: AlertDeps = {}): Promise<{ alerted: boolean; episode: number }> {
  const state = deps.store?.state ?? collection<StateRow>("system_ops_state");
  const alerts = deps.store?.alerts ?? collection<AlertRow>("system_ops_alerts");
  const send = deps.send ?? sendEmail;
  const episode = (await state.get(SYSTEM, STATE_ID))?.episode ?? 0;
  const alertId = `openrouter-low-${episode}`;
  if (!b.low) {
    // Back above the threshold: re-arm only if this episode already alerted.
    if (await alerts.get(SYSTEM, alertId)) await state.increment(SYSTEM, STATE_ID, { episode: 1 }, { id: STATE_ID, workspaceId: SYSTEM, episode: 0 });
    return { alerted: false, episode };
  }
  const { inserted } = await alerts.insertIfAbsent({ id: alertId, workspaceId: SYSTEM, at: b.checkedAt, remaining: b.remaining, totalCredits: b.totalCredits, percent: b.percent, emailed: false });
  if (!inserted) return { alerted: false, episode };
  const { subject, text } = lowBalanceEmail(b);
  const delivered = await send({ to: alertRecipient(deps.env), subject, text, kind: "owner-alert" }).catch(() => false);
  if (!delivered) {
    // Not delivered: release the claim so the next check tries again.
    await alerts.remove(SYSTEM, alertId).catch(() => false);
    logEvent("error", "ops.openrouter_low_alert_failed", { episode });
    return { alerted: false, episode };
  }
  await alerts.update(SYSTEM, alertId, { emailed: true }).catch(() => null);
  logEvent("warn", "ops.openrouter_low_alert_sent", { episode, percent: b.percent });
  return { alerted: true, episode };
}

type LastRow = { id: string; workspaceId: string; history?: UsageSample[] } & OpenRouterBalance;
const LAST_ID = "openrouter-balance-last";

/** The most recent successful reading (admin dashboard; read-only, no live call). */
export async function lastOpenRouterBalance(): Promise<OpenRouterBalance | null> {
  try {
    const r = await collection<LastRow>("system_ops_state").get(SYSTEM, LAST_ID);
    if (!r) return null;
    const { totalCredits, totalUsage, remaining, percent, low, checkedAt, source, basis, basisUsd, lastTopupUsd, lastTopupAt, spend24hUsd, runwayDays, runway } = r;
    return { totalCredits, totalUsage, remaining, percent, low, checkedAt, source, basis, basisUsd, lastTopupUsd, lastTopupAt, spend24hUsd, runwayDays, runway };
  } catch {
    return null;
  }
}

async function saveReading(b: OpenRouterBalance, rows: Collection<LastRow>, history: UsageSample[] = []) {
  const { totalCredits, totalUsage, remaining, percent, low, checkedAt, source = "credits", basis = "total", basisUsd = totalCredits, lastTopupUsd = null, lastTopupAt = null, spend24hUsd = null, runwayDays = null, runway = "unknown" } = b;
  const patch = { totalCredits, totalUsage, remaining, percent, low, checkedAt, source, basis, basisUsd, lastTopupUsd, lastTopupAt, spend24hUsd, runwayDays, runway, history };
  if (!(await rows.update(SYSTEM, LAST_ID, patch))) await rows.insertIfAbsent({ id: LAST_ID, workspaceId: SYSTEM, ...patch });
}

/** Pure: a top-up is a rise in total_credits between two readings of the same source. */
export function detectTopup(prev: Pick<OpenRouterBalance, "totalCredits" | "lastTopupUsd" | "lastTopupAt" | "source"> | null, cur: Pick<OpenRouterBalance, "totalCredits" | "checkedAt" | "source">): { lastTopupUsd: number | null; lastTopupAt: string | null } {
  if (prev && (prev.source ?? "credits") === (cur.source ?? "credits") && cur.totalCredits > prev.totalCredits + 0.004) return { lastTopupUsd: round2(cur.totalCredits - prev.totalCredits), lastTopupAt: cur.checkedAt };
  if (prev?.lastTopupUsd) return { lastTopupUsd: prev.lastTopupUsd, lastTopupAt: prev.lastTopupAt ?? null };
  // First reading: the whole purchase so far is the best known "last top-up".
  return { lastTopupUsd: cur.totalCredits > 0 ? round2(cur.totalCredits) : null, lastTopupAt: null };
}

export type RunwayLevel = "ok" | "warn" | "critical" | "unknown";
export type UsageSample = { at: string; usage: number; source?: string };
const H = 3600_000;

/** Pure: trailing-24h spend from cumulative-usage samples (null without ≥1 h of same-source history or after a counter reset). */
export function trailingSpend24h(history: UsageSample[], cur: { at: string; usage: number; source?: string }): number | null {
  const now = Date.parse(cur.at);
  const same = history.filter((h) => (h.source ?? "credits") === (cur.source ?? "credits") && Date.parse(h.at) < now && Date.parse(h.at) >= now - 48 * H);
  if (!same.length) return null;
  // The newest sample at least 24 h old, else the oldest one (extrapolated).
  const old = same.filter((h) => now - Date.parse(h.at) >= 24 * H).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? same.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  const span = now - Date.parse(old.at);
  if (span < H) return null;
  const delta = cur.usage - old.usage;
  if (delta < 0) return null;
  return round2((delta * 24 * H) / span);
}

/** Pure: days of runway and the alert level. */
export function runwayOf(remaining: number, spend24h: number | null | undefined, rule: { warnDays: number; criticalDays: number }): { runwayDays: number | null; runway: RunwayLevel } {
  if (remaining <= 0) return { runwayDays: 0, runway: "critical" };
  if (spend24h === null || spend24h === undefined) return { runwayDays: null, runway: "unknown" };
  if (spend24h <= 0) return { runwayDays: null, runway: "ok" };
  const days = Math.round((remaining / spend24h) * 10) / 10;
  return { runwayDays: days, runway: days <= rule.criticalDays ? "critical" : days <= rule.warnDays ? "warn" : "ok" };
}

/** Pure: keep ≤48 h of samples, at most one per 20 min. */
export function pushSample(history: UsageSample[], s: UsageSample): UsageSample[] {
  const now = Date.parse(s.at);
  const kept = history.filter((h) => Date.parse(h.at) >= now - 48 * H && Date.parse(h.at) <= now);
  const last = kept[kept.length - 1];
  if (last && now - Date.parse(last.at) < 20 * 60_000 && (last.source ?? "credits") === (s.source ?? "credits")) return kept;
  return [...kept, s].slice(-160);
}

const SEVERITY: Record<RunwayLevel, number> = { unknown: -1, ok: 0, warn: 1, critical: 2 };
type RunwayState = { id: string; workspaceId: string; level: RunwayLevel };
const RUNWAY_ID = "openrouter-runway-state";

/** Emails the owner when runway worsens to warn or critical (once per level per day across instances); re-arms on recovery. */
export async function applyRunwayAlert(b: OpenRouterBalance, deps: AlertDeps = {}, t: { warnDays: number; criticalDays: number } = { warnDays: 7, criticalDays: 2 }): Promise<boolean> {
  const level = b.runway ?? "unknown";
  if (level === "unknown") return false;
  const state = (deps.store?.state ?? collection<StateRow>("system_ops_state")) as unknown as Collection<RunwayState>;
  const alerts = deps.store?.alerts ?? collection<AlertRow>("system_ops_alerts");
  const prev = (await state.get(SYSTEM, RUNWAY_ID))?.level ?? "ok";
  const save = async (l: RunwayLevel) => {
    if (!(await state.update(SYSTEM, RUNWAY_ID, { level: l }))) await state.insertIfAbsent({ id: RUNWAY_ID, workspaceId: SYSTEM, level: l });
  };
  if (SEVERITY[level] <= SEVERITY[prev]) {
    if (level !== prev) await save(level); // recovered (or eased): re-arm
    return false;
  }
  const id = `openrouter-runway-${level}-${b.checkedAt.slice(0, 10)}`;
  const { inserted } = await alerts.insertIfAbsent({ id, workspaceId: SYSTEM, at: b.checkedAt, remaining: b.remaining, totalCredits: b.totalCredits, percent: b.percent, emailed: false });
  await save(level);
  if (!inserted) return false;
  const days = b.runwayDays ?? 0;
  const subject = `${level === "critical" ? "CRITICAL" : "Warning"}: OpenRouter credit runs out in about ${days} day${days === 1 ? "" : "s"}`;
  const text = [
    `Remaining OpenRouter credit: $${b.remaining.toFixed(2)}.`,
    `Spend over the last 24 hours: $${(b.spend24hUsd ?? 0).toFixed(2)}, so about ${days} days of runway at this rate.`,
    `Thresholds: warning at ${t.warnDays} days or less, critical at ${t.criticalDays} days or less (change them on /admin/profitability).`,
    "",
    "Top up at https://openrouter.ai/settings/credits. At $0, paid answers fall back to free models and paid images/video pause.",
  ].join("\n");
  const send = deps.send ?? sendEmail;
  const ok = await send({ to: alertRecipient(deps.env), subject, text, kind: "owner-alert" }).catch(() => false);
  if (!ok) await alerts.remove(SYSTEM, id).catch(() => false);
  logEvent(level === "critical" ? "error" : "warn", "ops.openrouter_runway_alert", { level, days, sent: ok });
  return ok;
}

/** Fetch + alert. Store/email failures never hide the balance reading. */
export async function checkOpenRouterBalance(deps: AlertDeps & { fetchImpl?: Fetch; rule?: Partial<LowRule> } = {}): Promise<BalanceResult & { alerted?: boolean }> {
  const lastRows = collection<LastRow>("system_ops_state");
  const prev = deps.rule ? null : await lastRows.get(SYSTEM, LAST_ID).catch(() => null);
  let rule: Partial<LowRule> = deps.rule ?? {};
  const runwayRule = { warnDays: 7, criticalDays: 2 };
  if (!deps.rule) {
    const cfg = await import("@/lib/cost/config").then((m) => m.costConfig()).catch(() => null);
    if (cfg) {
      rule = { percent: cfg.lowBalance.percent, basis: cfg.lowBalance.basis, floorUsd: cfg.lowBalance.floorUsd };
      runwayRule.warnDays = cfg.lowBalance.runwayWarnDays;
      runwayRule.criticalDays = cfg.lowBalance.runwayCriticalDays;
    }
  }
  let r = await fetchOpenRouterBalance({ fetchImpl: deps.fetchImpl, env: deps.env, rule, keyFallback: true });
  if (!r.ok) {
    logEvent("warn", "ops.openrouter_balance_failed", { code: r.code });
    return r;
  }
  // Re-measure against the last top-up (detected from a rise in total credits since the previous reading).
  const top = detectTopup(prev, r);
  if (rule.basis === "last_topup") r = { ...r, ...computeBalance(r.totalCredits, r.totalUsage, new Date(r.checkedAt), { ...rule, lastTopupUsd: top.lastTopupUsd }), source: r.source };
  r = { ...r, ...top };
  // Days of runway at the trailing-24h rate (the 1% rule alone can leave only hours at scale).
  const history = prev?.history ?? [];
  const spend24hUsd = trailingSpend24h(history, { at: r.checkedAt, usage: r.totalUsage, source: r.source });
  r = { ...r, spend24hUsd, ...runwayOf(r.remaining, spend24hUsd, { warnDays: runwayRule.warnDays, criticalDays: runwayRule.criticalDays }) };
  await saveReading(r, lastRows, pushSample(history, { at: r.checkedAt, usage: r.totalUsage, source: r.source ?? "credits" })).catch(() => undefined);
  // $0 left: paid OpenRouter calls fall back to :free models (src/lib/cost/guard.ts); back above $0 lifts it.
  if (!deps.rule) {
    const g = await import("@/lib/cost/guard").catch(() => null);
    if (g) await (r.remaining <= 0 ? g.markBalanceExhausted("OpenRouter balance check read $0") : g.clearBalanceExhausted()).catch(() => undefined);
  }
  if (!deps.rule) await applyRunwayAlert(r, deps, runwayRule).catch((e) => logEvent("error", "ops.openrouter_runway_alert_failed", { error: e instanceof Error ? e.name : "unknown" }));
  try {
    const { alerted } = await applyLowBalanceAlert(r, deps);
    return { ...r, alerted };
  } catch (e) {
    logEvent("error", "ops.openrouter_alert_state_failed", { error: e instanceof Error ? e.name : "unknown" });
    return { ...r, alerted: false };
  }
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Constant-time match of an Authorization header against OPS_CHECK_SECRET and CRON_SECRET (Vercel Cron). Both sides are
 * hashed first so lengths match; secrets shorter than 16 characters are ignored; none configured = nobody authorized.
 */
export function opsAuthorized(header: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const got = digest(header ?? "");
  let ok = false;
  for (const s of [env.OPS_CHECK_SECRET?.trim(), env.CRON_SECRET?.trim()]) {
    if (s && s.length >= 16 && timingSafeEqual(got, digest(`Bearer ${s}`))) ok = true;
  }
  return ok;
}
