# Known gaps: what code cannot fix

Written Oct 4, 2026. Everything below needs a person, an account, a payment, a lawyer or real hardware. Nothing here is hidden in the product; where the site makes a related promise, the wording is already conservative. Items marked **(code)** are things the code could still do and are listed in `docs/security-progress.md`.

## Legal and business (founder)
- **Legal entity, registered address, governing jurisdiction.** The Terms and Privacy Policy carry placeholders or "unconfirmed" markers (`site.legalEntity`, `docs/legal-open-decisions.md`). Choose and register the entity, then fill them in.
- **Lawyer review** of the Terms, Privacy Policy and any contract wording before relying on them. Nothing in the repo is legal advice.
- **Minors.** Terms say 13+, and under 18 only with a parent or guardian. Contracts, payments and consent by minors depend on local law: ask a lawyer, and decide whether to block under-18 purchases or add guardian consent. The safety screen and teen-appropriate defaults reduce risk; they do not make the product child-directed or COPPA/GDPR-K compliant.
- **No certifications claimed.** No SOC 2, ISO 27001, HIPAA, PCI attestation, penetration test or external audit exists. The site says so on `/security`.

## Payments
- **Stripe live activation:** account verification, business details, bank account, live keys and a real $1 test charge and refund. Test-mode behavior is covered by tests only.
- **Whop live test:** one real checkout, webhook delivery and plan change, one cancellation and one refund, in production, before announcing paid plans.
- Tax registration/collection, refunds policy owner, chargeback handling.

## Reliability
- **Backups are unverified in production.** `scripts/backup-db.mjs` is tested only against a fake database. Someone must run it against the real Neon database with credentials, store the output off-site, and do a **restore test** into a separate branch. Find out the Neon plan's point-in-time-restore window (unknown to us).
- **Uptime alerting:** sign up for an external monitor (for example on `/api/health`) and route alerts to a person. `/status` is a self-report, not an external check.
- **Error tracking:** the in-house recorder (`/admin/errors`) works without keys; Sentry is wired but inactive until `SENTRY_DSN` is set (and has been tested only against a mock).
- **Shared rate-limit store:** limits fall back to Postgres or memory without Upstash keys. Fine at current scale; set `UPSTASH_REDIS_REST_URL/TOKEN` for a faster shared limiter.
- **Business has no monthly or daily dollar spend cap (code, founder decision).** Business is custom-priced and sold by contact only, so there is no self-serve path to it, but when an account is set to Business, its spend is limited only by the per-request cap ($2), 1,000 requests a day, 5 at once and the per-minute limits. Set a contract-specific cap in `PLAN_LIMITS.business.dailyUsd` (and a monthly budget) when the first Business customer is signed. `tests/rate-limit-audit.test.ts` pins this state so a change is deliberate.
- Cost/load thresholds (`KEPLAR_LOAD_HIGH`, `KEPLAR_LOAD_CRITICAL`) are guesses until real traffic exists.

## Integrations
- **Connectors have never been run against real accounts** (Gmail, Calendar, Slack, GitHub, Notion, Linear, MCP servers, Plaid, Higgsfield). The UI labels them "Not verified with live accounts" and `src/lib/business/verification.ts` stays `false` until someone completes a real run and records the date.
- **Google/Microsoft app verification** for sensitive OAuth scopes (Google's review takes weeks).

## Desktop app
- **Installers are unsigned and not notarized.** Buying code-signing certificates (Windows EV/OV, Apple Developer ID + notarization) is a founder purchase. Until then users see SmartScreen/Gatekeeper warnings; `/download` explains it and shows SHA-256 checksums.

## Testing we could not do
- **Real GPUs, phones and tablets.** Browser tests run headless Chromium/Firefox/WebKit with software rendering and phone emulation only. Performance and WebGL on real devices, Safari on real iOS, and screen readers (NVDA, JAWS, VoiceOver) are untested by us.
- **Red-team testing of prompt injection with live models** has not been done. Defenses are structural (fencing, approvals, firewall) and unit-tested.

## Safety
- The input screen (`src/lib/safety/screen.ts`) is a narrow rule list, not a moderation service; it will miss things and has not been reviewed by a trust-and-safety professional. Reports go to `/admin/inbox` and nothing emails automatically, so **a person must read the inbox and support tickets** (`/admin/inbox`, support tickets view).
- The crisis reply points to 988 (US). Other countries need local resources.

## Security work still open (see `docs/security-progress.md`)
- **Passkeys (WebAuthn): built, not yet tried on real devices (founder-only check).** Optional per user (Account > Two-factor & passkeys, and "Log in with a passkey" on the log-in page), built on `@simplewebauthn/server` with our own tables and session model. The server side is tested with a software authenticator (real signature checks, replay, clone-counter, wrong-origin and no-user-verification cases), and the browser buttons are not exercised by an automated browser test. Please add a passkey on a real phone or laptop and log in with it once. A passkey login is treated as two factors (user verification is required), so it does not ask for an authenticator-app code. Losing every passkey does not lock anyone out: email links, passwords and Google/Microsoft keep working.
- **2FA recovery by a person:** a user who loses both the authenticator and the recovery codes needs the founder to remove their row in `keplar_mfa` after verifying who they are. There is no self-serve path by design.
- **Chats and profile data are not encrypted by Keplar** beyond the database host's encryption at rest (not independently verified). Connector tokens are encrypted by Keplar.
- Account deletion: the database host may keep backups for a while after deletion (stated in the Privacy Policy).
