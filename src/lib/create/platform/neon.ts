/**
 * Minimal Neon Postgres client over the HTTP SQL endpoint (no dependency).
 * Set DATABASE_URL to a Neon connection string (postgres://user:pass@ep-xxx.region.aws.neon.tech/db).
 * Vercel's Neon integration also sets POSTGRES_URL (same database); it is used when DATABASE_URL is missing.
 * The connection string is only ever sent to that host, server-side, in a header, and is never logged.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const URL_NAMES = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING"] as const;
const isPg = (v: string) => /^postgres(ql)?:\/\//.test(v);

export const databaseUrl = () => {
  for (const n of URL_NAMES) {
    const v = process.env[n]?.trim();
    if (v && isPg(v)) return v;
  }
  return "";
};
export const neonConfigured = () => databaseUrl() !== "";

export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/**
 * The database can't be reached right now: the plan's compute allowance is used up (HTTP 402), Neon is down or overloaded (5xx, 429),
 * the request timed out or never connected, or the circuit below is open after one of those. Not a SQL error: the same query will
 * work again once the database is back. Routes answer 503 "temporarily unavailable" (http.ts) or degrade, instead of crashing.
 */
export type UnavailableReason = "quota" | "server" | "network" | "timeout" | "circuit_open" | "not_configured";
export class StoreUnavailableError extends DatabaseError {
  override name = "StoreUnavailableError";
  constructor(public reason: UnavailableReason, message = "The database is temporarily unavailable.", code?: string) {
    super(message, code ?? reason);
  }
}
export const isStoreUnavailable = (e: unknown): e is StoreUnavailableError => e instanceof StoreUnavailableError;

/**
 * HTTP status of a failed Neon request -> unavailable or not. SQL errors come back as 4xx with a Postgres code (400 + 42P01...):
 * those are bugs or bad input, never retried and never trip the circuit. 402 (allowance exhausted), 401/403 (project suspended or
 * credentials revoked), 408/429 (overloaded) and every 5xx mean "the database isn't available".
 */
export function unavailableStatus(status: number, body?: { message?: unknown } | null): UnavailableReason | null {
  if (status === 402) return "quota";
  if (status >= 500 || status === 401 || status === 403 || status === 408 || status === 429) return "server";
  // Some quota responses arrive as a plain 4xx with only a message.
  const msg = typeof body?.message === "string" ? body.message : "";
  if (/exceeded the (compute time|data transfer) quota|compute time quota|endpoint is disabled/i.test(msg)) return "quota";
  return null;
}

/**
 * Process-level circuit breaker for the database. After an unavailable answer every query fails at once (no network round trip, no
 * 8 s timeout per query) for OPEN_MS, then ONE probe query is let through: success closes the circuit, failure opens it again.
 * Queries that arrive while the probe is in flight also fail fast. Per instance (serverless instances each learn on their own).
 * Nothing is cached or written anywhere else: callers see StoreUnavailableError and decide.
 */
const OPEN_MS: Record<UnavailableReason, number> = { quota: 60_000, server: 30_000, network: 30_000, timeout: 30_000, circuit_open: 30_000, not_configured: 30_000 };
type Circuit = { state: "closed" | "open" | "half_open"; until: number; reason: UnavailableReason | null; trips: number; probing: boolean };
const circuit: Circuit = { state: "closed", until: 0, reason: null, trips: 0, probing: false };

/** Read-only view (health, tests). */
export const storeCircuit = (now = Date.now()) => ({ open: circuit.state !== "closed" && (now < circuit.until || circuit.probing), state: circuit.state, reason: circuit.reason, retryAt: circuit.state === "closed" ? null : circuit.until, trips: circuit.trips });
/** True while queries are being short-circuited (the database answered "unavailable" within the last OPEN_MS). */
export const storeUnavailableNow = (now = Date.now()) => storeCircuit(now).open;
/** Tests: back to a closed circuit. */
export function resetStoreCircuit() {
  circuit.state = "closed";
  circuit.until = 0;
  circuit.reason = null;
  circuit.trips = 0;
  circuit.probing = false;
}

/** Tests: let the next query through as the half-open probe, as if the open period had passed. */
export function expireStoreCircuit() {
  if (circuit.state !== "closed") circuit.until = 0;
}

