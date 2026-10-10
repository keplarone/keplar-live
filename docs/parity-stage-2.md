# Parity stage 2: live voice, posts on X, runner polish

Date: 2026-10-06 (ET). Not deployed by this track (owner instruction): the commit rides along with the next HEAD deploy.

## Built
- **Talk live** (real-time, duplex voice). Shown above the composer only when it's switched on and the person is signed in on a paid plan (Free stays on OpenRouter `:free` models).
  - `src/lib/voice/realtime.ts`: provider switch, availability (`signin` / `not_configured` / `plan`), SDP offer validation (audio only, 20 KB cap), session config with Keplar's own instructions ("one model, not the cross-checked panel"), hashed safety id.
  - `src/app/api/voice/realtime/route.ts`: `GET` availability (signed in), `POST` SDP offer → SDP answer. Same origin, personal workspace, 12 calls per hour per account, and the server key never reaches the browser. It forwards to OpenAI's unified `/v1/realtime/calls`.
  - `src/components/app-ui/parity/LiveVoice.tsx`: mic → WebRTC, live transcript from the event channel, 10-minute cap, a clear note that it is one model and not cross-checked, and "Open transcript as a draft" so the panel can check it.
- **Posts on X** provider: `src/lib/providers/x-posts.ts` (X API v2 recent search: authors, links, metrics, reposts excluded) and `POST /api/x/search` (signed in, paid, 30 per hour, 503 `not_configured` without a token). It never fakes posts.
- **Code runner polish**: Pyodide package-loading messages now go to the status line instead of the output, and code drafts get a shorter editor so the output stays visible.
- Camera capture: already available, because the composer's attach picker accepts images and phones offer "take photo".

## Tests
`tests/parity-stage2.test.ts` (4 tests: voice gating, offer and session checks, X not-configured, X mapping/429/errors). Stage 1 tests still pass (13/13 together). A scoped typecheck of every stage 2 file and its imports is clean. The authz, rate-limit and US-English audits show no new failures (the remaining failures belong to other tracks: core/signal, embed/ask, templates like, CHAPTERS.md, critic css, lifecycle-emails).

## Blockers (env vars, owner action)
- `KEPLAR_REALTIME_VOICE=openai` + `OPENAI_API_KEY`: opt-in. Per-minute cost and audio privacy are a founder decision. Per-minute metering isn't built yet (calls are capped at 10 minutes and 12 per hour).
- `X_BEARER_TOKEN`: X API pay-per-use developer account.

## Next (stage 3)
Posts on X inside answers, record mode (transcript → notes), Specialist links, event-triggered automations, location-aware answers (opt-in), one-tap image templates, kids mode, and the remaining buildable gaps from `docs/grok-gap-list.md`.
