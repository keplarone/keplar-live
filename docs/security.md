# Security summary

Report issues to team@keplar.one (`/.well-known/security.txt`). The full control register (every item of the Keplar security checklist, with
status and evidence) is `docs/security-checklist.md`, rendered from `security/checklist.json`; the policy, severity levels and accepted-risk
register are `docs/security-policy.md`; the threat model `docs/threat-model.md`; data and processors `docs/privacy-inventory.md`; cloud and
delivery `docs/infrastructure.md`; agents `docs/agent-security.md`.

## Oct 17, 2026: checklist pass (what was added)
- **Security event log and alerts** (`src/lib/security/events.ts`): authorization failures (anonymous or cross-site calls, refused admin calls),
  sign-in limiter trips, wrong second factors, admin and kill-switch actions, billing grants and revocations, secret unseals, agent actions,
  rejected uploads and data exports are structured log lines and `security_events` rows (hashed IP and account, request id, 90-day retention,
  `/admin/security`). Thresholds per kind email the owner once per hour. Tests: `tests/security-events.test.ts`.
- **Sessions**: idle expiry (30 days unused) and absolute expiry (180 days from sign-in) on top of the 60-day sliding window
  (`src/lib/accounts/persist.ts`, `KEPLAR_SESSION_IDLE_DAYS`, `KEPLAR_SESSION_MAX_DAYS`).
- **Uploads**: structural malware checks (PDFs with JavaScript, launch or open actions, embedded files; executables or archives behind an image
  type; image/HTML polyglots; decompression bombs by declared size) and an optional external scanner (`KEPLAR_MALWARE_SCAN_URL`, fail-closed with
  `KEPLAR_MALWARE_SCAN_REQUIRED=1`): `src/lib/security/upload-scan.ts`, wired into generated-app uploads. Tests: `tests/upload-scan.test.ts`.
- **Edge**: one 64 MB body cap on every `/api` request before any route runs (`src/proxy.ts`); routes keep their smaller caps.
- **Generated sites and apps**: the security and mobile checklist (`src/lib/create/output-checklist.ts`): 31 checks run on every build, the
  deterministic ones repaired automatically (viewport, zoom allowed, charset, lang, title, noopener, alt, lazy and fluid images, reduced motion)
  and the rest handed to the repair pass; the result is stored with the version and shown in the build report. Tests: `tests/output-checklist.test.ts`,
  `tests/fuzz-parsers.test.ts`.
- **Delivery**: CodeQL (SAST), dependency review (SCA) on pull requests, lockfile integrity (`scripts/lockfile-check.mjs`), a secret scan of the
  build output, a CycloneDX SBOM artifact, CODEOWNERS, a PR security checklist, `SECURITY.md`; GitHub secret scanning with push protection and
  Dependabot security updates turned on; a ruleset on `main` (pull requests only, CI required, no force pushes or deletion).
  `tests/infra-config.test.ts` scans the configuration itself.
- **Browser source maps** are explicitly off (`productionBrowserSourceMaps: false`).
- **Runbooks and policy**: severity levels, revocation order, notification rules and quarterly exercises in `docs/runbooks/security-incident.md`;
  SDLC, accepted-risk register, review calendar, key rotation, third-party script inventory, API deprecation and continuity in `docs/security-policy.md`.

## Headers (`next.config.ts`, `src/lib/security/headers.ts`)
- `Content-Security-Policy`: `default-src 'self'`; scripts `'self' 'unsafe-inline'` (the inline before-paint theme script and
  JSON-LD need it; no remote script hosts, no `eval` in production); `img-src 'self' data: blob:`; `worker-src 'self' blob:`
  (three.js); `connect-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`;
  `upgrade-insecure-requests`. Tightening scripts to nonces would force every page to render dynamically; revisit later.
- `Strict-Transport-Security` (2 years, includeSubDomains, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, geolocation, payment, usb off; microphone only for our own origin, for voice dictation),
  `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` on the app shell only (not on `/sites/*`, `/s/*`, `/apps/*`, which set their own CORP for sandboxed pages).
- `/sites/*` (user-built sites) are excluded from the app CSP/frame rules; they send their own sandbox CSP and may be framed by `/app` only.

## Requests (`src/proxy.ts`, `src/lib/security/origin.ts`)
- Every `/api` call: per-IP limit (240/min). State-changing browser requests must come from our origin
  (`Origin`, else `Sec-Fetch-Site`); cross-site POSTs get 403. Exempt: signed webhooks, Inngest, public store forms.
  The Origin check never trusts `X-Forwarded-Host` (spoofable from script); a Host fallback is allowed only when
  `Origin`'s host equals the `Host` header and that host is one of Keplar's own (`isAppHost`).
