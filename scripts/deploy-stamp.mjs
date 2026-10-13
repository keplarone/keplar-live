/**
 * Makes the deploy stamp the production build requires (scripts/deploy-guard-lib.mjs): fetches origin/main, then refuses unless
 * `ref` contains it and (for a working tree) nothing tracked is uncommitted. Returns the vercel args that carry the stamp.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { formatStamp } from "./deploy-guard-lib.mjs";

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export function makeStamp(cwd, ref = "HEAD", { checkClean = true } = {}) {
  const fetched = spawnSync("git", ["fetch", "-q", "origin", "main"], { cwd, encoding: "utf8" });
  if (fetched.status !== 0) throw new Error(`could not fetch origin/main (${(fetched.stderr || "").trim() || "network"}); not deploying blind`);
  const contains = spawnSync("git", ["merge-base", "--is-ancestor", "origin/main", ref], { cwd });
  if (contains.status !== 0) {
    const behind = git(cwd, ["rev-list", "--count", `${ref}..origin/main`]);
    throw new Error(`${ref} is missing ${behind} commit(s) from origin/main. Run \`git pull --rebase\` (or rebase onto origin/main) and deploy again`);
  }
  if (checkClean && git(cwd, ["status", "--porcelain", "--untracked-files=no"])) {
    throw new Error("the working tree has uncommitted changes; commit and push them first (what is live must be on GitHub)");
  }
  const sha = git(cwd, ["rev-parse", "--short=12", ref]);
  const count = Number(git(cwd, ["rev-list", "--count", ref]));
  const stamp = formatStamp(sha, count);
  return { sha, count, stamp, args: ["--build-env", `KEPLAR_DEPLOY_STAMP=${stamp}`] };
}
