# Failed or bad deploy

1. Build failed: production keeps serving the previous deployment (nothing to do but fix). Reproduce locally in a clean copy: `npm ci && npx tsc --noEmit && npm run lint && npm test && npx next build`.
2. Bad deploy live (errors, blank page, wrong behaviour): **roll back first**, debug after: see [rollback.md](rollback.md).
3. Verify: `https://keplar.one` loads, `/api/health` is `{"ok":true,"store":"postgres","durable":true}`, `/admin` still 404s when signed out, send "hi" in /app.
4. Record the bad deployment id and cause in `docs/revamp/CHECKPOINTS.md`; the fix must come with a test.
