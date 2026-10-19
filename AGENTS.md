# keplar.one

## Deploying

The owner wants every update live. Once a change to the site is merged to `main`, deploy it to production without asking for permission.

keplar.one is the Vercel project `keplar` (`prj_cM3koE7T8rr1JnVSgW6MSVV8PX94`, team `team_nS1LQFUJNE9aln2WTbUjuJ5v`). The same project also builds keplar-desktop, so filter its deployments by repository `keplar-live`.

1. Merge to `main`. Vercel normally starts a production deployment of `main` by itself.
2. If none has started for your merge commit after a few minutes, create one from Git: a production deployment of `keplarone/keplar-live`, ref `main`, at the merge commit.
3. Several sessions deploy to this project, and builds run one at a time. Whichever deployment finishes last is the one keplar.one serves. Before you start a deployment, look for production deployments that are still building or queued. Queue yours after them rather than racing them.
4. When the deployment is `READY`, check what keplar.one actually serves: the live production deployment's commit must contain your change (`git merge-base --is-ancestor <your commit> <live commit>`). If a later deployment replaced yours without it, deploy `main` again.

**From a local checkout, deploy only with `npm run deploy:prod` (fast) or `npm run deploy` (full gate). Never run a bare `vercel --prod`.** A deploy from an old worktree once put a months-old Keplar Business back live. Production builds now refuse an upload that lacks the deploy stamp or is older than the live site (`scripts/build-guard.mjs`); the two commands check that your tree contains origin/main and has nothing uncommitted or unpushed, then add the stamp. `https://keplar.one/deploy-stamp.json` shows what is live. To ship older code on purpose, prefer `vercel promote <deployment>` (no build).

Ask first only when deploying now is not recommended, and say why. For example:

- tests or the build fail on `main`;
- another session is part-way through a change that `main` would ship half-done;
- the change does not alter the site at all (docs, CI or tests only), so there is nothing to deploy.

Never commit `node_modules/`, `.next/` or `*.tsbuildinfo`.

## Design

Always use the `apple-design` skill (Apple Human Interface Guidelines reviewer, installed at `~/.Codex/skills/apple-design`) for any UI, UX, layout, styling, component, copy, icon, or onboarding work in this project, whether building or reviewing. Follow its process: load the always-load HIG references plus those for what's on screen, cite guidelines as `file.md › Heading`, and work through its five lenses. For new UI, use its design improvement mode. This is a permanent preference from the owner, so apply it without being asked.
