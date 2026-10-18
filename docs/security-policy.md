# Security policy, lifecycle and governance

The operating rules behind the controls in `docs/security-checklist.md`. Owner: team@keplar.one. Last revised Oct 17, 2026.

## 1. Secure development lifecycle

1. **Requirements first.** A change that adds a route, a stored field, an integration, an agent tool or a payment path starts with the
   security questions in `.github/pull_request_template.md` (authorization, input, data classification, dependencies, agent gates).
   For a new surface, `docs/threat-model.md` gets a row before the code is written.
2. **Architecture review.** Anything that crosses a trust boundary in the threat model (new provider, new way to act on the world,
   new tenant boundary) is written up in `docs/` first; the PR links the doc.
3. **Secure coding standards** (enforced by tests where a test can): parameterized SQL only (`neonQuery`), every store call carries a
   workspace id, every route refuses anonymous callers unless listed in `tests/authz.test.ts`, every state-changing route has a limiter
   (`tests/rate-limit-audit.test.ts`), no `console.*` of secrets (`tests/secrets-audit.test.ts`), outbound fetches to user-chosen hosts
   go through `src/lib/mcp/ssrf.ts`, untrusted text reaches a model only inside a fence, generated HTML passes the sanitizer and the
   output checklist, no `dangerouslySetInnerHTML` except for constants (JSON-LD, the theme script).
4. **Review.** Pull requests only; direct pushes to `main` are blocked by the branch ruleset. Paths in `.github/CODEOWNERS` are the
   sensitive ones: today one maintainer owns them, so the review is the author's own checklist plus CI; the moment a second maintainer
   exists, the ruleset gains "require code-owner review" for those paths (a one-line change in the GitHub ruleset).
5. **Gates** (all must pass, in CI and in `npm run verify`): secret scan, production dependency audit (high/critical), lockfile integrity,
   checklist evidence, infrastructure config tests, typecheck, lint, unit tests (authorization matrix, tenant isolation, rate-limit audit,
   fuzzing of parsers), production build, secret scan of the build output, SBOM. CodeQL and dependency review run alongside.
6. **Release.** Vercel deploys `main`; the build guard refuses unstamped or stale production builds; `scripts/smoke-prod.mjs` checks
   headers and key routes after deploy; `docs/runbooks/rollback.md` is the way back.
7. **Security regression tests.** Every fixed finding gets a test next to the fix (the findings register in `docs/security-progress.md`
   lists them). The checklist test fails the build if an evidence file disappears.

## 2. Severity levels and response targets

| Level | Meaning | Examples | First response | Fix target |
|---|---|---|---|---|
| **S1 Critical** | Active exploitation, data of more than one user exposed, money being lost, or a way for anyone to run code or read the database | Leaked `DATABASE_URL`; cross-tenant read in a core route; forged webhook grants plans | Within 1 hour, any day. Containment first (`/admin` Global stop, rotate the key) | 24 hours (hot fix), 7 days for the complete fix |
| **S2 High** | Exploitable by a motivated attacker but needs a precondition, or affects one account at a time | Authorization gap in a secondary route; CSRF on a state change; SSRF to internal addresses | Same business day | 30 days |
| **S3 Medium** | Defense-in-depth gap, information leak without direct impact, hardening | Missing header on one path; verbose error; weak default | Within a week | 90 days |
| **S4 Low** | Best practice, cosmetic, or theoretical | Older TLS cipher in a non-user path; wording | Next planning | Next planned release |

External reports (`SECURITY.md`) are acknowledged within 3 business days and assessed within 7. The person who found it is told when
it is fixed. These are commitments of a small team, not an SLA with penalties.

## 3. Accepted risks register

A risk is accepted only with an owner, a reason, a compensating control and a review date. Reviewed every quarter; an entry past its
review date fails the quarterly check.

