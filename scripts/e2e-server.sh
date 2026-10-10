#!/bin/bash
# Local QA server: production build + in-memory Postgres + dev outbox, on $PORT (default 3470).
#   npx next build && scripts/e2e-server.sh &      then:   node scripts/layout-e2e.mjs http://localhost:3470
PORT=${PORT:-3470}
export DATABASE_URL="postgresql://user:secret@ep-e2e-local.us-east-2.aws.neon.tech/neondb?sslmode=require"
export BETTER_AUTH_SECRET="e2e-local-secret-0123456789abcdefghijklmnop"
export BETTER_AUTH_URL="http://localhost:$PORT"
export KEPLAR_DEV_TOOLS=1
export KEPLAR_MX_CHECK=off
export KEPLAR_DATA_DIR=${KEPLAR_DATA_DIR:-/tmp/keplar-e2e-data}
export NODE_OPTIONS="--require $(cd "$(dirname "$0")" && pwd)/fake-neon-preload.cjs"
exec npx next start -p "$PORT"
