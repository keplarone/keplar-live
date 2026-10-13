#!/usr/bin/env node
/**
 * Fast production deploy (npm run deploy:prod): checks this checkout contains origin/main, has nothing uncommitted and nothing
 * unpushed (what goes live must be on GitHub), then runs `vercel --prod --yes` with the deploy stamp the production build requires.
 * Use `npm run deploy` for the full gate (typecheck, lint, tests, build, browser smoke) before deploying.
 */
import { execFileSync } from "node:child_process";
import { makeStamp } from "./deploy-stamp.mjs";
import { run } from "./spawn.mjs";

const cwd = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
let s;
try {
  s = makeStamp(cwd, "HEAD");
} catch (e) {
  console.error(`\ndeploy:prod: ${e.message}`);
  process.exit(1);
}
const pushed = run("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { cwd });
if (pushed.status !== 0) { console.error("\ndeploy:prod: HEAD has commits that are not on origin/main. Push them to main first (git push origin HEAD:main), so the next deploy keeps them."); process.exit(1); }
console.log(`deploy:prod: ${s.sha} (${s.count} commits) contains origin/main; deploying.`);
const dep = run("npx", ["vercel", "--prod", "--yes", ...s.args, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(dep.status ?? 1);
