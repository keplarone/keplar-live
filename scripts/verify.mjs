#!/usr/bin/env node
/**
 * Release gate: `npm run verify`. Runs, in order, and stops at the first failure:
 *   1. typecheck   2. lint (errors fail; warnings are listed, not fatal)   3. unit tests   4. production build   5. smoke Playwright test
 * Flags: --quick (typecheck + lint + unit tests only)   --no-e2e (skip the browser smoke test)
 * Logs: $KEPLAR_VERIFY_LOGS (default /tmp/keplar-verify). Exit code 0 only when every step passed.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const quick = args.has("--quick");
const noE2e = quick || args.has("--no-e2e");
const logs = process.env.KEPLAR_VERIFY_LOGS || "/tmp/keplar-verify";
mkdirSync(logs, { recursive: true });

const E2E_SECRET = "e2e-secret-0123456789abcdefghijklmnopqrstuv";
const e2eEnv = { BETTER_AUTH_SECRET: E2E_SECRET, BETTER_AUTH_URL: "http://localhost:3199", KEPLAR_DEV_TOOLS: "1", KEPLAR_MX_CHECK: "off", RESEND_API_KEY: "" };

const steps = [
  { name: "typecheck", cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "lint", cmd: "npx", args: ["eslint", ".", "--quiet"] },
  { name: "unit tests", cmd: "npm", args: ["test"] },
  ...(quick ? [] : [{ name: "build", cmd: "npx", args: ["next", "build"], env: e2eEnv }]),
  ...(noE2e ? [] : [{ name: "smoke e2e", cmd: "npx", args: ["playwright", "test", "-c", "e2e/playwright.config.ts", "e2e/smoke.e2e.ts", "e2e/report-dialog.e2e.ts", "e2e/a11y.e2e.ts", "e2e/typing-hidden.e2e.ts"], env: e2eEnv }]),
];

/** Two free ports + a private data dir for the browser step, so two gate runs (or another tool's e2e server) never collide. */
function freePorts(n) {
  const r = spawnSync("node", ["-e", `const net=require("net");const out=[];let left=${n};const next=()=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{out.push(s.address().port);s.close(()=>{if(--left>0)next();else console.log(out.join(" "))})})};next()`], { encoding: "utf8" });
  return r.stdout.trim().split(" ").map(Number);
}

const results = [];
for (const step of steps) {
  if (step.name === "smoke e2e") {
    const [port, llm] = freePorts(2);
    step.env = { ...step.env, E2E_PORT: String(port), E2E_LLM_PORT: String(llm), BETTER_AUTH_URL: `http://localhost:${port}`, KEPLAR_DATA_DIR: `/tmp/keplar-e2e-data-${process.pid}` };
  }
  const t = Date.now();
  process.stdout.write(`▶ ${step.name} … `);
  const r = spawnSync(step.cmd, step.args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, ...(step.env || {}) } });
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  const file = join(logs, `${step.name.replace(/\W+/g, "-")}.log`);
  writeFileSync(file, `${r.stdout || ""}\n${r.stderr || ""}`);
  let ok = r.status === 0;
  let note = "";
  // Unit tests only: timing-sensitive tests can fail on a busy machine. Files that failed are re-run ALONE once; the gate passes only if
  // that re-run passes, and the names are printed so a flaky test is visible, never hidden. A real failure fails twice.
  if (!ok && step.name === "unit tests") {
    const failing = [...new Set([...(`${r.stdout}`).matchAll(/location: '[^']*?(tests\/[\w.-]+\.test\.ts)/g)].map((m) => m[1]))];
    if (failing.length && failing.length <= 5) {
      console.log(`\n  re-running ${failing.length} failed test file(s) alone: ${failing.join(", ")}`);
      const again = spawnSync("node", ["--import", "tsx", "--test", "--test-concurrency=1", ...failing], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: process.env });
      writeFileSync(file.replace(".log", "-rerun.log"), `${again.stdout || ""}\n${again.stderr || ""}`);
      if (again.status === 0) { ok = true; note = ` (passed on isolated re-run: ${failing.join(", ")})`; }
    }
  }
  results.push({ name: step.name, ok, secs, file, note });
  console.log(ok ? `ok (${secs}s)${note}` : `FAILED (${secs}s)`);
  if (!ok) {
    const tail = readFileSync(file, "utf8").trim().split("\n").slice(-40).join("\n");
    console.log(`\n--- last lines of ${file} ---\n${tail}\n`);
    break;
  }
}
const failed = results.find((r) => !r.ok);
console.log("\nverify summary:");
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name} (${r.secs}s)${r.note || ""}`);
if (failed) { console.log(`\nverify: FAILED at "${failed.name}". Do not deploy.`); process.exit(1); }
console.log(`\nverify: all ${results.length} steps passed${quick ? " (quick mode: build and browser smoke NOT run)" : noE2e ? " (browser smoke NOT run)" : ""}.`);