function trip(reason: UnavailableReason, now = Date.now()) {
  const wasClosed = circuit.state === "closed";
  circuit.state = "open";
  circuit.reason = reason;
  circuit.until = now + OPEN_MS[reason];
  circuit.trips++;
  circuit.probing = false;
  // One log line per outage (and per failed probe), not one per query.
  if (wasClosed) console.error(`[neon] store unavailable (${reason}); failing fast for ${Math.round(OPEN_MS[reason] / 1000)}s`);
}

function closeCircuit() {
  if (circuit.state !== "closed") console.error("[neon] store reachable again; circuit closed");
  circuit.state = "closed";
  circuit.reason = null;
  circuit.probing = false;
  circuit.until = 0;
}

/** Throws when the circuit is open; otherwise returns whether this call is the half-open probe. */
function admit(now = Date.now()): boolean {
  if (circuit.state === "closed") return false;
  if (now < circuit.until || circuit.probing) {
    throw new StoreUnavailableError("circuit_open", "The database is temporarily unavailable.", circuit.reason ?? "circuit_open");
  }
  circuit.state = "half_open";
  circuit.probing = true;
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * When this instance last ran a query for real work (a page, a chat, a sign-in), as opposed to background telemetry. Neon bills
 * compute while it is awake and suspends it after ~5 idle minutes, so telemetry (src/lib/traffic/flush-gate.ts) writes while the
 * database is awake anyway and otherwise waits, instead of waking it on its own. Telemetry writes run inside `asTelemetry` so they
 * don't count as activity (otherwise each flush would keep the next one "due" forever).
 */
let lastActivityAt = 0;
const telemetryScope = new AsyncLocalStorage<boolean>();
export const lastStoreActivity = () => lastActivityAt;
export const asTelemetry = <R>(fn: () => Promise<R>): Promise<R> => telemetryScope.run(true, fn);
/** Tests. */
export const setLastStoreActivity = (t: number) => void (lastActivityAt = t);

/**
 * One SQL statement. Retries once on a network error, timeout or 5xx (a Neon compute waking from
 * scale-to-zero can fail the first request). SQL errors (4xx) are not retried; the error carries
 * the Postgres code (e.g. 42P01), never the connection string. "Database unavailable" answers (402, 5xx after the retry, network,
 * timeout) throw StoreUnavailableError and open the circuit above.
 */
export async function neonQuery(query: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const url = databaseUrl();
  if (!url) throw new DatabaseError("DATABASE_URL is not set.");
  const probe = admit();
  const host = new URL(url).hostname;
  let last: DatabaseError = new StoreUnavailableError("network", "The database didn't respond.", "network");
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(400);
      let timedOut = false;
      const res = await fetch(`https://${host}/sql`, {
        method: "POST",
        headers: { "content-type": "application/json", "neon-connection-string": url, "neon-raw-text-output": "true" },
        body: JSON.stringify({ query, params: params.map((p) => (p === undefined ? null : p)) }),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }).catch((e: unknown) => {
        timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        return null;
      });
      if (!res) {
        last = new StoreUnavailableError(timedOut ? "timeout" : "network", "The database didn't respond.", "network");
        continue;
      }
      const j = (await res.json().catch(() => null)) as { rows?: Record<string, unknown>[]; code?: string; message?: string } | null;
      if (res.ok) {
        if (probe || circuit.state !== "closed") closeCircuit();
        if (!telemetryScope.getStore()) lastActivityAt = Date.now();
        return j?.rows ?? [];
      }
      const message = `The database returned HTTP ${res.status}${j?.code ? ` (${j.code})` : ""}.`;
      const unavailable = unavailableStatus(res.status, j);
      last = unavailable ? new StoreUnavailableError(unavailable, message, j?.code ?? String(res.status)) : new DatabaseError(message, j?.code ?? String(res.status));
      // 402 (allowance used up) won't change in 400 ms; only 5xx are worth the one retry.
      if (res.status < 500) break;
    }
  } catch (e) {
    if (probe) circuit.probing = false;
    throw e;
  }
  if (last instanceof StoreUnavailableError) trip(last.reason);
  else {
    if (probe) closeCircuit(); // the database answered (a SQL error): it is reachable
    console.error("[neon]", last.message);
  }
  throw last;
}

/** A jsonb column comes back as text (raw text output); tolerate an already-parsed value too. */
export const parseData = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