| Id | Risk | Why accepted | Compensating control | Review |
|---|---|---|---|---|
| AR-1 | CSP allows `'unsafe-inline'` for scripts | Next.js App Router pages carry per-render inline flight data; nonces force dynamic rendering of every marketing page | No remote script hosts except the four exact vendor origins; no `eval`; `firstPartyLoadOfUserCode` blocks user files from loading as first-party scripts | Jan 2027 (re-check Next.js nonce support for static pages) |
| AR-2 | Trusted Types not enforced | three.js, CodeMirror and KaTeX write to DOM sinks internally; enforcing would need default policies that just allow them | React escaping, sanitizer for user HTML, `safeHref`, the checklist's `no-unsafe-innerhtml` rule for generated apps | Apr 2027 |
| AR-3 | No Subresource Integrity on vendor scripts | Whop checkout, Whop Pixel and Stripe.js are served versionless by the vendors, which forbids SRI by design | Exact origins in CSP, loaded only on the pages that need them; own scripts are content-hashed chunks | Apr 2027 |
| AR-4 | Dev-only advisory `braces` (ESLint globbing) | No patched version; dev tooling never ships | Production audit is clean; tracked in `docs/security.md` | Each Dependabot run |
| AR-5 | No dedicated migration or admin database role | The app creates its own tables with `CREATE TABLE IF NOT EXISTS` at first use; one Neon role today | Backups use a separate read-only role; schema changes are additive and reviewed in PRs | Jan 2027 (split roles when a migration tool is introduced) |
| AR-6 | Keys derived in-process from `BETTER_AUTH_SECRET` (HKDF) rather than a KMS | Vercel's encrypted env is the only secret store available on the current plan; a KMS adds a network hop to every sign-in | Secret marked Sensitive in Vercel (write-only), rotation runbook, security events on secret access | Jul 2027 |
| AR-7 | No custom WAF rules / attack challenge mode off | Vercel's platform DDoS mitigation is on for every project; custom rules are not available on the current plan | Edge rate limits per IP, per-route limits, spend breaker, kill switches | On plan change |
| AR-8 | Long-lived platform credentials (Vercel token, Neon URL, provider keys) instead of workload identity | The providers used do not offer OIDC federation for a Vercel function | Least scope per credential, separate per environment, rotation calendar, secret scanning | Jul 2027 |
| AR-9 | Business plan spend caps are tier-wide, not per contract | No enterprise contracts yet | $150/day cap on every Business workspace, monthly budget per tier | First enterprise contract |
| AR-10 | Browser extension stores an API key in `chrome.storage.local` | An extension cannot use HttpOnly cookies; a session cookie would expose the whole account | Key scoped to `ask`, revocable, plan-limited, shown nowhere else | Apr 2027 |
| AR-11 | Unsigned desktop installers | Code-signing certificates are an owner purchase | SHA-256 checksums on `/download`, release from tags only | When certificates are bought |

## 4. Periodic reviews (the calendar)

| Cadence | Review | Evidence kept |
|---|---|---|
| Every PR | Gates in §1 | CI run, SBOM artifact (90 days) |
| Weekly | Dependabot PRs (npm, GitHub Actions) merged or declined with a reason | PR history |
| Monthly | `npm audit` on the full tree; third-party script inventory (§6) unchanged; Vercel/Neon/Whop/Stripe status pages for incidents | A line in `docs/security-progress.md` |
| Quarterly | Permission review (GitHub collaborators, Vercel team, `KEPLAR_ADMIN_EMAILS`, OAuth app scopes, API keys); secrets review (list every env var, rotate any older than 12 months, delete unused); accepted-risk register; backup restore drill into a scratch Neon branch; incident tabletop exercise (one scenario from the runbook); threat model walk-through | Dated entries in `docs/security-progress.md` and the runbook's "last drill" line |
| Yearly | Privacy policy and `docs/privacy-inventory.md` against the code; DPA list; penetration test or independent review of the highest-risk release (owner purchase); business continuity test | Report filed in `docs/audit/` |

## 5. Key and credential management

- **Where secrets live**: Vercel project environment variables, marked Sensitive (write-only) for every credential; Production, Preview
  and Development are separate sets. Nothing in the repository, CI or build output (scanned). Local development uses the file store
  and dev tools; production data is never copied to a laptop.
