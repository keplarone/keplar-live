#!/usr/bin/env node
/**
 * Gated production deploy. Usage: node scripts/deploy.mjs [gitRef=HEAD] [--dry-run] [--quick]
 *   1. checks out <gitRef> into a throwaway git worktree under /tmp (your working tree and other people's uncommitted files are never deployed)
 *   2. runs `npm run verify` there; if anything fails the script exits 1 and NOTHING is deployed
 *   3. deploys with `vercel --prod --yes` using a fresh HOME and VERCEL_TOKEN from the environment (never printed)
 *   4. runs the post-deploy smoke check against the live site; a failure exits 1 and tells you to roll back (docs/runbooks/rollback.md)
 * --dry-run runs steps 1-2 only. --quick runs verify in quick mode (no build / browser smoke); intended for docs-only changes.
 * Env: KEPLAR_NODE_MODULES (path to a node_modules to link; default: this repo's), VERCEL_TOKEN, KEPLAR_SMOKE_BASE (default https://keplar.one).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const ref = argv.find((a) => !a.startsWith("--")) || "HEAD";
const dry = flags.has("--dry-run");
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const sha = execFileSync("git", ["rev-parse", "--short", ref], { cwd: repo, encoding: "utf8" }).trim();
const dir = join(tmpdir(), `keplar-deploy-${sha}`);
const nm = process.env.KEPLAR_NODE_MODULES || join(repo, "node_modules");
const fail = (m) => { console.error(`\ndeploy: ${m}`); process.exit(1); };

if (!existsSync(nm)) fail(`node_modules not found at ${nm} (set KEPLAR_NODE_MODULES)`);
if (!dry && !process.env.VERCEL_TOKEN) fail("VERCEL_TOKEN is not set");
if (existsSync(dir)) { spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: repo }); rmSync(dir, { recursive: true, force: true }); }
execFileSync("git", ["worktree", "add", "-q", "--detach", dir, sha], { cwd: repo, stdio: "ignore" });
// Turbopack rejects a node_modules symlink that points outside the project, so hard-link a copy (same filesystem: instant, no extra disk).
const link = spawnSync("cp", ["-al", resolve(nm), join(dir, "node_modules")]);
if (link.status !== 0) { const copy = spawnSync("cp", ["-a", resolve(nm), join(dir, "node_modules")]); if (copy.status !== 0) fail("could not set up node_modules in the worktree"); }
console.log(`deploy: ${sha} checked out at ${dir}`);

const verify = spawnSync("node", ["scripts/verify.mjs", ...(flags.has("--quick") ? ["--quick"] : [])], { cwd: dir, stdio: "inherit" });
if (verify.status !== 0) fail(`verify failed for ${sha}. REFUSING to deploy.`);
if (dry) { console.log(`\ndeploy: dry run OK, ${sha} passes the gate. Nothing was deployed.`); process.exit(0); }

mkdirSync(join(dir, ".vercel"), { recursive: true });
writeFileSync(join(dir, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_cM3koE7T8rr1JnVSgW6MSVV8PX94", orgId: "team_nS1LQFUJNE9aln2WTbUjuJ5v" }));
const home = mkdtempSync(join(tmpdir(), "keplar-vhome-"));
const env = { ...process.env, HOME: home, PATH: `/home/box/.local/bin:${process.env.PATH}`, VERCEL_ORG_ID: "team_nS1LQFUJNE9aln2WTbUjuJ5v", VERCEL_PROJECT_ID: "prj_cM3koE7T8rr1JnVSgW6MSVV8PX94" };
const dep = spawnSync("vercel", ["--prod", "--yes", "--token", process.env.VERCEL_TOKEN], { cwd: dir, env, encoding: "utf8" });
const out = `${dep.stdout}\n${dep.stderr}`.replaceAll(process.env.VERCEL_TOKEN, "***");
console.log(out.split("\n").slice(-12).join("\n"));
rmSync(home, { recursive: true, force: true });
if (dep.status !== 0) fail("vercel deploy failed (production still serves the previous deployment).");

const smoke = spawnSync("node", ["scripts/smoke-prod.mjs", process.env.KEPLAR_SMOKE_BASE || "https://keplar.one"], { cwd: dir, stdio: "inherit" });
if (smoke.status !== 0) fail("POST-DEPLOY SMOKE FAILED. Roll back now: docs/runbooks/rollback.md");
console.log(`\ndeploy: ${sha} is live and passed the post-deploy smoke check.`);
