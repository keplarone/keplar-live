import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error plain ESM script without types
import { checkBuild, formatStamp, parseStamp } from "../scripts/deploy-guard-lib.mjs";

const prod = (extra: Record<string, string> = {}) => ({ VERCEL_ENV: "production", ...extra });

test("deploy guard: stamps round-trip and reject junk", () => {
  assert.deepEqual(parseStamp(formatStamp("abc1234def", 4321)), { sha: "abc1234def", count: 4321 });
  for (const bad of ["", "abc", "abc1234", "zzzzzzz.12", "abc1234.-1", undefined]) assert.equal(parseStamp(bad), null, String(bad));
});

test("deploy guard: a production upload needs a stamp, and an older one than live is refused", () => {
  assert.equal(checkBuild({ VERCEL_ENV: "preview" }, null).ok, true, "previews are never blocked");
  assert.equal(checkBuild({}, null).ok, true, "local builds and the gate are never blocked");
  assert.equal(checkBuild(prod(), null).ok, false, "a plain `vercel --prod` from any checkout is refused");
  const live = { sha: "1111111", count: 5000 };
  assert.equal(checkBuild(prod({ KEPLAR_DEPLOY_STAMP: "2222222.4100" }), live).ok, false, "an old worktree can't replace the live site");
  assert.match(checkBuild(prod({ KEPLAR_DEPLOY_STAMP: "2222222.4100" }), live).reason, /older than the live site/);
  assert.equal(checkBuild(prod({ KEPLAR_DEPLOY_STAMP: "2222222.5000" }), live).ok, true, "level with live is fine (a redeploy)");
  assert.equal(checkBuild(prod({ KEPLAR_DEPLOY_STAMP: "2222222.5003" }), live).ok, true);
  assert.equal(checkBuild(prod({ KEPLAR_DEPLOY_STAMP: "2222222.10" }), null).ok, true, "no live stamp yet: the local origin/main check stands");
  assert.equal(checkBuild(prod({ KEPLAR_DEPLOY_STAMP: "2222222.10", KEPLAR_DEPLOY_ALLOW_OLDER: "1" }), live).ok, true, "deliberate revert");
});

test("deploy guard: Git deployments are allowed from main only", () => {
  assert.equal(checkBuild(prod({ VERCEL_GIT_COMMIT_SHA: "abc", VERCEL_GIT_COMMIT_REF: "main" }), { sha: "x", count: 9e6 }).ok, true);
  assert.equal(checkBuild(prod({ VERCEL_GIT_COMMIT_SHA: "abc", VERCEL_GIT_COMMIT_REF: "feature" }), null).ok, false);
});

test("deploy guard: wired into the build and both deploy commands", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  // The guard runs first (nothing else, e.g. the Wants catalog seed, runs for a refused upload) and next build last.
  assert.match(pkg.scripts.build, /^node scripts\/build-guard\.mjs && (?:[^&]+ && )*next build$/);
  assert.equal(pkg.scripts["deploy:prod"], "node scripts/deploy-prod.mjs");
  assert.ok(readFileSync("scripts/deploy.mjs", "utf8").includes("...stamp.args"), "the gated deploy carries the stamp");
  assert.ok(readFileSync("scripts/deploy-prod.mjs", "utf8").includes("...s.args"), "the fast deploy carries the stamp");
  assert.ok(readFileSync("scripts/deploy-stamp.mjs", "utf8").includes(`"merge-base", "--is-ancestor", "origin/main", ref`));
});