- **One credential per integration and per environment**: provider keys, webhook secrets, OAuth client secrets, the domains token.
- **Rotation**: provider and webhook secrets yearly or on suspicion; `BETTER_AUTH_SECRET` only on compromise (it signs every session,
  plan cookie and sealed token: rotating it signs everyone out and needs connector re-authorization; the runbook has the order).
- **Revocation**: `docs/runbooks/security-incident.md` §Revoke; API keys and sessions are revocable per user; connector tokens are
  deleted on disconnect; security events record unseals.

## 6. Third-party script inventory (browser)

| Script | Where it loads | Why | Control |
|---|---|---|---|
| Whop Elements (`cdn.whop.com`) | Checkout pages | Embedded checkout | Exact origin in CSP; only pages that sell |
| Whop Pixel (`t.whop.tw`) | Checkout and account pages only (`/checkout`, `/account`, `/biz/account`) | Ad measurement | Not on `/`, marketing pages, the app, or sign-in; disclosed in the privacy policy; auto-capture of form fields off |
| Stripe.js (`js.stripe.com`, `connect-js`, `hooks`) | `/app/*` and Business pages | Bank linking, seller payouts | Exact origins; `/app` CSP variant only |
| Google Fonts CSS and files | `/app/*` typography previews, generated apps that choose a Google face | Font previews | Style and font sources only, never script |
| Vercel Web Analytics and Speed Insights | Public pages after consent | Page performance | Consent-gated, cookie-free |
| Pyodide (`cdn.jsdelivr.net/pyodide/v0.27.7`) | The code-runner iframe only | Python in the browser | Pinned version, loaded inside a sandboxed frame whose CSP allows no other network |

Adding a script means adding a row here and a CSP source in `src/lib/security/headers.ts` (the PR template asks).

## 7. Source maps, errors and debug surfaces

- Browser source maps are never published (`productionBrowserSourceMaps: false`). Server-side maps stay inside the deployment bundle.
- Errors shown to users carry a reference id, never a stack; the admin error page shows scrubbed messages.
- Dev tools (`KEPLAR_DEV_TOOLS`) are off in production; the health endpoint reports booleans only.

## 8. API versioning and deprecation

Public API routes live under `/api/v1`. A breaking change ships as `/api/v2` and the previous version keeps working for at least 6 months
with `Deprecation` and `Sunset` headers and a note on `/developers`. Internal `/api` routes are not versioned and may change with the app.

## 9. Data classification (summary; the inventory is `docs/privacy-inventory.md`)

- **Restricted**: passwords (hashed), second-factor secrets, recovery codes, connector tokens and API keys (sealed or hashed), bank
  tokens. Never logged, never exported in clear, encrypted or hashed at rest by Keplar.
- **Confidential**: chats, memory, documents, generated content, CRM rows, leads, billing status. Tenant-scoped, exported and deleted
  with the account, database encryption at rest by the host.
- **Internal**: operational telemetry (model calls, spend, hashed IPs, security events). Retained by the schedules in the inventory.
- **Public**: published sites and apps, marketing content.

## 10. Business continuity and disaster recovery

- Single-region serverless on Vercel with Neon Postgres: recovery means redeploying `main` (minutes) and restoring Neon to a point in
  time (`docs/runbooks/backup-restore.md`). Recovery time objective 4 hours; recovery point objective the Neon PITR granularity
  (minutes), or the last scripted export if Neon itself is lost.
- Payments and email are provider-hosted and continue independently; webhooks are retried by the providers for days.
- The quarterly restore drill and a yearly end-to-end recovery rehearsal (fresh Vercel project from the repository, restore into a
  fresh Neon project, point DNS) are the continuity tests. Dates are recorded in the backup runbook.

## 11. Evidence

Evidence for every control is a file in this repository (code, test or document), a CI artifact, or a named setting, listed per item in
`security/checklist.json`. CI artifacts are kept 90 days; the register and the findings log live in git history indefinitely.
