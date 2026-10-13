# Deploying Keplar

One command is the only supported way to ship: it refuses to deploy anything that does not pass the gate.

```
node scripts/deploy.mjs [gitRef=HEAD] [--dry-run]     # or: npm run deploy -- <ref>
```

What it does, in order:
1. Checks `<gitRef>` out into a throwaway git worktree under `/tmp` (uncommitted files in your working tree are never deployed).
2. Runs `npm run verify` there: **typecheck → lint (errors fail) → unit tests → `next build` → Playwright smoke test** (`e2e/smoke.e2e.ts`). First failure stops everything: **exit 1, nothing is deployed.**
3. `vercel --prod --yes` with a fresh `HOME`, `.vercel/project.json` for the Keplar project, and `VERCEL_TOKEN` from the environment (never printed).
4. Post-deploy smoke (`scripts/smoke-prod.mjs`, read-only GETs): key pages load, `/api/health` is `ok`, `/admin` is hidden when signed out, security headers present. If it fails, roll back ([runbooks/rollback.md](runbooks/rollback.md)).

Deploy guard: every production build runs `scripts/build-guard.mjs` first. A CLI upload must carry `KEPLAR_DEPLOY_STAMP` (added by `npm run deploy` and `npm run deploy:prod` after checking the tree contains origin/main) and must not be older than the live site's `/deploy-stamp.json`; otherwise the build fails and production keeps the current deployment.

Useful variants
- `npm run deploy:prod`: no gate; checks origin/main, uncommitted and unpushed changes, then deploys with the stamp.
- `--dry-run`: steps 1–2 only (a full gate run, no deploy).
- `--quick`: gate without build and browser smoke. Only for docs-only changes.
- `npm run verify` / `npm run verify:quick`: run the gate in the current tree. Logs go to `/tmp/keplar-verify/`.
- `npm run smoke:prod -- https://example.vercel.app`: smoke-check any deployment.
- `KEPLAR_NODE_MODULES=/path/to/node_modules` when the checkout has no `node_modules` of its own (it is hard-linked into the worktree; Turbopack rejects symlinks that leave the project).

Routes checked by both smoke tests live in `scripts/smoke-routes.json`; add a route there when you add a key page.

Limits (honest): the gate runs with no database and a fake model, so it proves the app builds and its key routes render, not that live model/Whop/Stripe/Neon calls work. Those are checked by `/api/health` and `/status` after deploy. Lint warnings are listed but do not fail the gate; three files carry a documented `react-hooks/set-state-in-effect` warning (WebGL capability detection) in `eslint.config.mjs`.
