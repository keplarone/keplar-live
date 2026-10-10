# Rollback (Vercel)

Fastest (no build): Vercel dashboard -> project `keplar` -> Deployments -> pick the last good *Production* deployment -> **Promote to Production** (or `vercel promote <deployment-url> --token ...`; `vercel rollback` also works). The alias keplar.one moves in seconds.

Database changes are additive (new rows in `keplar_rows`; tables created with IF NOT EXISTS), so code rollback does not need a DB rollback. If a deploy wrote bad data, restore a Neon branch (backup-restore.md) rather than hand-editing.

Git: every checkpoint is a commit on `master` (tag `revamp-cp0` = before the revamp). To redeploy an older commit: `git worktree add --detach /tmp/kp-deploy <sha>`, add `.vercel/project.json`, `vercel --prod --yes`.
Never force-push.
