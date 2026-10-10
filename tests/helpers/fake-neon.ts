/**
 * Test double for Neon's HTTP SQL endpoint, backed by a real in-process Postgres (PGlite).
 * Mimics `neon-raw-text-output` (every value comes back as text) and the error body shape ({ code, message }).
 * Returns null when @electric-sql/pglite isn't installed, so callers can skip.
 */
export async function installFakeNeon(host = "ep-fake-123.us-east-2.aws.neon.tech") {
  let PGlite: typeof import("@electric-sql/pglite").PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch {
    return null;
  }
  const db = new PGlite();
  await db.waitReady;
  const real = globalThis.fetch;
  const calls = { n: 0, failNext: 0 };
  const text = (v: unknown) => (v === null || v === undefined ? null : typeof v === "object" ? (v instanceof Date ? v.toISOString() : JSON.stringify(v)) : String(v));
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url).hostname !== host) return real(input, init);
    calls.n++;
    if (calls.failNext > 0) {
      calls.failNext--;
      return new Response("upstream timeout", { status: 503 });
    }
    const { query, params } = JSON.parse(String(init?.body)) as { query: string; params: unknown[] };
    try {
      const r = await db.query(query, params);
      const rows = r.rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([k, v]) => [k, text(v)])));
      return Response.json({ rows, rowCount: rows.length });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      return Response.json({ message: err.message, code: err.code }, { status: 400 });
    }
  }) as typeof fetch;
  const url = `postgresql://user:secret-pass@${host}/neondb?sslmode=require`;
  return { db, url, calls, restore: () => { globalThis.fetch = real; } };
}
