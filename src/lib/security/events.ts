/**
 * Security event log and anomaly alerts.
 *
 * One structured line per event (`logEvent`, JSON with the request id, so Vercel logs and a log drain carry it) and, when the
 * store is available, one row in the `security_events` collection under the system tenant, so /admin can show them and
 * `tests/security-events.test.ts` can read them back. Never a prompt, a token, an email address in clear or a request body:
 * ids, codes, a hashed IP and a hashed account id only.
 *
 * Kinds (fixed list so dashboards and alerts can key on them):
 *   auth.failed          a wrong password / code / link           auth.throttled     a sign-in limiter tripped (credential stuffing, brute force)
 *   auth.mfa_failed      a wrong second factor                    auth.signin        a successful sign-in (new device noted separately)
 *   authz.denied         a 401/403 from a route (someone touched something that is not theirs, or a cross-site POST)
 *   admin.action         anything written to the admin audit log  billing.change     a plan or credit change from a webhook or admin
 *   agent.action         an agent did or proposed an outward action
 *   secret.access        a stored secret was unsealed for use     config.change      a kill switch, limit or security setting changed
 *   upload.rejected      a file refused by the upload scan        export.data        an account or workspace export was produced
 *
 * Alerts: counters per kind and per hashed IP / account in the shared limiter. Past a threshold (`ALERTS`), the owner gets one
 * email per kind per hour (alertOwner), never one per event. Everything here is best effort: a failing store or mail never
 * fails the request that produced the event.
 */
import { createHash } from "node:crypto";
import { logEvent } from "@/lib/ops/log";

export type SecurityEventKind =
  | "auth.failed" | "auth.throttled" | "auth.mfa_failed" | "auth.signin"
  | "authz.denied"
  | "admin.action" | "billing.change" | "agent.action" | "secret.access" | "config.change"
  | "upload.rejected" | "export.data";

export type SecurityEvent = {
  id: string;
  workspaceId: "system";
  at: string;
  kind: SecurityEventKind;
  /** Short machine code: the HttpError code, the audit action, the route code. */
  code: string;
  /** Route path or module, without query strings or ids. */
  where: string;
  reqId: string | null;
  /** sha256 prefix of the client IP (never the IP). */
  ipKey: string | null;
  /** sha256 prefix of the account / workspace id (never the id). */
  acctKey: string | null;
  status: number | null;
};

export type SecurityEventInput = { kind: SecurityEventKind; code: string; where?: string; req?: Request | null; ip?: string | null; accountId?: string | null; status?: number | null };

const hash = (v: string | null | undefined) => (v ? createHash("sha256").update(v).digest("hex").slice(0, 16) : null);
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const reqIdOf = (req?: Request | null) => { const v = req?.headers.get("x-request-id") ?? ""; return SAFE_ID.test(v) ? v : null; };
const ipOf = (req?: Request | null) => req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req?.headers.get("x-real-ip") || null;
/** A route path with ids and query removed: /api/projects/:id */
export const whereOf = (req?: Request | null, fallback = "unknown") => {
  if (!req) return fallback;
  try {
    return new URL(req.url).pathname.replace(/\/(?:[0-9a-f]{8,}|[A-Za-z0-9_-]{16,}|\d+)(?=\/|$)/g, "/:id").slice(0, 120);
  } catch {
    return fallback;
  }
};

/**
 * Thresholds per kind, per key (ip or account), in a 10-minute window. Reaching one sends an owner alert, once per kind per hour.
 * Tuned for a small product: a person mistyping a password a few times never alerts; a script walking accounts does.
 */
export const ALERTS: Partial<Record<SecurityEventKind, { perIp?: number; perAccount?: number; subject: string }>> = {
  "auth.failed": { perIp: 25, perAccount: 12, subject: "Many failed sign-ins" },
  "auth.throttled": { perIp: 3, perAccount: 3, subject: "Sign-in limiter tripped repeatedly (credential stuffing or brute force)" },
  "auth.mfa_failed": { perIp: 10, perAccount: 6, subject: "Repeated wrong two-factor codes" },
  "authz.denied": { perIp: 40, perAccount: 25, subject: "Many authorization failures (someone probing other people's data)" },
  "upload.rejected": { perIp: 15, perAccount: 15, subject: "Many rejected uploads" },
  "export.data": { perAccount: 5, subject: "Unusual number of data exports" },
  "secret.access": { perAccount: 200, subject: "Unusual number of secret reads" },
  "billing.change": { perAccount: 10, subject: "Unusual number of billing changes on one account" },
};
const WINDOW_SEC = 600;
const ALERT_COOLDOWN_SEC = 3600;

