# Cloud architecture (production)

Keplar runs as **fully cloud-hosted multi-tenant SaaS**: users never install anything, and agents and
long media jobs run server-side 24/7. Each provider sits behind an interface and says "not set up yet" until its keys exist
(`.data/` JSON files, in-process timers) — `.data/` is **never** a production store.

## 1. Stack

| Layer | Pick | Cost (checked Sep 2026; estimates) |
|---|---|---|
| App + API | **Vercel** (Next.js 16, Fluid compute, Node runtime for API routes) | Pro $20/seat/month + usage |
| User sites | Vercel for Platforms: second project serving `*.keplar.site` + custom domains | Included; no per-domain fee; SSL automatic |
| Database | **Neon Postgres** with **row-level security on `workspace_id`** | Launch $0.106/CU-hour, Scale $0.222/CU-hour, storage $0.35/GB-month, scales to zero |
| Object storage | **Cloudflare R2** (drafts, deploy artifacts, media) | $0.015/GB-month, Class A $4.50/M, Class B $0.36/M, **zero egress** |
| Durable jobs / cron | **Inngest** (agent runs, schedules, video polling, retries, per-workspace concurrency keys) | Free to 50k executions; Pro $99/month for 1M executions + 100 concurrency; $50 per extra 1M |
| Preview sandboxes | **Vercel Sandbox** | $0.128/active vCPU-hour + $0.0212/GB-hour |
| Models (answers, codegen, agents, media) | **OpenRouter** | Pass-through model prices; `usage.cost` feeds Usage |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) or Vercel WAF rules | Pay-as-you-go (confirm current per-command price) |
| Secrets / tokens | **KMS envelope encryption** (AWS KMS or GCP KMS): per-workspace data key encrypts OAuth tokens (AES-256-GCM), KMS wraps the data key | ~$1/key/month + per-request fees (confirm) |
| Observability | Sentry (errors, traces) + OpenTelemetry → Axiom or Grafana Cloud (logs, agent/run metrics) | Free tiers to start; Sentry Team ≈ $26/month (confirm) |
| Payments | Stripe Connect (Accounts v2, direct charges) | Stripe fees paid by connected accounts; no Connect platform fee with Stripe-collected fees |
| Moderation / scanning | OpenAI omni-moderation (free); Google Web Risk | Web Risk free tier then per-lookup (confirm) |

## 2. Tenancy and data

- Every table has `workspace_id`; RLS policies use `current_setting('app.workspace_id')`, set per request
  from the authenticated session (`src/lib/create/platform/workspace.ts` is the single entry point).
- The repository interface (`Collection<T>` in `store.ts`) is what the Postgres implementation must satisfy;
  switching is config (`KEPLAR_STORE=postgres`, `DATABASE_URL`). `findSystem` (cross-tenant) is used only
  for host routing and webhooks and runs under a separate role that bypasses RLS read-only.
- Blob keys are prefixed by workspace (`media/<ws>/…`, `drafts/<project>/…`, `deploys/<project>/<deploy>/`).
- Usage ledger rows are append-only; monthly usage is a sum over the ledger.

## 3. Request paths

- **keplar.one**: marketing, `/app`, APIs. Session cookies scoped to `keplar.one` only.
- **keplar.site** (separate registrable domain, Vercel nameservers for the wildcard, on the Public Suffix
  List): `<slug>.keplar.site` and custom domains. Middleware resolves host → project → live deploy → R2
  object, with strict CSP. User code never runs on `keplar.one`.

## 4. Background work

Inngest functions: `media.run` (video polling or webhook), `agent.run` (event + cron), `domain.check`
(poll Vercel verification with backoff, respecting 50 verifications/hour), `site.scan` (re-scan live sites
daily against Web Risk). Concurrency keys per workspace stop one tenant starving others; every function
checks the kill switch and caps at the start of each step.

Wired today (`src/lib/inngest/`, served at `/api/inngest`): `business-agent-schedule-tick` (cron every 5 min
→ one `keplar/agent.scheduled` event per due agent slot), `business-agent-scheduled-run` (retries 3,
idempotency `agentId@slot`, concurrency 2 per workspace) and `business-agent-event-run` (`agent.run` from
`platform/queue.ts`). Live when `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` are set; `INNGEST_DEV=1` targets
the local Dev Server; otherwise the same scheduler runs in-process. Details: `docs/business-os.md` §7.
`media.run`, `domain.check` and `site.scan` are still in-process placeholders.

## 5. Env vars

Platform: `DATABASE_URL`, `KEPLAR_STORE=postgres`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (`INNGEST_DEV=1` local only), `VERCEL_TEAM_ID`, `VERCEL_SANDBOX_TOKEN`,
`VERCEL_PLATFORM_TOKEN`, `VERCEL_PLATFORM_PROJECT_ID`, `KEPLAR_USER_CONTENT_DOMAIN`, `KEPLAR_TOKEN_ENC_KEY`
(→ KMS key ARN in production), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`,
`OTEL_EXPORTER_OTLP_ENDPOINT`, `KEPLAR_ADMIN_TOKEN`.
Models/safety: `OPENROUTER_API_KEY`, `KEPLAR_CODEGEN_MODEL`, `KEPLAR_AGENT_MODEL`, `OPENAI_MODERATION_API_KEY`,
`GOOGLE_WEB_RISK_API_KEY`. Business: see `docs/business-os.md` §6.

## 6. Accounts 8club must create

Vercel team (Pro) with two projects (app, user sites); the `keplar.site` domain on Vercel nameservers;
Neon project (Launch to start); Cloudflare account with an R2 bucket; Inngest app; OpenRouter account with
credit; AWS or GCP account for KMS; Upstash; Sentry; OpenAI (moderation); Google Cloud (Web Risk, OAuth);
Stripe platform account with Connect; Slack app; Microsoft Entra app; Postiz instance.

## 7. Rough monthly floor before traffic

Vercel Pro (1–2 seats) $20–40 + Neon Launch (scale-to-zero, light use) ~$5–20 + R2 (<10 GB) <$1 +
Inngest free + Sentry/Axiom free tiers ≈ **$30–60/month**, plus model spend (metered into Usage).
Inngest Pro ($99) becomes necessary above ~50k executions/month, i.e. once agents run on schedules for
more than a few hundred workspaces.
