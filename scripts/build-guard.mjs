#!/usr/bin/env node
/**
 * Runs before `next build` (package.json "build"). On a Vercel production build it refuses code that was not checked against
 * origin/main, or that is older than what keplar.one serves (scripts/deploy-guard-lib.mjs), and publishes this build's stamp at
 * /deploy-stamp.json so the next deploy can compare. Anywhere else (local builds, previews, the gate) it does nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { HOW_TO_DEPLOY, checkBuild } from "./deploy-guard-lib.mjs";

const LIVE = process.env.KEPLAR_LIVE_STAMP_URL || "https://keplar.one/deploy-stamp.json";

async function liveStamp() {
  try {
    const r = await fetch(LIVE, { signal: AbortSignal.timeout(8000), headers: { "cache-control": "no-cache" } });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.count === "number" && typeof d?.sha === "string" ? { sha: d.sha, count: d.count } : null;
  } catch {
    return null;
  }
}

const env = process.env;
if (env.VERCEL_ENV !== "production") process.exit(0);

const live = await liveStamp();
const res = checkBuild(env, live);
if (!res.ok) {
  console.error(`\nbuild-guard: REFUSING this production build: ${res.reason}.\nkeplar.one keeps serving the current deployment.\n\n${HOW_TO_DEPLOY}\n`);
  process.exit(1);
}
console.log(`build-guard: ok (${res.reason})`);
const stamp = res.stamp ?? (env.VERCEL_GIT_COMMIT_SHA ? { sha: env.VERCEL_GIT_COMMIT_SHA.slice(0, 12), count: live?.count ?? 0 } : null);
if (stamp) {
  mkdirSync("public", { recursive: true });
  writeFileSync("public/deploy-stamp.json", JSON.stringify({ sha: stamp.sha, count: stamp.count, builtAt: new Date().toISOString() }));
}