/** Expression indexes for findSystemBy / listSystemBy lookups on hot system paths. */
export const LOOKUP_INDEXES = [
  // Stripe Connect webhooks: orders by Checkout Session / PaymentIntent, connected accounts by Stripe account id.
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS keplar_rows_checkout_session ON keplar_rows (collection, (data #>> '{checkoutSessionId}'))",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS keplar_rows_payment_intent ON keplar_rows (collection, (data #>> '{paymentIntentId}'))",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS keplar_rows_stripe_account ON keplar_rows (collection, (data #>> '{stripeAccountId}'))",
  // Custom-domain site routing (create_domains by host name). Partial: `name` is a common field in other collections.
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS keplar_rows_domain_name ON keplar_rows (collection, (data #>> '{name}')) WHERE collection = 'create_domains'",
];

/** The table and the indexes every deployment needs (each idempotent). */
const BASE_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS keplar_rows (collection text NOT NULL, workspace_id text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (collection, workspace_id, id))",
  "CREATE INDEX IF NOT EXISTS keplar_rows_ws ON keplar_rows (collection, workspace_id)",
  // Cross-tenant lookups used on hot paths (session -> workspace, webhooks, public site routing).
  "CREATE INDEX IF NOT EXISTS keplar_rows_id ON keplar_rows (collection, id)",
  "CREATE INDEX IF NOT EXISTS keplar_rows_owner_user ON keplar_rows (collection, (data #>> '{ownerUserId}'))",
  "CREATE INDEX IF NOT EXISTS keplar_rows_owner_email ON keplar_rows (collection, lower(data #>> '{ownerEmail}'))",
  "CREATE INDEX IF NOT EXISTS keplar_rows_subscription ON keplar_rows (collection, (data #>> '{billing,subscriptionId}'))",
  "CREATE INDEX IF NOT EXISTS keplar_rows_slug ON keplar_rows (collection, (data #>> '{slug}'))",
];

/**
 * Schema marker: a row in keplar_rows (collection "_schema") holding a fingerprint of every statement above. When it matches, a cold
 * start does one indexed read instead of ~12 DDL statements; any change to the statements changes the fingerprint, so the DDL runs
 * again once (and rewrites the marker). The marker is only written after every statement, including each CONCURRENTLY index, succeeded.
 */
const fingerprint = (list: string[]) => {
  let h = 5381;
  for (const ch of list.join("\n")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `v1-${list.length}-${h.toString(36)}`;
};
export const SCHEMA_VERSION = fingerprint([...BASE_SCHEMA, ...LOOKUP_INDEXES]);
const MARKER = { collection: "_schema", workspace: "_schema", id: "keplar_rows" } as const;

async function schemaCurrent(): Promise<boolean> {
  try {
    const r = await neonQuery("SELECT data ->> 'version' AS v FROM keplar_rows WHERE collection = $1 AND workspace_id = $2 AND id = $3", [MARKER.collection, MARKER.workspace, MARKER.id]);
    return r[0]?.v === SCHEMA_VERSION;
  } catch (e) {
    if (isStoreUnavailable(e)) throw e; // unreachable: running ~12 DDL statements would only fail the same way
    return false; // no table yet (42P01), or the read failed: the full, idempotent DDL path decides
  }
}

let ready: Promise<void> | null = null;
/** Creates the tables and indexes on first use (idempotent; safe when several instances start at once). */
export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    if (await schemaCurrent()) return;
    let complete = true;
    const run = async () => {
      complete = true;
      for (const q of BASE_SCHEMA) await neonQuery(q);
      // Added after launch, on a table that already holds data: best effort, so a slow one-time build never fails the request
      // that triggered it (lookups still work without the index, only slower; the next instance tries again). CONCURRENTLY so
      // the build never blocks writes to keplar_rows (Neon HTTP runs each statement outside a transaction).
      for (const q of LOOKUP_INDEXES) {
        await neonQuery(q).catch(() => {
          complete = false;
        });
      }
    };
    // Concurrent CREATE ... IF NOT EXISTS from two instances can lose a catalog race once; a retry succeeds.
    await run().catch(async () => {
      await sleep(300);
      await run();
    });
    if (complete) {
      await neonQuery(
        "INSERT INTO keplar_rows (collection, workspace_id, id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (collection, workspace_id, id) DO UPDATE SET data = EXCLUDED.data",
        [MARKER.collection, MARKER.workspace, MARKER.id, JSON.stringify({ version: SCHEMA_VERSION, at: new Date().toISOString() })],
      ).catch(() => undefined); // no marker = the next cold start runs the DDL again, as before
    }
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Tests: forget that this process already checked the schema (a new cold start). */
export const resetSchemaCheck = () => {
  ready = null;
};
