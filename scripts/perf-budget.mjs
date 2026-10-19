#!/usr/bin/env node
/**
 * Performance budget: what each key route makes a browser download before it can render, measured on the production build,
 * compared with the committed budgets in perf-budgets.json. Run after `next build`:
 *   node scripts/perf-budget.mjs --start                  # starts `next start` on a free port, measures, stops it
 *   node scripts/perf-budget.mjs http://localhost:3199    # measures a server you started
 *   node scripts/perf-budget.mjs --start --update         # rewrites the budgets from this build (measured + headroom)
 *
 * Per route it reads the server-rendered HTML and sums the files it references under /_next/static: scripts (gzip bytes, what
 * travels on the wire) and stylesheets (gzip bytes and raw bytes; raw CSS is what blocks rendering and must be parsed). Sizes
 * come from the files on disk in .next/static, gzipped here at level 9, so the result does not depend on the network or a CDN.
 * No browser is used: this is a deterministic size check, not a Web Vitals measurement (scripts/perf-measure.mjs does that).
 * Exit 1 when any route is over budget, 2 on a setup error.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const BUDGETS = "perf-budgets.json";
/** Room above the measured size when budgets are rewritten: small growth passes, a new heavy dependency does not. */
const HEADROOM = 0.1;

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });

async function startServer() {
  const port = await freePort();
  const env = { ...process.env, BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "perf-budget-secret-0123456789abcdefghijklmnopqr", BETTER_AUTH_URL: `http://localhost:${port}`, KEPLAR_DEV_TOOLS: "1", KEPLAR_MX_CHECK: "off", RESEND_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1", KEPLAR_DATA_DIR: process.env.KEPLAR_DATA_DIR || `${process.env.TMPDIR || "/tmp"}/keplar-perf-budget-${process.pid}` };
  // Own process group, so stopping it also stops the workers `next start` forks.
  const child = spawn("npx", ["next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const stop = () => { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } };
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`next start exited: ${log.slice(-800)}`);
    try { const r = await fetch(`${base}/api/health`); if (r.status < 500 || r.status === 503) return { base, stop }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`next start did not answer in 60 s: ${log.slice(-800)}`);
}

const gz = new Map();
/** gzip and raw size of one built file, by its URL path (/_next/static/...). */
function sizeOf(urlPath) {
  if (gz.has(urlPath)) return gz.get(urlPath);
  const file = join(".next", "static", decodeURIComponent(urlPath.replace(/^\/_next\/static\//, "").split("?")[0]));
  const out = existsSync(file) ? (() => { const buf = readFileSync(file); return { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length }; })() : null;
  gz.set(urlPath, out);
  return out;
}

/** The static scripts and stylesheets a route's HTML references (deduplicated). */
export function assetsOf(html) {
  const js = new Set(), css = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]*\/_next\/static\/[^"]+\.js[^"]*)"/g)) js.add(new URL(m[1], "http://x").pathname);
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = m[0];
    const href = (tag.match(/\bhref="([^"]+)"/) || [])[1];
    if (!href || !href.includes("/_next/static/")) continue;
    const path = new URL(href, "http://x").pathname;
    if (/\brel="stylesheet"/.test(tag) || (/\bas="style"/.test(tag) && path.endsWith(".css"))) css.add(path);
    else if (/\bas="script"/.test(tag) || (/\brel="modulepreload"/.test(tag) && path.endsWith(".js"))) js.add(path);
  }
  return { js: [...js], css: [...css] };
}

/** Pure: compare one measurement with its budget. Returns the lines that are over. */
export function overBudget(route, m, b) {
  const out = [];
  for (const k of ["jsGzip", "cssGzip", "cssRaw"]) if (b?.[k] !== undefined && m[k] > b[k]) out.push(`${route}: ${k} ${kb(m[k])} over budget ${kb(b[k])} (+${kb(m[k] - b[k])})`);
  return out;
}
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const withRoom = (n) => Math.ceil((n * (1 + HEADROOM)) / 1024) * 1024;

async function measure(base, route) {
  const r = await fetch(base + route, { redirect: "follow", headers: { "user-agent": "keplar-perf-budget/1.0" } });
  if (r.status !== 200) return { route, status: r.status };
  const { js, css } = assetsOf(await r.text());
  const missing = [...js, ...css].filter((p) => !sizeOf(p));
  const sum = (list, k) => list.reduce((t, p) => t + (sizeOf(p)?.[k] ?? 0), 0);
  return { route, status: 200, jsFiles: js.length, cssFiles: css.length, jsGzip: sum(js, "gzip"), cssGzip: sum(css, "gzip"), cssRaw: sum(css, "raw"), missing };
}

async function main() {
  if (!existsSync(".next/BUILD_ID")) throw new Error("no production build: run `next build` first");
  const conf = JSON.parse(readFileSync(BUDGETS, "utf8"));
  const started = flag("--start") ? await startServer() : null;
  const base = (started?.base || args.find((a) => a.startsWith("http")) || "http://localhost:3199").replace(/\/$/, "");
  try {
    const rows = [];
    for (const route of Object.keys(conf.routes)) rows.push(await measure(base, route));
    const issues = [];
    console.log(`route${" ".repeat(26)}js files  js gzip   css gzip  css raw`);
    for (const m of rows) {
      if (m.status !== 200) { issues.push(`${m.route}: status ${m.status}`); continue; }
      if (m.missing.length) issues.push(`${m.route}: ${m.missing.length} referenced file(s) not in .next/static (${m.missing[0]})`);
      console.log(`${m.route.padEnd(31)}${String(m.jsFiles).padStart(8)}  ${kb(m.jsGzip).padStart(9)} ${kb(m.cssGzip).padStart(9)} ${kb(m.cssRaw).padStart(9)}`);
      if (!flag("--update")) issues.push(...overBudget(m.route, m, conf.routes[m.route]));
    }
    if (flag("--update")) {
      for (const m of rows) if (m.status === 200) conf.routes[m.route] = { jsGzip: withRoom(m.jsGzip), cssGzip: withRoom(m.cssGzip), cssRaw: withRoom(m.cssRaw) };
      conf.measured = new Date().toISOString().slice(0, 10);
      writeFileSync(BUDGETS, `${JSON.stringify(conf, null, 2)}\n`);
      console.log(`\nbudgets rewritten in ${BUDGETS} (measured + ${HEADROOM * 100}% headroom, rounded up to 1 KB)`);
    }
    console.log(issues.length ? `\nOVER BUDGET (${issues.length}):\n${issues.join("\n")}` : "\nAll routes within budget.");
    process.exitCode = issues.length ? 1 : 0;
  } finally {
    started?.stop();
    setTimeout(() => process.exit(process.exitCode ?? 0), 3000).unref();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(`perf-budget: ${e.message}`); process.exit(2); });
