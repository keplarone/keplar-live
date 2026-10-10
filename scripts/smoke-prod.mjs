#!/usr/bin/env node
/**
 * Post-deploy smoke check (no browser, no login, read-only GETs). Usage: node scripts/smoke-prod.mjs [baseUrl]
 * Default base: https://keplar.one. Routes come from scripts/smoke-routes.json. Exit 1 if any check fails.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] || process.env.SMOKE_BASE || "https://keplar.one").replace(/\/$/, "");
const routes = JSON.parse(readFileSync(fileURLToPath(new URL("./smoke-routes.json", import.meta.url)), "utf8"));
let failed = 0;
const report = (ok, label, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`); };
const get = async (path) => {
  const t = Date.now();
  const res = await fetch(base + path, { redirect: "follow", headers: { "user-agent": "keplar-smoke/1" } });
  return { res, ms: Date.now() - t, body: await res.text() };
};

for (const p of routes.pages) {
  try {
    const { res, ms, body } = await get(p.path);
    const textOk = !p.text || new RegExp(p.text, "i").test(body);
    report(res.status < 400 && textOk, `GET ${p.path}`, `${res.status}, ${ms} ms${textOk ? "" : `, missing "${p.text}"`}`);
  } catch (e) { report(false, `GET ${p.path}`, e instanceof Error ? e.message : "error"); }
}
for (const a of routes.api) {
  try {
    const { res, body } = await get(a.path);
    let json = {}; try { json = JSON.parse(body); } catch { /* not json */ }
    const match = Object.entries(a.json).every(([k, v]) => json[k] === v);
    report(res.status === 200 && match, `GET ${a.path}`, `${res.status}`);
  } catch (e) { report(false, `GET ${a.path}`, e instanceof Error ? e.message : "error"); }
}
for (const h of routes.mustBeHidden) {
  try { const { res } = await get(h); report(res.status === 404, `GET ${h} is hidden when signed out`, `${res.status}`); }
  catch (e) { report(false, `GET ${h}`, e instanceof Error ? e.message : "error"); }
}
try {
  const { res } = await get("/");
  const h = res.headers;
  report(Boolean(h.get("strict-transport-security")) && h.get("x-content-type-options") === "nosniff", "security headers on /", "HSTS + nosniff");
} catch { report(false, "security headers on /"); }

console.log(failed ? `\nsmoke: ${failed} check(s) FAILED against ${base}` : `\nsmoke: all checks passed against ${base}`);
process.exit(failed ? 1 : 0);
