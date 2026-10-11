# Security hardening progress (kept current after every step)

Legend: **Implemented** = in master. **Tested** = automated test exists and passed in the deploy gate (typecheck, lint, unit tests, build, browser smoke). **Deployed** = live on keplar.one with the post-deploy smoke check passing. Nothing here is a claim of certification or audit.

| # | Item | Implemented | Tested | Deployed | Notes |
|---|---|---|---|---|---|
| 0 | "Report this answer" dialog opened after every answer | yes (2ee072a) | yes: `e2e/report-dialog.e2e.ts` in the gate; live CSS rule checked | yes (5cda37d) | Cause: `display:grid` on the class overrode a closed `<dialog>`'s hidden state |
| 1 | Account security page: sessions list, sign out one / all | already existed (Account > Devices) | `tests/persistent-sessions.test.ts` | yes | |
| 1b | New-device sign-in email + "This wasn't me" (signs out everywhere) | yes (09cc53c) | `tests/new-device.test.ts` | yes (f5c2590) | Emails only the account's own address; sign-in is never blocked |
| 2 | `/security` page + security.txt | yes (9c5413b) | `tests/security-page.test.ts` | yes (f5c2590) | No bounty, no certification claims |
| 3 | Data-training statement (Settings + Privacy) | yes (ff1fd3d) | `tests/training-statement.test.ts` | yes (ff1fd3d) | Verified against provider routing code |
| 4 | Data export (JSON) | already existed | `tests/privacy.test.ts` | yes | JSON, not ZIP |
| 5 | Account deletion with grace period | yes (11e0793, 61c9c26) | `tests/deletion-grace.test.ts` | yes (67678ec) | 14 days, cancelable, nightly purge in the existing cron |
| 6 | TOTP 2FA + recovery codes | yes: helpers, sealed store, sign-in gate, /two-factor page, challenge + settings API, Account > Two-factor | `tests/totp.test.ts` (RFC vectors), `tests/mfa-store.test.ts`, `tests/mfa-signin.test.ts` (real magic-link sign-in on an in-process Postgres) | yes (320e29f) | Better Auth's plugin cannot be used (needs its own DB adapter); own implementation, sign-in gate = `mfa_pending` on the session row |
| 7 | Passkeys (WebAuthn), optional per user | yes: store + ceremonies (dd3453f), account API + sign-in endpoints (bdc308b), Account UI + log-in button | `tests/passkeys.test.ts`, `tests/passkeys-signin.test.ts` (software authenticator: real signatures) | yes (dd3453f, bdc308b, UI in 9958ba7); live check: /api/auth/passkey/login/options answers, Account API 401 when signed out | `@simplewebauthn/server` + `browser`, own tables. User verification required, so a passkey login skips the TOTP prompt. Deleting an account now also deletes the 2FA secret and passkeys. Not tried on real devices yet (founder check) |
| 8 | Connector-token encryption, secrets-in-logs guard | yes (0f33cfa) | `tests/secrets-audit.test.ts` | yes (655e588) | Chats/email addresses are plain DB rows (host encryption only) |
| 9 | Prompt-injection hardening | yes (1c19007, bfd329b) | `tests/draft-safety.test.ts` | yes (655e588) | MCP/doc fencing already existed |
| 10 | Accessibility (axe-core, WCAG 2.0/2.1 A+AA) in Light and Dark | `e2e/a11y.e2e.ts`: 20 routes x 2 themes, no serious or critical findings at 844fccd (after the design executor's redesign), no code fixes needed | in the deploy gate from this step | see deploy log | axe finds roughly a third of real issues; no screen-reader or real-device test yet. Signed-in pages (Account, Business) are not scanned |
| 11 | CSRF Host spoof fix, CORP on app shell, health security flags, app-upload HTML/SVG refusal, safeHref control-char guard | yes | `tests/security.test.ts`, `tests/safe-href.test.ts`, `tests/app-runtime.test.ts`, `tests/health.test.ts` | pending deploy | Origin check no longer trusts `X-Forwarded-Host`; Host fallback only on Keplar app hosts. `/api/health` reports `security.authSecret` + `security.rateLimit`. |

2FA notes: optional per user; admins get a stronger prompt in the Account panel but it is not forced. A second factor is checked for every sign-in method because the gate is on the session row. If the database cannot be read at sign-in the factor is skipped (same fail-open rule as the rest of auth; logged). Lost authenticator + lost recovery codes = founder must reset by removing the user's `keplar_mfa` row (no self-serve path yet).


Authz fix: `POST /api/account/mfa` now answers 401 to anonymous callers (session check comes before body parsing) and is no longer on the authz test's public allow-list.


Rate limits and cost caps (re-verified, `tests/rate-limit-audit.test.ts`): every plan has per-minute, daily, concurrency and size caps that never shrink on a higher plan; Free is limited to $0 models; Lite/Plus/Pro have a monthly budget with a lower daily spend cap and a lower per-request cap; all 111 state-changing API routes are checked for a limiter (in the route, a shared helper, or the library it calls), a signature/admin check, or a reviewed cheap-write entry, and stale entries fail the test. Finding: Business (custom-priced, by contact) has no monthly or daily dollar cap; recorded in `docs/known-gaps.md` as a founder decision before the first Business customer.

Oct 6, 2026 hardening (this pass): fixed CSRF via spoofable `X-Forwarded-Host` in `src/lib/security/origin.ts`; added `Cross-Origin-Resource-Policy: same-origin` to app shell headers; `/api/health` now surfaces whether `BETTER_AUTH_SECRET` is set and which rate-limit backend is active; generated-app uploads refuse HTML/SVG/XML text; markdown `safeHref` refuses control characters and padded schemes.

## Oct 11, 2026 security pass (findings register)

Scope: dependency audit, secret scan (tracked, untracked and git history), live production headers, the code added since the Oct 6 pass (Studio auto top-up, Business sign-in handoff, Business guard, embedded Business checkout, Studio agent), cross-account lookups in every dynamic API route, raw-HTML rendering, admin access, and the deploy gate. Static review plus tests; not a penetration test.

| # | Severity | Finding | Status | Evidence |
|---|---|---|---|---|
| F1 | High | Next.js 16.3.6 has high-severity advisories (cache poisoning of SSG/ISR pages, Draft Mode content leak) | Fixed: 16.3.8 (pinned `~16.3.8`) | `npm audit --omit=dev`: 0 |
| F2 | High (unreachable) | `image-size` DoS via `pptxgenjs`; `source-map-js` DoS via PostCSS | Fixed: `overrides` to patched versions (pptxgenjs never calls image-size) | `npm audit --omit=dev`: 0 |
| F3 | Medium | Admin access is single-factor: whoever controls the admin mailbox gets `/admin` | Mitigation built, **off until the founder enables it** (`KEPLAR_ADMIN_REQUIRE_MFA=1` after setting up an authenticator) | `tests/admin-mfa.test.ts` (real sign-in on in-process Postgres) |
| F4 | Medium | Studio agent: Luau that spells destructive calls indirectly (`["Des".."troy"]`, `GetService(var)`, `string.char`, escapes, `getfenv`) was classed as a normal change and could run under "auto-approve safe changes"; inserted Creator Store assets are an indirect prompt-injection path | Fixed: such code is always destructive (asks) | `tests/studio-agent.test.ts` (11 evasions ask, 4 normal builds don't) |
| F5 | Medium (privacy) | Revenue Guard collections (`guard_targets/runs/reports`) were not classified, so account export and deletion skipped them | Fixed: user data (exported, deleted; token redacted) | `tests/privacy.test.ts` |
| F6 | Low (availability) | 2FA users could never sign in to business.keplar.one: the handoff created an `mfa_pending` session and the Business host has no 2FA page | Fixed: the handoff session counts as two-factor (the ticket is minted only from a session that passed 2FA) | `tests/business-app.test.ts` |
| F7 | Low (process) | Deploy gate had no dependency audit or secret scan | Fixed: both are the first two blocking steps of `scripts/verify.mjs` | `tests/secret-scan.test.ts` |
| F8 | Info | Dev-only `braces` advisory (ESLint globbing), no fix released | Accepted risk | `docs/security.md` |

Checked, no finding: no secrets in tracked/untracked files or in history for the patterns scanned; only public `NEXT_PUBLIC_*` values; production CSP has no `unsafe-eval`, HSTS preload, frame-ancestors none, nosniff; `/admin` 404 to anonymous; dynamic API routes all look rows up scoped to the caller's workspace except two public-by-design ones (embed widget display settings, agent webhooks by hashed token); KaTeX runs with `trust` off and bounded expansion; the Voice Live highlighter escapes all text; Studio auto top-up binds price and card to a server quote, single-writer charge lock, verifies every Whop payment field before granting, revokes on refund; the Business handoff ticket is signed, 60 s, bound to the starting browser, and is minted only from a fully verified session (pending-2FA sessions are refused); embedded checkout trusts only the server-signed email and the plan id.

Still open (needs a person or a decision): enable F3; Upstash for a faster shared limiter (Postgres limiter is active in production); external uptime monitor and alert routing; a real restore test of backups (`docs/runbooks/backup-restore.md`); live-model red-team of prompt injection; `scripts/deploy.mjs` assumes Linux paths (`/tmp`, `cp -al`), so Windows deploys use a clean git worktree by hand; CSP still allows inline scripts (nonces would force dynamic rendering; see above).
