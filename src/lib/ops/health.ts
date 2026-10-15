/**
 * Health probes shared by GET /api/health and the public /status page.
 * Nothing here returns connection details, env values, user data or error text beyond a short label.
 */
import { neonConfigured } from "@/lib/create/platform/neon";
import { rateLimitBackend } from "@/lib/create/platform/ratelimit";
import { collection, storeDurable } from "@/lib/create/platform/store";
import { id as newId } from "@/lib/create/platform/ids";
import { authSecretConfigured, authSecretMissingInProduction } from "@/lib/accounts/secret";

type Probe = { id: string; workspaceId: string; at: string };
let cached: { at: number; ok: boolean; ms: number; error?: string } | null = null;

/** Write/read/delete round trip on the store. Cached per instance for 60 s so polling can't hammer the database. */
export async function probeStore() {
  if (cached && Date.now() - cached.at < 60_000) return cached;
  const started = Date.now();
  const rows = collection<Probe>("_health");
  const rid = newId("hc");
  try {
    await rows.insert({ id: rid, workspaceId: "system", at: new Date().toISOString() });
    const back = await rows.get("system", rid);
    const removed = await rows.remove("system", rid);
    if (!back || !removed) throw new Error("round trip mismatch");
    cached = { at: Date.now(), ok: true, ms: Date.now() - started };
  } catch (e) {
    cached = { at: Date.now(), ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message.slice(0, 120) : "error" };
  }
  return cached;
}

export { authSecretConfigured };

/** Shown (and logged) when production runs without BETTER_AUTH_SECRET. A label only, never a value. */
export const AUTH_SECRET_ERROR = "auth secret not configured";

export async function healthSummary() {
  const postgres = neonConfigured();
  const security = {
    authSecret: authSecretConfigured(),
    rateLimit: rateLimitBackend(),
  };
  // Production on a temporary random secret is a failure, not a warning: sessions and sign-in links break on every restart.
  const secretMissing = authSecretMissingInProduction();
  if (secretMissing) console.error("[health] CRITICAL: auth secret not configured. Set BETTER_AUTH_SECRET to 32+ random characters in the production environment.");
  if (!postgres) {
    const ok = !secretMissing;
    return { status: ok ? 200 : 503, body: { ok, store: "file" as const, durable: storeDurable(), security, ...(ok ? {} : { error: AUTH_SECRET_ERROR }) } };
  }
  const p = await probeStore();
  const ok = p.ok && !secretMissing;
  const error = !p.ok ? p.error : secretMissing ? AUTH_SECRET_ERROR : undefined;
  return { status: ok ? 200 : 503, body: { ok, store: "postgres" as const, durable: true, roundTripMs: p.ms, security, ...(error ? { error } : {}) } };
}

/* ───────────── Scheduled jobs (Vercel Cron) ───────────── */

/** The jobs in vercel.json and how long a silent job may stay silent before it is called late (daily jobs + 6 h grace). */
export const CRON_JOBS = [
  { name: "domains", label: "Custom domain re-check", maxAgeHours: 30 },
  { name: "learning", label: "Nightly learning and FAQ refresh", maxAgeHours: 30 },
  { name: "agents", label: "Scheduled agents (daily server check)", maxAgeHours: 30 },
  { name: "openrouter-balance", label: "Model credit balance check", maxAgeHours: 30 },
  { name: "cost-guard", label: "Cost guard (margin, anomalies, balance)", maxAgeHours: 30 },
  { name: "observatory", label: "Model drift and feature regressions (alert only)", maxAgeHours: 30 },
  { name: "app-schedules", label: "Scheduled jobs of published Keplar apps", maxAgeHours: 30 },
] as const;
export type CronName = (typeof CRON_JOBS)[number]["name"];

type Beat = { id: string; workspaceId: string; lastRunAt: string; lastOk: boolean; lastOkAt: string | null };
const beats = () => collection<Beat>("_cron_beats");

/** Record that a cron job ran. Never throws: a failed heartbeat must not fail the job. */
export async function cronBeat(name: CronName, ok: boolean): Promise<void> {
  try {
    const now = new Date().toISOString();
    const cur = await beats().get("system", name);
    if (cur) await beats().update("system", name, { lastRunAt: now, lastOk: ok, lastOkAt: ok ? now : cur.lastOkAt });
    else await beats().insert({ id: name, workspaceId: "system", lastRunAt: now, lastOk: ok, lastOkAt: ok ? now : null });
  } catch (e) {
    console.error("[cron] heartbeat failed:", e instanceof Error ? e.name : "error");
  }
}

export type CronState = "ok" | "late" | "failed" | "never";
export function cronState(b: { lastOk: boolean; lastOkAt: string | null } | null, maxAgeHours: number, now = Date.now()): CronState {
  if (!b) return "never";
  if (!b.lastOk) return "failed";
  if (!b.lastOkAt) return "never";
  return now - Date.parse(b.lastOkAt) > maxAgeHours * 3_600_000 ? "late" : "ok";
}

export async function cronStatus(now = Date.now()) {
  const out: { name: CronName; label: string; state: CronState; lastOkAt: string | null }[] = [];
  for (const j of CRON_JOBS) {
    let b: Beat | null = null;
    try {
      b = await beats().get("system", j.name);
    } catch {
      b = null;
    }
    out.push({ name: j.name, label: j.label, state: cronState(b, j.maxAgeHours, now), lastOkAt: b?.lastOkAt ?? null });
  }
  return out;
}
