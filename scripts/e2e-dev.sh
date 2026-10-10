#!/bin/bash
# Local dev server for browser tests of Create against the fake LLM (scripts/fake-llm.mjs). Never :3000.
PORT=${PORT:-3481}
export DATABASE_URL="postgresql://user:secret@ep-e2e-local.us-east-2.aws.neon.tech/neondb?sslmode=require"
export BETTER_AUTH_SECRET="e2e-local-secret-0123456789abcdefghijklmnop"
export BETTER_AUTH_URL="http://localhost:$PORT"
export KEPLAR_DEV_TOOLS=1 KEPLAR_MX_CHECK=off RESEND_API_KEY=
export OPENROUTER_API_KEY=test-key KEPLAR_OPENROUTER_BASE=http://127.0.0.1:${LLM_PORT:-4799}/v1
export KEPLAR_DATA_DIR=${KEPLAR_DATA_DIR:-/tmp/keplar-ws-data}
export NODE_OPTIONS="--require $(cd "$(dirname "$0")" && pwd)/fake-neon-preload.cjs"
exec npx next ${MODE:-dev} -p "$PORT"