const inFlight = new Set<Promise<unknown>>();
/** Tests await this so a fire-and-forget write is visible before they read. */
export const securityEventsSettled = async () => { await Promise.allSettled([...inFlight]); };

/** Records one event. Fire-and-forget: returns immediately; the store write and alert check run in the background. */
export function securityEvent(input: SecurityEventInput): void {
  const ev: SecurityEvent = {
    id: `sec_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    workspaceId: "system",
    at: new Date().toISOString(),
    kind: input.kind,
    code: String(input.code ?? "").slice(0, 60),
    where: (input.where ?? whereOf(input.req)).slice(0, 120),
    reqId: reqIdOf(input.req),
    ipKey: hash(input.ip ?? ipOf(input.req)),
    acctKey: hash(input.accountId ?? null),
    status: typeof input.status === "number" ? input.status : null,
  };
  logEvent(ev.kind === "authz.denied" || ev.kind.startsWith("auth.") && ev.kind !== "auth.signin" ? "warn" : "info", `security.${ev.kind}`, { code: ev.code, where: ev.where, ipKey: ev.ipKey, acctKey: ev.acctKey, status: ev.status }, input.req);
  const p = persistAndAlert(ev).catch(() => undefined).finally(() => inFlight.delete(p));
  inFlight.add(p);
}

async function persistAndAlert(ev: SecurityEvent): Promise<void> {
  // Lazy imports: this module is used from the HTTP helper, and the store must not import it back.
  const { collection } = await import("@/lib/create/platform/store");
  await collection<SecurityEvent>("security_events").insert(ev).catch(() => undefined);
  const rule = ALERTS[ev.kind];
  if (!rule) return;
  const { rateLimit, RateLimitError } = await import("@/lib/create/platform/ratelimit");
  const tripped: string[] = [];
  const count = async (key: string | null, max: number | undefined, label: string) => {
    if (!key || !max) return;
    try {
      await rateLimit(`sec:${ev.kind}:${label}:${key}`, max, WINDOW_SEC, { shared: true });
    } catch (e) {
      if (e instanceof RateLimitError) tripped.push(label);
      else throw e;
    }
  };
  await count(ev.ipKey, rule.perIp, "ip");
  await count(ev.acctKey, rule.perAccount, "acct");
  if (!tripped.length) return;
  // One alert per kind per hour.
  try {
    await rateLimit(`sec:alerted:${ev.kind}`, 1, ALERT_COOLDOWN_SEC, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) return;
    throw e;
  }
  const { alertOwner } = await import("@/lib/accounts/alerts");
  await alertOwner(
    rule.subject,
    `Security signal: "${ev.kind}" crossed its threshold in the last ${WINDOW_SEC / 60} minutes (by ${tripped.join(" and ")}).\n\nLast event: code ${ev.code}, at ${ev.where}${ev.reqId ? `, request ${ev.reqId}` : ""}.\nKeys (hashed, for correlation only): ip ${ev.ipKey ?? "-"}, account ${ev.acctKey ?? "-"}.\n\nWhat to do: open /admin (Security events), check whether one address or one account is behind it, and follow docs/runbooks/security-incident.md. Nothing has been blocked automatically beyond the normal rate limits.`,
  );
}

/** Recent events for the admin page (newest first). */
export async function recentSecurityEvents(limit = 200, sinceMs = 7 * 864e5): Promise<SecurityEvent[]> {
  const { collection } = await import("@/lib/create/platform/store");
  const since = new Date(Date.now() - sinceMs).toISOString();
  return (await collection<SecurityEvent>("security_events").listSystemRange({ field: "at", gte: since }, limit)).slice(0, limit);
}

/** Retention: security events are kept 90 days (KEPLAR_RETAIN_SECURITY_EVENTS_DAYS), pruned by the hourly retention job. */
export const securityEventRetentionDays = (env: Record<string, string | undefined> = process.env) => {
  const n = Number(env.KEPLAR_RETAIN_SECURITY_EVENTS_DAYS);
  return Number.isFinite(n) && n >= 30 ? Math.floor(n) : 90;
};
export async function pruneSecurityEvents(at = Date.now(), batch = 5000): Promise<number> {
  const { collection } = await import("@/lib/create/platform/store");
  return collection("security_events").purgeSystemBefore("at", new Date(at - securityEventRetentionDays() * 864e5).toISOString(), batch);
}
