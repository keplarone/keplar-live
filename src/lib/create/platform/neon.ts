/**
 * Minimal Neon Postgres client over the HTTP SQL endpoint (no dependency).
 * Set DATABASE_URL to a Neon connection string (postgres://user:pass@ep-xxx.region.aws.neon.tech/db).
 * Vercel's Neon integration also sets POSTGRES_URL (same database); it is used when DATABASE_URL is missing.
 * The connection string is only ever sent to that host, server-side, in a header, and is never logged.
 */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One SQL statement. Retries once on a network error, timeout or 5xx (a Neon compute waking from
 * scale-to-zero can fail the first request). SQL errors (4xx) are not retried; the error carries
 * the Postgres code (e.g. 42P01), never the connection string.
 */
export async function neonQuery(query: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const url = databaseUrl();
  if (!url) throw new DatabaseError("DATABASE_URL is not set.");
  const host = new URL(url).hostname;
  let last = new DatabaseError("The database didn't respond.");
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(400);
    const res = await fetch(`https://${host}/sql`, {
      method: "POST",
      headers: { "content-type": "application/json", "neon-connection-string": url, "neon-raw-text-output": "true" },
      body: JSON.stringify({ query, params: params.map((p) => (p === undefined ? null : p)) }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res) {
      last = new DatabaseError("The database didn't respond.", "network");
      continue;
    }
    const j = (await res.json().catch(() => null)) as { rows?: Record<string, unknown>[]; code?: string } | null;
    if (res.ok) return j?.rows ?? [];
    last = new DatabaseError(`The database returned HTTP ${res.status}${j?.code ? ` (${j.code})` : ""}.`, j?.code ?? String(res.status));
    if (res.status < 500) break;
  }
  console.error("[neon]", last.message);
  throw last;
}

/** A jsonb column comes back as text (raw text output); tolerate an already-parsed value too. */
export const parseData = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

/** Expression indexes for findSystemBy / listSystemBy lookups on hot system paths. */
export const LOOKUP_INDEXES = [
  // Stripe Connect webhooks: orders by Checkout Session / PaymentIntent, connected accounts by Stripe account id.
  "CREATE INDEX IF NOT EXISTS keplar_rows_checkout_session ON keplar_rows (collection, (data #>> '{checkoutSessionId}'))",
  "CREATE INDEX IF NOT EXISTS keplar_rows_payment_intent ON keplar_rows (collection, (data #>> '{paymentIntentId}'))",
  "CREATE INDEX IF NOT EXISTS keplar_rows_stripe_account ON keplar_rows (collection, (data #>> '{stripeAccountId}'))",
  // Custom-domain site routing (create_domains by host name). Partial: `name` is a common field in other collections.
  "CREATE INDEX IF NOT EXISTS keplar_rows_domain_name ON keplar_rows (collection, (data #>> '{name}')) WHERE collection = 'create_domains'",
];

let ready: Promise<void> | null = null;
/** Creates the tables and indexes on first use (idempotent; safe when several instances start at once). */
export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const run = async () => {
      await neonQuery("CREATE TABLE IF NOT EXISTS keplar_rows (collection text NOT NULL, workspace_id text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (collection, workspace_id, id))");
      await neonQuery("CREATE INDEX IF NOT EXISTS keplar_rows_ws ON keplar_rows (collection, workspace_id)");
      // Cross-tenant lookups used on hot paths (session -> workspace, webhooks, public site routing).
      await neonQuery("CREATE INDEX IF NOT EXISTS keplar_rows_id ON keplar_rows (collection, id)");
      await neonQuery("CREATE INDEX IF NOT EXISTS keplar_rows_owner_user ON keplar_rows (collection, (data #>> '{ownerUserId}'))");
      await neonQuery("CREATE INDEX IF NOT EXISTS keplar_rows_owner_email ON keplar_rows (collection, lower(data #>> '{ownerEmail}'))");
      await neonQuery("CREATE INDEX IF NOT EXISTS keplar_rows_subscription ON keplar_rows (collection, (data #>> '{billing,subscriptionId}'))");
      await neonQuery("CREATE INDEX IF NOT EXISTS keplar_rows_slug ON keplar_rows (collection, (data #>> '{slug}'))");
      // Added after launch, on a table that already holds data: best effort, so a slow one-time build never fails the request
      // that triggered it (lookups still work without the index, only slower; the next instance tries again).
      for (const q of LOOKUP_INDEXES) await neonQuery(q).catch(() => undefined);
    };
    // Concurrent CREATE ... IF NOT EXISTS from two instances can lose a catalog race once; a retry succeeds.
    await run().catch(async () => {
      await sleep(300);
      await run();
    });
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
