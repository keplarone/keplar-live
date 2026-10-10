// Neon HTTP SQL emulator over PGlite for local browser tests: POST /sql {query, params} -> {rows}
// node scripts/e2e-neon.mjs [port]   (pair it with scripts/e2e-neon-preload.mjs, see scripts/onboarding-e2e.mjs)
import http from "node:http";
import { PGlite } from "@electric-sql/pglite";
const port = Number(process.argv[2] || 5565);
const db = new PGlite();
await db.waitReady;
const text = (v) => (v === null || v === undefined ? null : typeof v === "object" ? (v instanceof Date ? v.toISOString() : JSON.stringify(v)) : String(v));
http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", async () => {
    try {
      const { query, params } = JSON.parse(b);
      const r = await db.query(query, params);
      const rows = r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, text(v)])));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ rows, rowCount: rows.length }));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ message: e.message, code: e.code }));
    }
  });
}).listen(port, "127.0.0.1", () => console.log(`fake neon on ${port}`));
