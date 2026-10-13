/**
 * Deploy guard (pure logic, unit-tested in tests/deploy-guard.test.ts).
 *
 * Several sessions deploy keplar.one from their own checkouts, and whichever production build finishes last is what the site
 * serves. A deploy from an old worktree once put a months-old Keplar Business back live. The guard makes that impossible:
 *   - a CLI production deploy carries a stamp, KEPLAR_DEPLOY_STAMP="<sha>.<commit count>", written only after the local tree
 *     was checked to contain origin/main with nothing uncommitted (scripts/deploy-prod.mjs, scripts/deploy.mjs);
 *   - the production build (scripts/build-guard.mjs) refuses a missing stamp, and a stamp whose commit count is below the one
 *     the live site reports at /deploy-stamp.json;
 *   - a Git deployment of `main` (Vercel builds it from GitHub) needs no stamp: it is GitHub's main by definition.
 */

/** "abc1234.5678" -> { sha, count } or null. */
export function parseStamp(raw) {
  const m = /^([0-9a-f]{7,40})\.(\d{1,7})$/.exec(String(raw ?? "").trim());
  return m ? { sha: m[1], count: Number(m[2]) } : null;
}

export const formatStamp = (sha, count) => `${sha}.${count}`;

/**
 * Decide whether a build may go to production.
 * env: the build's environment. live: the live site's stamp ({ sha, count }) or null when it could not be read.
 * Returns { ok, reason, stamp }.
 */
export function checkBuild(env, live) {
  if (env.VERCEL_ENV !== "production") return { ok: true, reason: "not a production build", stamp: null };
  if (env.KEPLAR_DEPLOY_ALLOW_OLDER === "1") return { ok: true, reason: "override: KEPLAR_DEPLOY_ALLOW_OLDER=1", stamp: parseStamp(env.KEPLAR_DEPLOY_STAMP) };
  if (env.VERCEL_GIT_COMMIT_SHA) {
    if (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== "main") return { ok: false, reason: `a Git production build of "${env.VERCEL_GIT_COMMIT_REF}"; production builds only from main`, stamp: null };
    return { ok: true, reason: "Git deployment of main", stamp: null };
  }
  const stamp = parseStamp(env.KEPLAR_DEPLOY_STAMP);
  if (!stamp) return { ok: false, reason: "no deploy stamp: this upload was not checked against origin/main", stamp: null };
  if (live && live.count > stamp.count) return { ok: false, reason: `this upload (${stamp.sha}, ${stamp.count} commits) is older than the live site (${live.sha}, ${live.count} commits)`, stamp };
  return { ok: true, reason: live ? `newer than or level with the live site (${live.count} commits)` : "live stamp unavailable; local origin/main check passed", stamp };
}

export const HOW_TO_DEPLOY = [
  "Deploy keplar.one with:  npm run deploy:prod   (fast: checks you contain origin/main, then deploys)",
  "                    or:  npm run deploy        (the full gate, then deploys)",
  "Both fetch origin/main first; commit or drop local changes and `git pull --rebase` if they refuse.",
  "Deliberately shipping older code (an emergency revert)? Prefer `vercel promote <deployment>` (no build), or add",
  "--build-env KEPLAR_DEPLOY_ALLOW_OLDER=1 to the deploy command.",
].join("\n");
