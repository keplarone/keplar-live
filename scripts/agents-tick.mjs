#!/usr/bin/env node
/**
 * Mock-mode scheduler tick against a running server (no Inngest keys needed).
 *   KEPLAR_ADMIN_TOKEN=… npm run agents:tick            # uses http://localhost:3001
 *   KEPLAR_URL=http://localhost:3001 npm run agents:tick -- --at 2026-09-28T13:02:00Z
 * `--at` only works when the server has KEPLAR_DEV_TOOLS=1.
 * Production does this with the Inngest cron (src/lib/inngest/functions.ts).
 */
const base = (process.env.KEPLAR_URL || "http://localhost:3001").replace(/\/$/, "");
const i = process.argv.indexOf("--at");
const body = i > 0 ? { at: process.argv[i + 1] } : {};
const headers = { "content-type": "application/json" };
if (process.env.KEPLAR_ADMIN_TOKEN) headers.authorization = `Bearer ${process.env.KEPLAR_ADMIN_TOKEN}`;
const res = await fetch(`${base}/api/business/agents/schedule`, { method: "POST", headers, body: JSON.stringify(body) });
console.log(res.status, JSON.stringify(await res.json(), null, 2));
process.exit(res.ok ? 0 : 1);
