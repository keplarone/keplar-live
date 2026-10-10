// Local QA only: node --require scripts/fake-neon-preload.cjs  (via NODE_OPTIONS) makes a production build talk to an
// in-memory Postgres (PGlite) instead of Neon, so signed-in pages can be driven by Playwright with no real database.
// It answers only the host in DATABASE_URL; every other fetch passes through untouched.
const real = globalThis.fetch;
const host = (() => { try { return new URL(process.env.DATABASE_URL || "").hostname; } catch { return ""; } })();
let dbp = null;
const db = () => (dbp ??= import(process.env.PGLITE_ENTRY || "@electric-sql/pglite").then(async (m) => { const d = new m.PGlite(); await d.waitReady; return d; }));
const text = (v) => (v === null || v === undefined ? null : typeof v === "object" ? (v instanceof Date ? v.toISOString() : JSON.stringify(v)) : String(v));
if (host) {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url).hostname !== host) return real(input, init);
    const { query, params } = JSON.parse(String(init.body));
    try {
      const r = await (await db()).query(query, params);
      const rows = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, text(v)])));
      return Response.json({ rows, rowCount: rows.length });
    } catch (e) {
      return Response.json({ message: e.message, code: e.code }, { status: 400 });
    }
  };
}
