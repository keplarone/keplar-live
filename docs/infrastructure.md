# Infrastructure and cloud security

What runs where, how it is configured, and which cloud controls apply. The configuration is code (`vercel.json`, `next.config.ts`,
`src/lib/security/headers.ts`, `src/proxy.ts`, `.github/workflows/*`, `scripts/*`), checked by `tests/infra-config.test.ts` in CI.
Last revised Oct 17, 2026.

## Topology

| Component | Provider | Notes |
|---|---|---|
| Web app and API | Vercel (project `keplar`, region iad1, serverless functions + edge proxy) | No servers, no containers, no SSH. Each function invocation is isolated by the platform. |
| Database | Neon Postgres, reached over HTTPS SQL with one connection string | No public listener to firewall: every query carries the credential over TLS. Encryption at rest and point-in-time restore are Neon's. |
| Rate limiter | Postgres (shared) or Upstash Redis when configured; memory at the edge | `src/lib/create/platform/ratelimit.ts` |
| Background jobs | Vercel Cron (`vercel.json`) with `CRON_SECRET`; Inngest with signing keys | Every cron route checks the secret in constant time (tested) |
| Compute for renders and Roblox | Vercel Sandbox microVMs (Blender Cloud) and the official Luau analyzer in-process | Machines are created per job from a fixed script, capped by `KEPLAR_RENDER_*`, torn down after; snapshots deleted on removal |
| Code execution for users | The browser (sandboxed iframe + Web Worker) | Never on Keplar's servers (`src/lib/sandbox/runner.ts`) |
| Email | Resend | Sender domain with SPF/DKIM/DMARC managed in DNS |
| Payments | Whop (plans), Stripe Connect (Business sellers) | Provider-hosted; webhooks signed |
| Media storage | Postgres bytea today; R2 placeholder not wired | Served by unguessable ids through the app with sandbox CSP |
| DNS and TLS | Vercel (apex and subdomains), customers' own DNS for custom domains | Certificates issued and renewed by Vercel; customer domains verified by a TXT record before activation |

## Environments

- **Production**: `main` on keplar.one, business.keplar.one, docs.keplar.one. Environment variables in Vercel "Production" (55 of 70 marked
  Sensitive, i.e. write-only in the dashboard).
- **Preview**: every branch deploy on `*.vercel.app`, `noindex`, its own variable set; the same code, never production data by policy.
- **Development**: local, `KEPLAR_DATA_DIR` file store, dev tools on, no provider keys required (fake model, outbox email).
- The same Vercel project also builds keplar-desktop; production deployments are filtered by repository (`CLAUDE.md`).

## Identity and access (least privilege)

- **Vercel team**: owner account with MFA; tokens are per purpose (`VERCEL_DOMAINS_TOKEN` is used only against the domains API; `VERCEL_TOKEN`
  only by the deploy scripts on the operator's machine). Quarterly review per `docs/security-policy.md` §4.
- **GitHub**: repository owner; branch ruleset on `main`; workflows run with a read-only token and no repository secrets.
- **Neon**: owner account; the app role via `DATABASE_URL`; `BACKUP_DATABASE_URL` for a separate read-only role (accepted risk AR-5 for
  a migration role).
- **Keplar admin**: `KEPLAR_ADMIN_EMAILS` plus optional `KEPLAR_ADMIN_REQUIRE_MFA=1`; admin pages are 404 to everyone else; actions
  are written to the audit log and the security event log.
- **Service-to-service**: Vercel Cron → `CRON_SECRET`; Inngest → signing key; ops checks → `OPS_CHECK_SECRET`; Whop/Stripe/Inngest
  webhooks → signatures.

## Network

- Inbound: only HTTPS through Vercel. HSTS with preload on Keplar's hosts; plain HSTS on customers' hosts. `www` redirects to the apex.
- Host handling: a request whose Host is not Keplar's own is served only as the published site of a verified, active custom domain,
  else 404 (`src/proxy.ts`). No app, admin or API route exists on a foreign host.
- Outbound: provider APIs by fixed hostnames; user-directed fetches (links, product import, MCP servers, connectors) go through the
  SSRF-safe client (`src/lib/mcp/ssrf.ts`: public addresses only, pinned connection, re-validated redirects, size and time caps); the
  browser sandbox allows no network except the pinned Pyodide CDN.
- Cloud metadata endpoints (169.254.169.254, link-local, loopback, private ranges) are refused by the SSRF client (tested).

## Platform protections

- **DDoS**: Vercel's platform mitigation applies to every deployment. On top: edge per-IP limit on `/api`, per-route and per-account
  limits, the spend breaker and kill switches.
- **WAF**: no custom firewall rules on the current plan (accepted risk AR-7). Vercel's Attack Challenge Mode can be switched on from the
  dashboard during an attack (runbook `cost-emergency.md`).
- **Bot protection**: honeypots on public forms, MX checks on sign-up addresses, per-IP and per-network limits, consent-free visit counting.
- **TLS**: Vercel-managed certificates (automatic renewal) for Keplar's domains and verified custom domains; `upgrade-insecure-requests` in CSP.
- **DNS**: records managed in Vercel; SPF, DKIM and DMARC for the sending domain; a CAA record limiting issuers is an owner check in the
  quarterly review.

## Containers, Kubernetes and host hardening

Not applicable: Keplar runs no containers or clusters of its own. Draft previews can run in Vercel Sandbox
(`src/lib/create/platform/config.ts`). Firecracker isolation (the sandbox product's own) is that boundary.

## Logging and audit

- Every `/api` response carries `x-request-id`; server logs are JSON lines with it (`src/lib/ops/log.ts`).
- Security events (`src/lib/security/events.ts`), the admin audit log, billing events and agent audit rows are database rows under the
  system tenant, readable on `/admin`, retained 90 days (events) or longer (billing).
- Vercel keeps runtime logs per its plan; a log drain to long-term storage is configured when the plan allows (owner action; the
  Vercel MCP `create_drain` tool or the dashboard).
- Vercel's team activity log and GitHub's audit log cover deployments, env changes and repository settings.

## Patching and drift

- Dependencies: Dependabot weekly, production audit gate on every build, dependency review on PRs, CodeQL weekly.
- Runtime: Node version pinned in CI; Vercel maintains the function runtime.
- Drift: production serves `/deploy-stamp.json`; the build guard refuses a production build older than what is live or lacking the stamp;
  `tests/infra-config.test.ts` pins the security-relevant configuration; the smoke test checks live headers after each deploy.

## Teardown

To retire an environment or the project: revoke tokens (Vercel, Neon, Whop, Stripe, Resend, OpenRouter), delete Vercel Sandbox snapshots
and machines, export and delete the Neon branch or project, remove DNS records and custom domains, delete the Vercel project, archive the
repository. Customer notice first where data is involved (privacy policy terms).