- Route limits: `/api/keplar` 30/min per IP and the plan's rpm per account; checkout 10/min per IP and 5 per account;
  magic link 3 per email per 10 min, 2 per IP+email per minute, 10 per IP per 10 min.
- Rate limiter (`create/platform/ratelimit.ts`) is in-memory per instance; it uses Upstash Redis automatically when
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set (shared across instances). Set them before real traffic.
  The sign-in limits (magic link, password, desktop and Business sign-in, two-factor codes, passkeys) are called with
  `{ shared: true }`, so without Upstash they count in Postgres and still hold across instances. Better Auth's own
  per-IP limiter (`/api/auth/*`, 30/min) stays in memory, i.e. per instance.

## Custom domains (`docs/custom-domains.md`)
- A request on a Host that is not Keplar's own is served only as the published site of the active domain with that Host, or 404; no app, admin or API route is reachable there (`src/proxy.ts`, re-checked in the `/s` route).
- Ownership: hostname validated strictly, unique per account, and a per-domain `_keplar-verify` TXT is required before a domain goes active (shared Vercel project means Vercel alone can't separate tenants). All domain routes are owner-scoped (404 for other accounts).
- `VERCEL_DOMAINS_TOKEN` is server-only, sent only to api.vercel.com in the `Authorization` header, never logged or returned. HSTS on customer hosts has no `includeSubDomains`/`preload`.

## Generated sites: effects scripts and images
- Generated sites run no user script, ever. The one exception is opt-in per site: with effects enabled and effect hooks on the page, that page is served with `script-src 'self'` (no inline) and `allow-scripts` in its sandbox (never `allow-same-origin`), loading only Keplar's vendored `/fx/*.js`. Everything else keeps `default-src 'none'`; the sanitizer still strips every `<script>`, handler and non-allow-listed `data-*`.
- Generated-app uploads (`src/lib/app-runtime/files.ts`): magic-byte sniff for PNG/JPEG/WebP/GIF/PDF; UTF-8 text only when the body is not HTML/SVG/XML; size and storage caps; served with sandbox CSP, nosniff and CORP.
- Chat attachments: images are sent byte for byte (original format, up to 4096 px) when they fit the request, otherwise fitted in the browser; the server re-validates type, magic bytes, size and count and keeps nothing. Generated images are PNG as produced, owner-only until the owner uses one in a site (then public by unguessable id).

## Product import (Create)
- **SSRF.** The product-page and image fetches use `src/lib/mcp/ssrf.ts`: https only in production, no credentials in the URL, only ports 80/443/high ports, internal names refused, every resolved address must be public (one private answer refuses the host), the connection is pinned to the validated address (DNS rebinding cannot swap it), every redirect target is re-validated (scheme, name, address) **and checked against robots.txt before it is requested**, response size and time are capped (page 12 s / 1.8 MB, image 12 s / 14 MB), and nothing is sent that identifies the user: no cookies, Authorization or Referer. Tests: `tests/product-import.test.ts` (private/loopback/link-local/metadata/IPv6/encoded-IP literals, internal names, rebinding, redirects to private hosts, loops, size and time limits, content types, status codes, robots, header audit).
- **robots / terms.** `KeplarBot` obeys robots.txt (also for image hosts and after redirects), refuses `noai` pages and `noimageai` images, and is documented at `/bot`. Not readable robots.txt means no fetch.
- **Untrusted content.** Page HTML is parsed by a scanner, never rendered or executed; text is bounded and control characters removed; `javascript:`/`data:` URLs are dropped; the page excerpt is display-only; product text reaches the generator only after the owner reviews it, inside a `<product-data>` block with `<>` stripped and an explicit "data, not instructions" label; the whole brief still goes through `checkPrompt`; generated sites still pass the sanitizer, and foreign `<img>` addresses are removed.
- **Images.** Type decided by magic bytes (SVG/HTML/PDF refused), decompression-bomb limits, JPEG GPS location stripped, served to the owner only (`private, no-store`, `nosniff`, sandbox CSP) until a site uses the image (then public by 128-bit id like generated images). A build drops images that are not the workspace's own, and all images when the owner has not confirmed the rights (checked on the server).
- **Abuse limits.** Per-plan daily page imports, photo readings and image counts, stored-image count and bytes, per-minute route limits; vision calls go through the usual spend gates.

## Input
- `/api/keplar`: JSON only, body under ~4.5 MB (413), prompt under 16,000 characters, history/attachments capped, images and
  video frames validated by type, magic bytes, size and count (`orchestration/media.ts`), never stored.
- Other routes validate their bodies and clamp lengths; `/api/inquire` also has a honeypot and size limits.

## Auth, cookies, redirects
- Sessions are Better Auth cookies (HttpOnly, SameSite=Lax, Secure on https). The plan cookie `keplar_plan` is HMAC-signed,
  HttpOnly, SameSite=Lax, Secure, bound to the email, and expires with the billing period.
- Magic-link callback URLs and all post-login redirects go through `safeCallbackPath`: same-origin relative paths only
  (`//evil`, `https://evil`, backslashes and control characters fall back to `/account`).
- Email + password (`docs/accounts-billing.md` §1): scrypt hashes in `keplar_credentials`; sign-in, sign-up and forgot answer identically for known and unknown addresses (no enumeration); lockout and rate limits per IP, IP+email and email; emailed links are signed, expiring and single use, and pages only check them (the button consumes); endpoints require a same-site `Origin`; pending sign-ups can't log in and are replaced or deleted when the address is proven another way; a reset signs out other devices. Redirects after login use `authRedirectPath` (same-origin paths only, never an auth page).
- Sessions with the account database: a session id without a row in `keplar_sessions` is refused (fail closed), so a
  pruned, revoked, still-pending-2FA or deleted session can't be brought back by its cookie. Only cookies from before the
  table (created before 2026-10-02) are adopted, and only until 2026-11-02. Deleting an account leaves a tombstone (a keyed
  hash of the email and the time) so an old cookie can't recreate it. "Remember me" off: the cookie's encrypted payload
  expires with the 1-day server record.
- Only the Better Auth endpoints the app uses are served (`DISABLED_AUTH_PATHS` in `src/lib/accounts/auth.ts`); Google
  and Microsoft sign in by redirect only (`disableIdTokenSignIn`). `http://localhost:3000/3001` are trusted origins only
  outside production.
- Recent sign-in (10 minutes, `src/lib/accounts/reauth.ts`) is required to add a passkey, set up or turn on two-factor
  sign-in, make new recovery codes, delete the account immediately, export its data and create an API key: 403
  `reauth_required`, and the page links to `/signin?reauth=1&next=…`. Business and desktop-app sessions inherit the
  sign-in time of the session that handed them over. The owner is emailed when 2FA is turned on or off, recovery codes are
  replaced, a passkey is added or removed, or an API key is created.
- Password sign-up for an address that already has an account (email link, Google, Microsoft) sends the "you already
  have an account" email, never a link that would attach the new password; the answer is the same either way.
- In production a missing `BETTER_AUTH_SECRET` makes a random per-instance secret (sessions then don't survive restarts); set it.
  `GET /api/health` reports `security.authSecret` (boolean) and `security.rateLimit` (`upstash` | `postgres` | `memory`) without leaking values.

## Webhooks
- Whop (`/api/webhooks/whop`): Standard Webhooks HMAC-SHA256, constant-time compare, 5-minute replay window, 256 KB cap,
  idempotent by `webhook-id`. Without `WHOP_WEBHOOK_SECRET` it answers 503 and applies nothing.
- Stripe Connect (`/api/business/stripe/webhook`): signature verified with `STRIPE_CONNECT_WEBHOOK_SECRET` (test events) or `STRIPE_CONNECT_WEBHOOK_SECRET_LIVE` (live events), each only for events of its own mode; test and live records never mix; kill switch `KEPLAR_PAYMENTS_DISABLED` / admin "Pause seller payments".

## Secrets and errors
- Secrets are read server-side only. The only `NEXT_PUBLIC_` variables are the site URL, indexing flag and verification tokens.
- Provider keys, tokens and request bodies are never logged; route errors return generic messages and log only the error name.
  Stream failures in `/api/keplar` return "Something went wrong."

## Dependencies
- `npm audit --omit=dev`: 0 vulnerabilities (Oct 11, 2026). Next.js 16.3.6 → 16.3.8 fixed the high-severity cache-poisoning and Draft Mode
  leak advisories; `overrides` in package.json pin `image-size` ≥ 2.0.4 (pulled in by `pptxgenjs`, whose only call to it is commented
  out) and `source-map-js` ≥ 1.2.2.
- `npm audit` (dev tree): 5 high, all one advisory (`braces` ≤ 3.0.3 stack exhaustion, GHSA-vfj7-8cjw-p6xm) reached only through
  ESLint's file globbing on our own source. No patched `braces` exists yet. Accepted: dev-only, never shipped, no untrusted input.
- The deploy gate (`scripts/verify.mjs`) now fails on any high or critical advisory in production dependencies and on any secret
  found by `scripts/secret-scan.mjs` (tracked files plus untracked, non-ignored files, since a folder deploy uploads those).

## Admin accounts
- Admin = a verified session whose email is in `KEPLAR_ADMIN_EMAILS`; every `/admin` page and `/api/admin` route uses
  `src/lib/ops/admin-auth.ts`, and non-admins get 404.
- `KEPLAR_ADMIN_REQUIRE_MFA=1` additionally requires the admin account to have an authenticator app turned on, which means
  every admin session passed a second factor. Fails closed. **Off until the founder turns it on**: set up the authenticator
  first (Account > Two-factor), then set the variable in Vercel Production and redeploy. Turning it on before that locks
  admin out (recover by unsetting it). Test: `tests/admin-mfa.test.ts`.

## Tests
`tests/security.test.ts` (origin including X-Forwarded-Host CSRF, proxy, headers including CORP, security.txt, open redirect, rate limit, input validation, cookies, health security flags),
`tests/whop.test.ts` (signatures, events, plan cookie, credits), `tests/magic-link.test.ts`, `tests/smalltalk.test.ts`.

## Connected apps (MCP)
Outbound calls to user-supplied MCP servers: SSRF-pinned fetch, AES-GCM secrets, untrusted-output fencing, approval-gated writes. See `docs/mcp.md`.

## Stored-data protection and logging audit (Oct 4, 2026)
What the code does, verified by `tests/secrets-audit.test.ts`:
- **Connector tokens and API keys** (Google/Slack/GitHub OAuth tokens, MCP bearer tokens, Plaid, mobile credentials) are sealed with AES-256-GCM before storage (`src/lib/mcp/crypto.ts`): key = HKDF of `BETTER_AUTH_SECRET` per workspace, additional authenticated data binds a blob to its workspace and row, so a copied or tampered blob does not decrypt. Plain text exists only inside a server function while a request is built. The export omits connector secrets.
- `src/lib/create/platform/secrets.ts` (older helper, currently unused) used to fall back to a publicly known dev key; it now throws in production without `KEPLAR_TOKEN_ENC_KEY`.
- **Not encrypted by Keplar:** chats, memory, profile and email addresses are ordinary database rows. Protection there is the database host's (Neon) encryption at rest and access control, which we have not independently verified. Backups made by `scripts/backup-db.mjs` are plain gzip unless `BACKUP_PASSPHRASE` is set.
- **Passwords** are salted scrypt hashes (Better Auth); magic/verify/reset/secure links are HMAC-signed and expire.
- **Logs:** a test fails if any `console.*` call interpolates a variable named token, secret, password, authorization, cookie, API key or bearer. Error reports pass through `scrub()` (bearer tokens, API keys, emails, query secrets). Email bodies (which may hold sign-in links) are not logged or stored unless dev tools are on.
- **Limits of this audit:** it is a static check plus targeted tests, not a penetration test. A secret placed in a variable with a different name, or in a third-party service's logs (Vercel, Neon, providers), would not be caught.

## Prompt-injection defenses (what exists, and its limits)
No filter stops prompt injection completely. The design assumes a model can be fooled, so the damage a fooled model can do is limited by code it cannot change.
- **Connected apps (MCP):** tool descriptions, results and errors are sanitized (`src/lib/mcp/sanitize.ts`: invisible characters, active content, instruction-like lines, secret patterns) and fenced as `<untrusted_tool_output>`; the planner prompt says never to follow instructions inside. Tools that change data, or are unclassified, never run without the owner's approval; only tools the owner marked read-only can auto-run. Permissions, risk level and budgets come from rows the owner edited, never from model or server text. The AI Firewall (`src/lib/business/firewall.ts`) re-checks arguments at execution time.
- **Built-in connectors (Gmail, Calendar, Slack, GitHub):** outbound actions go through the Firewall and the approval queue; auto-send is off unless the owner turned it on per agent, needs a plan entitlement, a daily cap, and a Firewall "safe" verdict. Scheduled runs always queue for approval. A provider reply that is not a confirmed success is reported as an error.
- **Uploaded documents:** fenced with an unforgeable marker and a system rule that the text carries no instructions (`src/lib/documents/guard.ts`).
- **Agent drafts (new Oct 4, 2026):** text from outsiders (lead messages, names, product text) is sanitized and fenced in the draft prompt; a draft that adds a link or email address not in the starting draft is discarded; draft calls ask OpenRouter to avoid endpoints that collect prompts (`src/lib/business/draft-safety.ts`).
- **Not covered:** web search results in normal answers are used as model context without a dedicated fence (the answer pipeline has no tools that act on the world, so the risk there is a misleading answer, not an action). Red-team testing with real models has not been done.
