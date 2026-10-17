# Keplar security checklist

Rendered from `security/checklist.json` by `scripts/security-checklist.mjs`; do not edit by hand. `tests/security-checklist.test.ts` and CI fail when an evidence file disappears or an item regresses to TODO.

**444 controls.** Done 382 · Policy 33 · Accepted risk 9 · Not applicable 20 · TODO 0.

"Done" means the control exists in code or configuration and the evidence column points at it (a module, a test that exercises it, or a setting). "Policy" means a written procedure the operator follows, because software cannot perform it alone (a restore drill, a lawyer's review, a penetration test). "Accepted risk" is a deliberate, dated decision recorded in `docs/security-policy.md`. Nothing here claims a certification or an external audit; `/security` says the same.

Last rendered: 2026-10-17.

## Contents

- [1. Authentication and account security](#auth)
- [2. Authorization and permissions](#authz)
- [3. Session, cookie, and token protection](#session)
- [4. API and backend security](#api)
- [5. Frontend and browser security](#frontend)
- [6. Database and data protection](#database)
- [7. File upload and storage security](#uploads)
- [8. Cloud and infrastructure security](#cloud)
- [9. Secrets and API key management](#secrets)
- [10. Payments and subscription security](#payments)
- [11. AI and LLM security](#ai)
- [12. Autonomous agent security](#agents)
- [13. GitHub and app-builder security](#github)
- [14. Logging, monitoring, and incident response](#logging)
- [15. Privacy and compliance](#privacy)
- [16. Business logic and abuse prevention](#abuse)
- [17. Security verification and governance](#governance)
- [18. Websites and apps Keplar generates](#generated-output)

<a id="auth"></a>

## 1. Authentication and account security

Email links, passwords (scrypt), Google and Microsoft, TOTP, passkeys. Sessions are server-checked rows; sensitive changes need a recent sign-in.

28 items, 28 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Secure password hashing using Argon2id or an appropriate modern alternative | Done | [`src/lib/accounts/credentials.ts`](../src/lib/accounts/credentials.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) | scrypt (Better Auth's hashPassword), an OWASP-listed alternative; Argon2id would add a native dependency to the serverless bundle. |
| Unique salts and properly configured hashing parameters | Done | [`src/lib/accounts/credentials.ts`](../src/lib/accounts/credentials.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) | Random 16-byte salt per hash, scrypt N=16384, r=16, p=1, 64-byte key. |
| No plaintext passwords in databases, logs, or analytics | Done | [`tests/secrets-audit.test.ts`](../tests/secrets-audit.test.ts)<br>[`src/lib/ops/errors.ts`](../src/lib/ops/errors.ts) |  |
| Passkey/WebAuthn authentication | Done | [`src/lib/accounts/passkeys/webauthn.ts`](../src/lib/accounts/passkeys/webauthn.ts)<br>[`tests/passkeys.test.ts`](../tests/passkeys.test.ts)<br>[`tests/passkeys-signin.test.ts`](../tests/passkeys-signin.test.ts) |  |
| Multifactor authentication | Done | [`src/lib/accounts/mfa/totp.ts`](../src/lib/accounts/mfa/totp.ts)<br>[`src/lib/accounts/mfa/store.ts`](../src/lib/accounts/mfa/store.ts)<br>[`tests/mfa-signin.test.ts`](../tests/mfa-signin.test.ts)<br>[`tests/totp.test.ts`](../tests/totp.test.ts) |  |
| MFA enforcement for administrators | Done | [`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`tests/admin-mfa.test.ts`](../tests/admin-mfa.test.ts)<br>[`docs/security.md`](../docs/security.md) | Enforced when KEPLAR_ADMIN_REQUIRE_MFA=1 is set in Vercel Production (fails closed). Turn it on after enrolling the admin authenticator; the variable is not set yet so the founder is not locked out. |
| MFA recovery with secure, limited-use recovery codes | Done | [`src/lib/accounts/mfa/store.ts`](../src/lib/accounts/mfa/store.ts)<br>[`tests/mfa-store.test.ts`](../tests/mfa-store.test.ts) | 10 codes, hashed, each usable once; regenerating needs a current code. |
| Protection against MFA fatigue and repeated challenges | Done | [`src/app/api/account/mfa/route.ts`](../src/app/api/account/mfa/route.ts)<br>[`src/lib/accounts/security-notice.ts`](../src/lib/accounts/security-notice.ts)<br>[`tests/mfa-signin.test.ts`](../tests/mfa-signin.test.ts) | TOTP has no push prompts to fatigue; wrong codes are limited per IP, per session (the fifth ends the session) and per account, and the owner is emailed when codes are locked. |
| Email verification | Done | [`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) |  |
| Secure password-reset tokens | Done | [`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) | HMAC-SHA256 under a purpose-bound derived key; a reset token can never pass as a verification token. |
| Short-lived, single-use password-reset links | Done | [`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts) | 30 minutes; single use through a fingerprint of the password hash current when issued. |
| Reset token invalidation after use | Done | [`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) |  |
| Session invalidation after sensitive account changes | Done | [`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) | A password reset signs out every other device (sessions_valid_after); the secure link in notices signs out everywhere. |
| Login rate limiting | Done | [`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`src/lib/accounts/auth.ts`](../src/lib/accounts/auth.ts)<br>[`tests/magic-link.test.ts`](../tests/magic-link.test.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) |  |
| Credential-stuffing detection | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`tests/security-events.test.ts`](../tests/security-events.test.ts) | Per IP, IP+email and network+email limits; each trip is an auth.throttled security event, and three in ten minutes from one source email the owner. |
| Brute-force protection without easy account-lockout denial of service | Done | [`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) | Limits are keyed on the attacker (IP, network) with a high per-email ceiling instead of a hard lockout; email links and passkeys keep working for the real owner. |
| Protection against account enumeration | Done | [`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`tests/password-auth.test.ts`](../tests/password-auth.test.ts) | Identical answers and a dummy scrypt hash for unknown addresses (no timing tell). |
| Secure OAuth/OpenID Connect implementation | Done | [`src/lib/accounts/oauth.ts`](../src/lib/accounts/oauth.ts)<br>[`src/lib/accounts/auth.ts`](../src/lib/accounts/auth.ts)<br>[`tests/oauth.test.ts`](../tests/oauth.test.ts) |  |
| OAuth `state` validation | Done | [`src/lib/accounts/oauth.ts`](../src/lib/accounts/oauth.ts)<br>[`src/lib/mcp/oauth.ts`](../src/lib/mcp/oauth.ts)<br>[`tests/mcp-oauth.test.ts`](../tests/mcp-oauth.test.ts) | Better Auth binds state to an encrypted cookie for Google/Microsoft; the MCP and connector flows store state per workspace and check it on callback. |
| PKCE for applicable OAuth flows | Done | [`src/lib/desktop-auth/core.ts`](../src/lib/desktop-auth/core.ts)<br>[`src/lib/mcp/oauth.ts`](../src/lib/mcp/oauth.ts)<br>[`tests/desktop-auth.test.ts`](../tests/desktop-auth.test.ts)<br>[`tests/mcp-oauth.test.ts`](../tests/mcp-oauth.test.ts) |  |
| OIDC nonce, issuer, audience, and signature validation | Done | [`src/lib/accounts/oauth.ts`](../src/lib/accounts/oauth.ts)<br>[`tests/oauth.test.ts`](../tests/oauth.test.ts) | ID tokens are validated by Better Auth's provider implementations; Keplar additionally requires a provider-verified email claim. |
| OAuth redirect URI allowlisting | Done | [`src/lib/accounts/oauth.ts`](../src/lib/accounts/oauth.ts)<br>[`src/lib/accounts/magic-token.ts`](../src/lib/accounts/magic-token.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) | Fixed callback URLs registered per provider; every post-login redirect goes through safeCallbackPath (same-origin paths only). |
| Secure account linking and unlinking | Done | [`src/lib/accounts/auth.ts`](../src/lib/accounts/auth.ts)<br>[`src/lib/business/oauth-connectors.ts`](../src/lib/business/oauth-connectors.ts)<br>[`tests/connectors-oauth.test.ts`](../tests/connectors-oauth.test.ts) | Sign-in linking only for Google and Microsoft with verified emails; connectors disconnect by deleting the sealed token. |
| Reauthentication for sensitive actions | Done | [`src/lib/accounts/reauth.ts`](../src/lib/accounts/reauth.ts)<br>[`src/app/api/account/passkeys/route.ts`](../src/app/api/account/passkeys/route.ts)<br>[`src/app/api/account/export/route.ts`](../src/app/api/account/export/route.ts)<br>[`src/app/api/account/mfa/route.ts`](../src/app/api/account/mfa/route.ts) | Sign-in within 10 minutes for adding a passkey, enabling 2FA or new recovery codes, exporting data, creating API keys, immediate deletion; disabling 2FA needs a current code. |
| Session management across devices | Done | [`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`src/app/api/account/sessions/route.ts`](../src/app/api/account/sessions/route.ts)<br>[`tests/persistent-sessions.test.ts`](../tests/persistent-sessions.test.ts) |  |
| Ability to revoke active sessions | Done | [`src/app/api/account/sessions/route.ts`](../src/app/api/account/sessions/route.ts)<br>[`tests/persistent-sessions.test.ts`](../tests/persistent-sessions.test.ts) |  |
| Secure logout that invalidates server-side sessions | Done | [`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`src/lib/accounts/session-guard.ts`](../src/lib/accounts/session-guard.ts)<br>[`tests/persistent-sessions.test.ts`](../tests/persistent-sessions.test.ts) | Sign-out writes revoked_at; every request checks the row, so a revoked cookie stops working everywhere within 15 seconds. |
| No authentication secrets in browser storage when avoidable | Done | [`src/lib/accounts/session-cookies.ts`](../src/lib/accounts/session-cookies.ts)<br>[`docs/security-policy.md`](../docs/security-policy.md) | HttpOnly cookies only. The one exception, the browser extension's scoped API key, is accepted risk AR-10. |

<a id="authz"></a>

## 2. Authorization and permissions

Every route checks the session and the workspace it acts on; the store scopes every query to a tenant; tests walk every route anonymously and as another user.

22 items, 21 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Server-side authorization on every protected operation | Done | [`tests/authz.test.ts`](../tests/authz.test.ts)<br>[`src/lib/create/platform/workspace.ts`](../src/lib/create/platform/workspace.ts) |  |
| Deny-by-default access policies | Done | [`tests/authz.test.ts`](../tests/authz.test.ts) | A new route that answers an anonymous caller fails the test until it is reviewed and listed with a reason. |
| Least-privilege permissions | Done | [`src/lib/api/policy.ts`](../src/lib/api/policy.ts)<br>[`src/lib/team/policy.ts`](../src/lib/team/policy.ts)<br>[`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts) |  |
| Role-based access control (RBAC) | Done | [`src/lib/team/policy.ts`](../src/lib/team/policy.ts)<br>[`tests/team.test.ts`](../tests/team.test.ts) | Team roles (owner, member) decide billing, deletion and invitations; admin is a separate allow-list. |
| Attribute-based or policy-based access control where appropriate | Done | [`src/lib/business/firewall.ts`](../src/lib/business/firewall.ts)<br>[`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`tests/firewall.test.ts`](../tests/firewall.test.ts) | Agent actions are decided by attributes of the action (risk, recipient known, links) and owner-set tool policy rows. |
| Object-level authorization checks | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`tests/account-scope.test.ts`](../tests/account-scope.test.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) |  |
| Field-level authorization checks | Done | [`src/lib/api/keys.ts`](../src/lib/api/keys.ts)<br>[`src/lib/privacy/account-data.ts`](../src/lib/privacy/account-data.ts)<br>[`src/lib/app-builder/public.ts`](../src/lib/app-builder/public.ts) | Public views redact hashes, tokens and internal fields (publicKey, publicSpec, export redaction). |
| Function-level authorization checks | Done | [`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`src/lib/create/platform/workspace.ts`](../src/lib/create/platform/workspace.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) |  |
| Protection against IDOR/BOLA vulnerabilities | Done | [`tests/authz.test.ts`](../tests/authz.test.ts)<br>[`tests/share-isolation.test.ts`](../tests/share-isolation.test.ts)<br>[`tests/account-scope.test.ts`](../tests/account-scope.test.ts) |  |
| Prevention of horizontal privilege escalation | Done | [`tests/authz.test.ts`](../tests/authz.test.ts)<br>[`tests/account-scope.test.ts`](../tests/account-scope.test.ts) |  |
| Prevention of vertical privilege escalation | Done | [`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts)<br>[`tests/admin-mfa.test.ts`](../tests/admin-mfa.test.ts) |  |
| Workspace and organization membership validation | Done | [`src/lib/team/resolve.ts`](../src/lib/team/resolve.ts)<br>[`src/lib/team/store.ts`](../src/lib/team/store.ts)<br>[`tests/team.test.ts`](../tests/team.test.ts) |  |
| Tenant isolation across every database query | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`tests/account-scope.test.ts`](../tests/account-scope.test.ts)<br>[`tests/neon-store.test.ts`](../tests/neon-store.test.ts) | Every collection operation takes the workspace id; cross-tenant reads exist only for system jobs on the system tenant. |
| Authorization checks in background jobs and queues | Done | [`src/app/api/cron/core/route.ts`](../src/app/api/cron/core/route.ts)<br>[`src/lib/inngest/functions.ts`](../src/lib/inngest/functions.ts)<br>[`src/lib/create/platform/jobs.ts`](../src/lib/create/platform/jobs.ts) | Jobs reload the workspace row and re-check plan, budget and kill switches before each slice. |
| Authorization checks for WebSocket subscriptions | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts)<br>[`tests/collab-crdt.test.ts`](../tests/collab-crdt.test.ts) | Live collaboration streams need a signed room token bound to the user, room and role (viewer tokens are read-only). |
| Authorization checks for file downloads and exports | Done | [`src/app/api/account/export/route.ts`](../src/app/api/account/export/route.ts)<br>[`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`docs/security.md`](../docs/security.md) | Exports need the account plus a recent sign-in; generated images are owner-only until used in a site; app files are keyed by app and environment. |
| Ownership checks before updates or deletions | Done | [`tests/authz.test.ts`](../tests/authz.test.ts)<br>[`tests/chat-delete.test.ts`](../tests/chat-delete.test.ts)<br>[`tests/site-delete.test.ts`](../tests/site-delete.test.ts) |  |
| Privilege checks for administrative APIs | Done | [`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) |  |
| Explicit authorization for impersonation or support access | Not applicable | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md) | No impersonation or log-in-as feature exists. Support works from the admin inbox; any look at content on request is written to the admin audit log (inventory section 9). |
| Separation of administrative and ordinary user capabilities | Done | [`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`src/app/admin/layout.tsx`](../src/app/admin/layout.tsx) |  |
| No reliance on hidden buttons or frontend route guards for security | Done | [`tests/authz.test.ts`](../tests/authz.test.ts)<br>[`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts) |  |
| Automated tests for cross-tenant access attempts | Done | [`tests/account-scope.test.ts`](../tests/account-scope.test.ts)<br>[`tests/share-isolation.test.ts`](../tests/share-isolation.test.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) |  |

<a id="session"></a>

## 3. Session, cookie, and token protection

HttpOnly, Secure, SameSite=Lax, host-only cookies backed by server rows with idle and absolute expiry; HMAC tokens with purpose-bound keys; CSRF by Origin.

20 items, 17 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| `HttpOnly` cookies for sensitive sessions | Done | [`src/lib/accounts/session-cookies.ts`](../src/lib/accounts/session-cookies.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| `Secure` cookies over HTTPS | Done | [`src/lib/accounts/auth.ts`](../src/lib/accounts/auth.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| Appropriate `SameSite` cookie policies | Done | [`src/lib/accounts/session-cookies.ts`](../src/lib/accounts/session-cookies.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) | Lax: the app is a first-party site with OAuth returns. |
| Narrow cookie domains and paths | Done | [`src/lib/accounts/session-cookies.ts`](../src/lib/accounts/session-cookies.ts)<br>[`src/lib/business/handoff.ts`](../src/lib/business/handoff.ts) | Host-only cookies (no Domain attribute); business.keplar.one has its own session cookie and handoff. |
| Session ID rotation after login and privilege changes | Done | [`src/lib/accounts/reauth.ts`](../src/lib/accounts/reauth.ts)<br>[`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`src/lib/accounts/mfa/gate.ts`](../src/lib/accounts/mfa/gate.ts) | Every sign-in mints a new session; a session waiting for its second factor is unusable until the code is given. |
| Session fixation prevention | Done | [`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`tests/persistent-sessions.test.ts`](../tests/persistent-sessions.test.ts) | Session ids are server-minted on sign-in and never accepted from a URL or request body. |
| Idle session expiration | Done | [`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`tests/persistent-sessions.test.ts`](../tests/persistent-sessions.test.ts) | 30 days unused (KEPLAR_SESSION_IDLE_DAYS); non-remembered sessions last one day. |
| Absolute session expiration | Done | [`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts) | 180 days from sign-in regardless of activity (KEPLAR_SESSION_MAX_DAYS). |
| Refresh token rotation where applicable | Not applicable | [`src/lib/accounts/auth.ts`](../src/lib/accounts/auth.ts)<br>[`src/lib/mcp/oauth.ts`](../src/lib/mcp/oauth.ts) | Browser sessions are server-checked cookies, not refresh tokens. Connector refresh tokens are provider-issued, stored sealed and exchanged server-side. |
| Refresh token reuse detection | Not applicable | [`src/lib/accounts/auth.ts`](../src/lib/accounts/auth.ts) | No refresh tokens are issued by Keplar (see above). |
| Secure refresh token revocation | Done | [`src/lib/business/oauth-connectors.ts`](../src/lib/business/oauth-connectors.ts)<br>[`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`tests/connectors-oauth.test.ts`](../tests/connectors-oauth.test.ts) | Disconnecting deletes the sealed token row; account deletion removes every connector. |
| JWT signature verification | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts)<br>[`tests/collab-crdt.test.ts`](../tests/collab-crdt.test.ts)<br>[`src/lib/accounts/auth.ts`](../src/lib/accounts/auth.ts) | Room tokens are HMAC-verified in constant time; Better Auth's session cache is an encrypted JWE. |
| JWT algorithm allowlisting | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts) | One symmetric algorithm (HS256) is accepted; the header is not consulted to choose a key. |
| JWT issuer and audience validation | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts)<br>[`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts) | Tokens are bound to the room or purpose and the subject; a token for one purpose fails for another. |
| JWT expiration and not-before validation | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts)<br>[`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts)<br>[`tests/magic-link.test.ts`](../tests/magic-link.test.ts) |  |
| Protection against JWT algorithm confusion | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts) | No asymmetric path exists, so an attacker cannot swap RS256 for HS256. |
| Key rotation for token signing | Policy | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md) | BETTER_AUTH_SECRET signs sessions, plan cookies, action links and seals connector tokens; rotation signs everyone out, so it is a documented procedure run on compromise, not a timer. |
| Token revocation strategy | Done | [`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`src/lib/api/keys.ts`](../src/lib/api/keys.ts)<br>[`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts) | Sessions: revoked_at row; API keys: revokedAt looked up per request; action links: fingerprint changes on use; desktop codes: single use. |
| CSRF protection for cookie-authenticated state-changing requests | Done | [`src/lib/security/origin.ts`](../src/lib/security/origin.ts)<br>[`src/proxy.ts`](../src/proxy.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| No session tokens in URL query strings | Done | [`src/lib/accounts/session-cookies.ts`](../src/lib/accounts/session-cookies.ts)<br>[`tests/magic-link.test.ts`](../tests/magic-link.test.ts) | Sessions travel in cookies or the Authorization header only. Emailed links carry a one-time, short-lived token that the landing page only checks; the button's POST consumes it. |

<a id="api"></a>

## 4. API and backend security

Parameterized SQL, validated and bounded bodies, SSRF-safe outbound fetches, per-route limits, signed webhooks, generic errors.

30 items, 27 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Request schema validation | Done | [`src/lib/create/platform/http.ts`](../src/lib/create/platform/http.ts)<br>[`src/lib/mcp/schema.ts`](../src/lib/mcp/schema.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| Server-side input validation | Done | [`src/lib/orchestration/media.ts`](../src/lib/orchestration/media.ts)<br>[`src/lib/accounts/password-policy.ts`](../src/lib/accounts/password-policy.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| Output encoding for the destination context | Done | [`src/lib/site-builder/sanitize.ts`](../src/lib/site-builder/sanitize.ts)<br>[`tests/site-sanitize.test.ts`](../tests/site-sanitize.test.ts) | React escapes app output; generated sites are re-escaped from decoded values by the sanitizer. |
| SQL injection prevention using parameterized queries | Done | [`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts)<br>[`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`tests/neon-store.test.ts`](../tests/neon-store.test.ts) |  |
| NoSQL injection prevention | Not applicable | [`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts) | Postgres only; JSON document queries are parameterized SQL. |
| Command injection prevention | Done | [`src/lib/blender-cloud/machine.ts`](../src/lib/blender-cloud/machine.ts)<br>[`tests/studio-agent.test.ts`](../tests/studio-agent.test.ts) | No shell receives user or model input: machine scripts are fixed strings; Studio code that spells destructive calls indirectly is detected and held. |
| Server-side template injection prevention | Not applicable | [`src/lib/site-builder/sanitize.ts`](../src/lib/site-builder/sanitize.ts) | No server-side template engine renders user input; prompts are string-built with fences and never evaluated. |
| Path traversal prevention | Done | [`src/lib/create/platform/blob.ts`](../src/lib/create/platform/blob.ts)<br>[`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts)<br>[`src/lib/site-builder/store.ts`](../src/lib/site-builder/store.ts)<br>[`tests/blob.test.ts`](../tests/blob.test.ts) |  |
| XML external entity protections | Done | [`src/lib/attachments/xml.ts`](../src/lib/attachments/xml.ts)<br>[`tests/attachments-parsers.test.ts`](../tests/attachments-parsers.test.ts) | A hand-written scanner that never resolves entities or DTDs; office documents are read as zipped XML with the same scanner. |
| Server-side request forgery (SSRF) prevention | Done | [`src/lib/mcp/ssrf.ts`](../src/lib/mcp/ssrf.ts)<br>[`tests/mcp-ssrf.test.ts`](../tests/mcp-ssrf.test.ts)<br>[`tests/link-ssrf.test.ts`](../tests/link-ssrf.test.ts)<br>[`tests/product-import.test.ts`](../tests/product-import.test.ts) |  |
| Safe URL parsing and redirect validation | Done | [`src/lib/accounts/magic-token.ts`](../src/lib/accounts/magic-token.ts)<br>[`src/lib/safe-href.ts`](../src/lib/safe-href.ts)<br>[`tests/safe-href.test.ts`](../tests/safe-href.test.ts)<br>[`tests/redirect-aliases.test.ts`](../tests/redirect-aliases.test.ts) |  |
| Strict CORS configuration | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts)<br>[`src/app/api/v1/openapi.json/route.ts`](../src/app/api/v1/openapi.json/route.ts)<br>[`tests/fx-frame-headers.test.ts`](../tests/fx-frame-headers.test.ts) | No CORS on cookie routes; wildcard only on the bearer-only public API, the public runtime scripts and the embed loader. |
| No wildcard CORS with credentials | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts)<br>[`docs/api.md`](../docs/api.md) |  |
| Request body size limits | Done | [`src/proxy.ts`](../src/proxy.ts)<br>[`src/lib/create/platform/http.ts`](../src/lib/create/platform/http.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) | 64 MB edge cap on every /api request, then per-route caps (JSON 5 MB, forms 24 KB, webhooks 256 KB). |
| Query complexity and pagination limits | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts) | Every list is bounded (20,000 rows max, 50 sessions, paged chats); no client-controlled unbounded scan. |
| API rate limiting by user, tenant, endpoint, and resource | Done | [`src/lib/create/platform/ratelimit.ts`](../src/lib/create/platform/ratelimit.ts)<br>[`tests/rate-limit-audit.test.ts`](../tests/rate-limit-audit.test.ts) |  |
| Resource quotas to prevent abuse | Done | [`src/lib/create/platform/plans.ts`](../src/lib/create/platform/plans.ts)<br>[`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`tests/limits.test.ts`](../tests/limits.test.ts) |  |
| Timeouts for external requests | Done | [`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts)<br>[`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`src/lib/mcp/ssrf.ts`](../src/lib/mcp/ssrf.ts)<br>[`tests/product-import.test.ts`](../tests/product-import.test.ts) |  |
| Bounded retries with exponential backoff | Done | [`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts)<br>[`src/lib/inngest/functions.ts`](../src/lib/inngest/functions.ts)<br>[`src/lib/orchestration/http.ts`](../src/lib/orchestration/http.ts) | One delayed retry for the database, bounded provider retries with backoff, Inngest step retries. |
| Circuit breakers for unreliable dependencies | Done | [`src/lib/create/platform/breaker.ts`](../src/lib/create/platform/breaker.ts)<br>[`src/lib/orchestration/breaker-routing.ts`](../src/lib/orchestration/breaker-routing.ts)<br>[`src/lib/orchestration/model-status.ts`](../src/lib/orchestration/model-status.ts) |  |
| Idempotency keys for sensitive operations | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`src/lib/billing/studio-topup.ts`](../src/lib/billing/studio-topup.ts)<br>[`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`tests/studio-topup.test.ts`](../tests/studio-topup.test.ts) |  |
| Replay attack protection | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts)<br>[`src/lib/desktop-auth/core.ts`](../src/lib/desktop-auth/core.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) |  |
| Protection against mass assignment | Done | [`src/lib/accounts/workspaces.ts`](../src/lib/accounts/workspaces.ts)<br>[`src/app/api/preferences/route.ts`](../src/app/api/preferences/route.ts)<br>[`tests/projects-api.test.ts`](../tests/projects-api.test.ts) | Routes copy named fields into typed patches; request bodies are never spread into a row. |
| Explicit allowlists for writable fields | Done | [`src/app/api/preferences/route.ts`](../src/app/api/preferences/route.ts)<br>[`src/lib/accounts/workspaces.ts`](../src/lib/accounts/workspaces.ts) |  |
| Safe error handling without stack traces exposed to users | Done | [`src/lib/create/platform/http.ts`](../src/lib/create/platform/http.ts)<br>[`src/lib/ops/errors.ts`](../src/lib/ops/errors.ts)<br>[`tests/error-tracking.test.ts`](../tests/error-tracking.test.ts) |  |
| API versioning and deprecation controls | Done | [`src/app/api/v1/openapi.json/route.ts`](../src/app/api/v1/openapi.json/route.ts)<br>[`docs/api.md`](../docs/api.md)<br>[`docs/security-policy.md`](../docs/security-policy.md) |  |
| GraphQL depth and complexity limits, if applicable | Not applicable | [`docs/api.md`](../docs/api.md) | No GraphQL endpoint. |
| WebSocket origin and authorization validation | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts)<br>[`src/lib/security/origin.ts`](../src/lib/security/origin.ts)<br>[`tests/collab-crdt.test.ts`](../tests/collab-crdt.test.ts) |  |
| Secure webhook signature verification | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`src/app/api/business/stripe/webhook/route.ts`](../src/app/api/business/stripe/webhook/route.ts)<br>[`src/lib/business/connect-webhook.ts`](../src/lib/business/connect-webhook.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts)<br>[`tests/connect-webhook.test.ts`](../tests/connect-webhook.test.ts) |  |
| Webhook timestamp and replay validation | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) | Five-minute timestamp window and idempotency by webhook id; Stripe's SDK applies its own tolerance. |

<a id="frontend"></a>

## 5. Frontend and browser security

A strict CSP with exact vendor origins, HSTS preload, framing denied, sanitizer and link guards for user content, no secrets or source maps in the bundle.

24 items, 21 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Content Security Policy (CSP) | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| Nonce- or hash-based script restrictions where appropriate | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`src/lib/security/headers.ts`](../src/lib/security/headers.ts) | AR-1: per-render inline flight data makes nonces force dynamic rendering; review Jan 2027. |
| Trusted Types where supported and useful | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md) | AR-2: three.js, CodeMirror and KaTeX use DOM sinks internally; compensated by escaping, the sanitizer and the generated-app innerHTML rule. |
| Cross-site scripting (XSS) prevention | Done | [`src/lib/site-builder/sanitize.ts`](../src/lib/site-builder/sanitize.ts)<br>[`src/lib/safe-href.ts`](../src/lib/safe-href.ts)<br>[`tests/site-sanitize.test.ts`](../tests/site-sanitize.test.ts)<br>[`tests/fuzz-parsers.test.ts`](../tests/fuzz-parsers.test.ts) |  |
| Safe HTML sanitization when rendering user-provided markup | Done | [`src/lib/site-builder/sanitize.ts`](../src/lib/site-builder/sanitize.ts)<br>[`tests/site-sanitize.test.ts`](../tests/site-sanitize.test.ts) |  |
| Avoidance of unsafe `innerHTML` patterns | Done | [`src/components/seo/JsonLd.tsx`](../src/components/seo/JsonLd.tsx)<br>[`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`docs/security-policy.md`](../docs/security-policy.md) | dangerouslySetInnerHTML only for constants (JSON-LD, theme script); generated apps fail the no-unsafe-innerhtml check when markup is built from data. |
| Secure Markdown rendering | Done | [`src/lib/md-lines.ts`](../src/lib/md-lines.ts)<br>[`src/lib/safe-href.ts`](../src/lib/safe-href.ts)<br>[`tests/md-lines.test.ts`](../tests/md-lines.test.ts)<br>[`tests/safe-href.test.ts`](../tests/safe-href.test.ts) |  |
| Safe handling of rich-text editors | Done | [`src/lib/collab/transport.ts`](../src/lib/collab/transport.ts)<br>[`tests/collab-crdt.test.ts`](../tests/collab-crdt.test.ts) | No HTML rich-text editor: CodeMirror edits plain text and the CRDT carries text, rendered through the markdown renderer. |
| Protection against DOM-based XSS | Done | [`src/lib/safe-href.ts`](../src/lib/safe-href.ts)<br>[`tests/safe-href.test.ts`](../tests/safe-href.test.ts)<br>[`tests/fuzz-parsers.test.ts`](../tests/fuzz-parsers.test.ts) |  |
| Clickjacking protection using `frame-ancestors` | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| HTTPS enforcement | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | Vercel serves HTTPS only; CSP upgrade-insecure-requests; HSTS. |
| HTTP Strict Transport Security (HSTS) | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts)<br>[`next.config.ts`](../next.config.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| `X-Content-Type-Options: nosniff` | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| Appropriate `Referrer-Policy` | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts) |  |
| Appropriate `Permissions-Policy` | Done | [`src/lib/security/headers.ts`](../src/lib/security/headers.ts) |  |
| Safe `postMessage` origin checks | Done | [`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts)<br>[`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts) | Runner messages are parsed against a strict shape from a frame Keplar created; generated apps hold no postMessage listeners by construction. |
| Safe iframe sandboxing | Done | [`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts)<br>[`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts)<br>[`src/app/s/[slug]/[[...path]]/route.ts`](../src/app/s/[slug]/[[...path]]/route.ts) |  |
| External links protected against unsafe opener access | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) |  |
| Sensitive data excluded from browser caches | Done | [`src/lib/create/platform/http.ts`](../src/lib/create/platform/http.ts)<br>[`src/proxy.ts`](../src/proxy.ts) | Every /api response is no-store; shared answer pages and account pages are dynamic and no-store. |
| No API secrets embedded in frontend bundles | Done | [`tests/infra-config.test.ts`](../tests/infra-config.test.ts)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | NEXT_PUBLIC names are checked, and CI scans .next/static for credential patterns. |
| Source map publication policy | Done | [`next.config.ts`](../next.config.ts)<br>[`docs/security-policy.md`](../docs/security-policy.md) |  |
| Third-party script inventory and review | Done | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`src/lib/security/headers.ts`](../src/lib/security/headers.ts) |  |
| Subresource Integrity where practical | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md) | AR-3: vendor scripts are versionless; own scripts are same-origin content-hashed chunks. |
| Dependency security checks for frontend packages | Done | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`.github/workflows/dependency-review.yml`](../.github/workflows/dependency-review.yml)<br>[`.github/dependabot.yml`](../.github/dependabot.yml) |  |

<a id="database"></a>

## 6. Database and data protection

Neon Postgres over HTTPS, tenant-scoped rows, sealed secrets, scripted encrypted exports plus point-in-time restore, enforced retention and deletion.

26 items, 20 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Database encryption at rest | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`docs/security.md`](../docs/security.md) | Provider-managed (Neon); not independently verified, and the summary says so. |
| TLS for database connections | Done | [`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts) |  |
| Database credentials stored in a secret manager | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts) | Vercel encrypted environment variables marked Sensitive. |
| Separate database roles for application, migrations, and administration | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`scripts/backup-db.mjs`](../scripts/backup-db.mjs) | AR-5: backups use a separate read-only role; the app creates its own tables, so one app role today. |
| Row-level security where appropriate | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`docs/runbooks/backup-restore.md`](../docs/runbooks/backup-restore.md) | Tenant scoping is enforced by the store on every query; the document table carries RLS for the backup role boundary. |
| Tests verifying row-level security policies | Done | [`tests/account-scope.test.ts`](../tests/account-scope.test.ts)<br>[`tests/neon-store.test.ts`](../tests/neon-store.test.ts)<br>[`tests/daily-use-pg.test.ts`](../tests/daily-use-pg.test.ts) | Isolation is tested against an in-process Postgres (pglite) and the file store. |
| Database query tenant scoping | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`tests/account-scope.test.ts`](../tests/account-scope.test.ts) |  |
| Protection against cross-tenant joins and searches | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`tests/share-isolation.test.ts`](../tests/share-isolation.test.ts) |  |
| Encrypted backups | Done | [`scripts/backup-db.mjs`](../scripts/backup-db.mjs)<br>[`tests/backup-script.test.ts`](../tests/backup-script.test.ts) | AES-256-GCM with a scrypt-derived key when BACKUP_PASSPHRASE is set; the runbook requires it. |
| Backup access restrictions | Policy | [`docs/runbooks/backup-restore.md`](../docs/runbooks/backup-restore.md) | Off-site, passphrase kept apart from the file, never on Vercel or in git. |
| Tested backup restoration | Policy | [`docs/runbooks/backup-restore.md`](../docs/runbooks/backup-restore.md)<br>[`tests/backup-script.test.ts`](../tests/backup-script.test.ts) | The restore path is tested against a fake database; the quarterly drill into a scratch Neon branch is an owner task whose date is recorded in the runbook (not yet held). |
| Point-in-time recovery | Done | [`docs/runbooks/backup-restore.md`](../docs/runbooks/backup-restore.md) | Neon point-in-time restore and branching. |
| Data retention policies | Done | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/ops/retention.ts`](../src/lib/ops/retention.ts) |  |
| Automated deletion of expired data | Done | [`src/lib/ops/retention.ts`](../src/lib/ops/retention.ts)<br>[`src/lib/privacy/deletion.ts`](../src/lib/privacy/deletion.ts)<br>[`tests/retention.test.ts`](../tests/retention.test.ts)<br>[`tests/deletion-grace.test.ts`](../tests/deletion-grace.test.ts) |  |
| Secure account and workspace deletion | Done | [`src/lib/privacy/account-data.ts`](../src/lib/privacy/account-data.ts)<br>[`src/lib/team/store.ts`](../src/lib/team/store.ts)<br>[`tests/privacy.test.ts`](../tests/privacy.test.ts)<br>[`tests/site-delete.test.ts`](../tests/site-delete.test.ts) |  |
| Sensitive field encryption where needed | Done | [`src/lib/mcp/crypto.ts`](../src/lib/mcp/crypto.ts)<br>[`tests/secrets-audit.test.ts`](../tests/secrets-audit.test.ts) |  |
| Encryption key separation from encrypted data | Done | [`src/lib/mcp/crypto.ts`](../src/lib/mcp/crypto.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | Key material lives in Vercel's env; ciphertext lives in Neon; AAD binds each blob to its workspace and row. |
| Key management through a KMS or equivalent | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md) | AR-6: HKDF-derived keys from a Sensitive env secret instead of a KMS; review Jul 2027. |
| Encryption key rotation procedures | Policy | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md) | Rotation order and blast radius are written down (BETTER_AUTH_SECRET rotation signs everyone out and needs connector re-authorization); a software rotation would have to re-seal every token, which is scheduled with the KMS review (AR-6). |
| Data classification by sensitivity | Done | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/privacy-inventory.md`](../docs/privacy-inventory.md) |  |
| Data minimization | Done | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/traffic/visits.ts`](../src/lib/traffic/visits.ts)<br>[`tests/privacy.test.ts`](../tests/privacy.test.ts) | No raw IPs stored, cookie-free visit counts, content-free analytics, attachments never stored for Ask. |
| No production customer data in development environments without appropriate safeguards | Done | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`tests/setup.ts`](../tests/setup.ts) | Development uses the file store and dev tools; preview deployments have their own variables. |
| Database migration rollback plans | Policy | [`docs/runbooks/rollback.md`](../docs/runbooks/rollback.md)<br>[`docs/runbooks/backup-restore.md`](../docs/runbooks/backup-restore.md) | Schema changes are additive (CREATE IF NOT EXISTS); a Neon branch is taken before any risky change. |
| Protection against unbounded database queries | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts) |  |
| Monitoring for unusual data access | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/app/admin/security/page.tsx`](../src/app/admin/security/page.tsx)<br>[`tests/security-events.test.ts`](../tests/security-events.test.ts) | Export, secret-access and authorization-failure counts alert the owner past thresholds. |
| Prevention of accidental public database exposure | Done | [`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts)<br>[`src/lib/ops/health.ts`](../src/lib/ops/health.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | No public listener; credentials over TLS only; health reports booleans, never connection details. |

<a id="uploads"></a>

## 7. File upload and storage security

Types decided by bytes, structural malware checks and an optional scanner, unguessable ids, sandboxed serving, no uploads in code paths.

22 items, 19 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Maximum upload size limits | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`src/lib/orchestration/media.ts`](../src/lib/orchestration/media.ts)<br>[`tests/app-runtime.test.ts`](../tests/app-runtime.test.ts) |  |
| Allowed file-type policies | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`src/lib/orchestration/media.ts`](../src/lib/orchestration/media.ts) |  |
| Actual file content validation, not just extensions | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`src/lib/orchestration/media.ts`](../src/lib/orchestration/media.ts)<br>[`tests/app-runtime.test.ts`](../tests/app-runtime.test.ts) |  |
| Malicious file scanning | Done | [`src/lib/security/upload-scan.ts`](../src/lib/security/upload-scan.ts)<br>[`tests/upload-scan.test.ts`](../tests/upload-scan.test.ts) | Structural checks always; an external scanner when KEPLAR_MALWARE_SCAN_URL is set (fail-closed with KEPLAR_MALWARE_SCAN_REQUIRED). |
| Safe file naming | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts) |  |
| Randomized storage identifiers | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`docs/security.md`](../docs/security.md) |  |
| Prevention of directory traversal | Done | [`src/lib/create/platform/blob.ts`](../src/lib/create/platform/blob.ts)<br>[`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`tests/blob.test.ts`](../tests/blob.test.ts) |  |
| Protection against decompression bombs | Done | [`src/lib/security/upload-scan.ts`](../src/lib/security/upload-scan.ts)<br>[`src/lib/attachments/zip.ts`](../src/lib/attachments/zip.ts)<br>[`docs/security.md`](../docs/security.md) |  |
| Archive extraction limits | Done | [`src/lib/attachments/zip.ts`](../src/lib/attachments/zip.ts)<br>[`tests/attachments-parsers.test.ts`](../tests/attachments-parsers.test.ts) |  |
| File count and nesting-depth limits | Done | [`src/lib/attachments/zip.ts`](../src/lib/attachments/zip.ts)<br>[`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts) |  |
| Private storage buckets by default | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | Bytes live in Postgres per app and environment, never in a public bucket; served only through the app. |
| Server-side authorization for file access | Done | [`src/lib/app-runtime/router.ts`](../src/lib/app-runtime/router.ts)<br>[`docs/security.md`](../docs/security.md) |  |
| Short-lived signed download URLs | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts) | Files are served through the app by 120-bit random ids under a sandbox CSP; drafts use per-build tokens. Signed URLs are not needed while no object store is public. |
| Signed URL scope and expiration controls | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md) | See above; revisit when R2 is wired. |
| Prevention of public file enumeration | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`src/lib/app-runtime/router.ts`](../src/lib/app-runtime/router.ts) | No listing endpoint; ids are unguessable. |
| Safe handling of SVG uploads | Done | [`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`src/lib/security/upload-scan.ts`](../src/lib/security/upload-scan.ts) | SVG and any XML/HTML text are refused as uploads; generated SVG files are served sandboxed. |
| Isolation of user-generated HTML and active content | Done | [`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts)<br>[`src/app/s/[slug]/[[...path]]/route.ts`](../src/app/s/[slug]/[[...path]]/route.ts)<br>[`src/proxy.ts`](../src/proxy.ts) |  |
| Appropriate `Content-Disposition` headers | Done | [`src/lib/app-runtime/router.ts`](../src/lib/app-runtime/router.ts) |  |
| Secure deletion and lifecycle policies | Done | [`src/lib/site-builder/deletion.ts`](../src/lib/site-builder/deletion.ts)<br>[`src/lib/privacy/account-data.ts`](../src/lib/privacy/account-data.ts)<br>[`tests/site-delete.test.ts`](../tests/site-delete.test.ts) |  |
| File metadata sanitization where necessary | Done | [`docs/security.md`](../docs/security.md)<br>[`src/lib/site-builder/product/image.ts`](../src/lib/site-builder/product/image.ts) | JPEG GPS data is stripped from imported product photos; uploads are served under a sandbox CSP with nosniff. |
| No executable uploads in application code directories | Done | [`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts)<br>[`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts) | Uploads are data rows; app code files are model output limited to html, css, js, json and svg under APP_FILE. |
| Malware quarantine and review procedures | Policy | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts) | Refused files are never stored; each refusal is an upload.rejected event and bursts alert the owner. |

<a id="cloud"></a>

## 8. Cloud and infrastructure security

Serverless on Vercel with Neon; configuration is code and is tested; no containers or clusters of Keplar's own.

27 items, 13 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Infrastructure as code | Done | [`vercel.json`](../vercel.json)<br>[`next.config.ts`](../next.config.ts)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`tests/infra-config.test.ts`](../tests/infra-config.test.ts) |  |
| Infrastructure security scanning | Done | [`tests/infra-config.test.ts`](../tests/infra-config.test.ts)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |  |
| Least-privilege cloud IAM | Policy | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`docs/security-policy.md`](../docs/security-policy.md) | Per-purpose tokens, quarterly permission review. |
| Separate development, staging, and production environments | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`scripts/build-guard.mjs`](../scripts/build-guard.mjs)<br>[`next.config.ts`](../next.config.ts) | Vercel Production, Preview (noindex, own variables) and local development. |
| No public administrative dashboards | Done | [`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) |  |
| Private networking for internal services | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | Serverless: no internal network exists; the database is reached only with a credential over TLS. |
| Firewall and security group restrictions | Done | [`src/proxy.ts`](../src/proxy.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | Vercel's platform layer plus strict host handling in the edge proxy. |
| Network segmentation | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No network of Keplar's own; sandboxes are isolated per job by the platform. |
| DDoS protection | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`src/proxy.ts`](../src/proxy.ts)<br>[`src/lib/create/platform/breaker.ts`](../src/lib/create/platform/breaker.ts) |  |
| Web application firewall where appropriate | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | AR-7: no custom WAF rules on the current plan; Attack Challenge Mode is available during an attack. |
| Secure DNS configuration | Policy | [`docs/infrastructure.md`](../docs/infrastructure.md) | Vercel-managed records; SPF, DKIM, DMARC for mail; CAA is a quarterly owner check. |
| TLS certificate management and renewal | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`src/lib/domains/routing.ts`](../src/lib/domains/routing.ts)<br>[`tests/domains.test.ts`](../tests/domains.test.ts) |  |
| Container image scanning | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No containers. |
| Non-root containers | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No containers. |
| Read-only container filesystems where feasible | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No containers. |
| Linux capability restrictions | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No containers; sandbox machines are platform-isolated microVMs. |
| Seccomp/AppArmor or equivalent sandboxing | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | Firecracker microVM isolation is the sandbox boundary (Vercel Sandbox). |
| No privileged containers without exceptional justification | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No containers. |
| Cloud metadata endpoint protections | Done | [`src/lib/mcp/ssrf.ts`](../src/lib/mcp/ssrf.ts)<br>[`tests/mcp-ssrf.test.ts`](../tests/mcp-ssrf.test.ts) |  |
| Workload identity instead of long-lived cloud credentials | Accepted risk | [`docs/security-policy.md`](../docs/security-policy.md) | AR-8: providers in use offer no OIDC federation for Vercel functions. |
| Secure service-to-service authentication | Done | [`src/app/api/cron/core/route.ts`](../src/app/api/cron/core/route.ts)<br>[`tests/infra-config.test.ts`](../tests/infra-config.test.ts)<br>[`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts) |  |
| Kubernetes RBAC and admission policies if applicable | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No Kubernetes. |
| Restriction of unnecessary outbound network traffic | Done | [`src/lib/mcp/ssrf.ts`](../src/lib/mcp/ssrf.ts)<br>[`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) |  |
| Security patch management | Done | [`.github/dependabot.yml`](../.github/dependabot.yml)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`docs/security-policy.md`](../docs/security-policy.md) |  |
| Infrastructure configuration drift detection | Done | [`scripts/build-guard.mjs`](../scripts/build-guard.mjs)<br>[`tests/deploy-guard.test.ts`](../tests/deploy-guard.test.ts)<br>[`tests/infra-config.test.ts`](../tests/infra-config.test.ts)<br>[`scripts/smoke-prod.mjs`](../scripts/smoke-prod.mjs) |  |
| Secure infrastructure teardown | Policy | [`docs/infrastructure.md`](../docs/infrastructure.md) | A documented sequence (revoke tokens, delete sandboxes and snapshots, export and delete the database, remove DNS and the project) that a person runs; nothing is automated because teardown is rare and irreversible. |
| Cloud audit logging | Done | [`src/lib/ops/audit.ts`](../src/lib/ops/audit.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | Keplar's own audit and security logs plus Vercel's and GitHub's activity logs. |

<a id="secrets"></a>

## 9. Secrets and API key management

Everything in Vercel's encrypted env; scanned in source, CI and build output; sealed at rest; never logged, never prompted.

20 items, 18 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Centralized secrets manager | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`docs/security-policy.md`](../docs/security-policy.md) |  |
| No hardcoded production credentials | Done | [`scripts/secret-scan.mjs`](../scripts/secret-scan.mjs)<br>[`tests/secret-scan.test.ts`](../tests/secret-scan.test.ts) |  |
| Secret scanning in source control | Done | [`scripts/secret-scan.mjs`](../scripts/secret-scan.mjs)<br>`github:secret_scanning=enabled`<br>`github:push_protection=enabled` |  |
| Secret scanning in CI/CD | Done | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`scripts/verify.mjs`](../scripts/verify.mjs) |  |
| Secret scanning in build artifacts | Done | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`scripts/secret-scan.mjs`](../scripts/secret-scan.mjs) |  |
| Secret rotation | Policy | [`docs/security-policy.md`](../docs/security-policy.md) | Yearly or on suspicion for provider and webhook secrets, on compromise for the auth secret; the calendar and the order of operations are written down. Providers offer no rotation API Keplar could drive safely. |
| Immediate credential revocation procedures | Policy | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md) | The runbook lists every credential, where to rotate it and in which order (provider first, then Vercel, then redeploy). |
| Separate credentials per environment | Done | [`docs/infrastructure.md`](../docs/infrastructure.md) | Production, Preview and Development variable sets in Vercel. |
| Separate credentials per integration where feasible | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`src/lib/accounts/oauth.ts`](../src/lib/accounts/oauth.ts) |  |
| Least-privilege API scopes | Done | [`src/lib/api/policy.ts`](../src/lib/api/policy.ts)<br>[`docs/connectors.md`](../docs/connectors.md) |  |
| Short-lived credentials where supported | Done | [`src/lib/accounts/action-token.ts`](../src/lib/accounts/action-token.ts)<br>[`src/lib/business/handoff.ts`](../src/lib/business/handoff.ts)<br>[`src/lib/desktop-auth/core.ts`](../src/lib/desktop-auth/core.ts) |  |
| Secure credential injection at runtime | Done | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`src/lib/create/platform/neon.ts`](../src/lib/create/platform/neon.ts) |  |
| Protection against secrets leaking into logs | Done | [`tests/secrets-audit.test.ts`](../tests/secrets-audit.test.ts)<br>[`src/lib/ops/log.ts`](../src/lib/ops/log.ts) |  |
| Protection against secrets leaking into AI prompts | Done | [`src/lib/mcp/sanitize.ts`](../src/lib/mcp/sanitize.ts)<br>[`src/lib/business/firewall.ts`](../src/lib/business/firewall.ts)<br>[`tests/draft-safety.test.ts`](../tests/draft-safety.test.ts) |  |
| Protection against secrets leaking into crash reports | Done | [`src/lib/ops/errors.ts`](../src/lib/ops/errors.ts)<br>[`tests/error-tracking.test.ts`](../tests/error-tracking.test.ts) |  |
| No secrets in client-side JavaScript | Done | [`tests/infra-config.test.ts`](../tests/infra-config.test.ts)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |  |
| No secrets in public environment variables | Done | [`tests/infra-config.test.ts`](../tests/infra-config.test.ts)<br>[`docs/security.md`](../docs/security.md) |  |
| Secure handling of OAuth refresh tokens | Done | [`src/lib/mcp/crypto.ts`](../src/lib/mcp/crypto.ts)<br>[`tests/secrets-audit.test.ts`](../tests/secrets-audit.test.ts) |  |
| User-facing integration disconnect and revocation | Done | [`src/lib/business/oauth-connectors.ts`](../src/lib/business/oauth-connectors.ts)<br>[`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`tests/connectors-oauth.test.ts`](../tests/connectors-oauth.test.ts) |  |
| Auditable secret access | Done | [`src/lib/mcp/crypto.ts`](../src/lib/mcp/crypto.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/app/admin/security/page.tsx`](../src/app/admin/security/page.tsx) |  |

<a id="payments"></a>

## 10. Payments and subscription security

Whop-hosted checkout for Keplar One plans and Stripe for Business sellers; signed, idempotent webhooks; server-side entitlements and atomic credits.

27 items, 26 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Payment provider-hosted checkout or other appropriately compliant payment flow | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`src/lib/billing/embed.ts`](../src/lib/billing/embed.ts)<br>[`src/lib/billing/stripe.ts`](../src/lib/billing/stripe.ts) |  |
| No unnecessary storage of card information | Done | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts) |  |
| PCI DSS scope assessment | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`docs/security-policy.md`](../docs/security-policy.md) | Card data never touches Keplar (hosted checkout and Stripe-hosted bank linking): SAQ A scope. |
| Verified payment webhook signatures | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`src/app/api/business/stripe/webhook/route.ts`](../src/app/api/business/stripe/webhook/route.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) |  |
| Webhook replay protection | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) |  |
| Idempotent payment event processing | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) |  |
| Duplicate webhook handling | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/billing-lifecycle.test.ts`](../tests/billing-lifecycle.test.ts) |  |
| Out-of-order webhook handling | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/billing-lifecycle.test.ts`](../tests/billing-lifecycle.test.ts) | Each event is applied against the stored billing state; a late activation never resurrects a cancelled membership. |
| Subscription status verified server-side | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`src/lib/accounts/workspaces.ts`](../src/lib/accounts/workspaces.ts) |  |
| Entitlements managed server-side | Done | [`src/lib/create/platform/plans.ts`](../src/lib/create/platform/plans.ts)<br>[`src/lib/orchestration/plans.ts`](../src/lib/orchestration/plans.ts)<br>[`tests/limits.test.ts`](../tests/limits.test.ts) |  |
| No trust in frontend subscription flags | Done | [`src/lib/billing/plan-cookie.ts`](../src/lib/billing/plan-cookie.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) | The plan cookie is HMAC-signed, bound to the email and expires with the period; the database row is authoritative. |
| No trust in frontend-reported payment amounts | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`src/lib/billing/studio-topup.ts`](../src/lib/billing/studio-topup.ts)<br>[`tests/studio-topup.test.ts`](../tests/studio-topup.test.ts) |  |
| Price and plan IDs validated against server-side configuration | Done | [`src/lib/billing/plans.ts`](../src/lib/billing/plans.ts)<br>[`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) |  |
| Subscription cancellation enforcement | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/billing-lifecycle.test.ts`](../tests/billing-lifecycle.test.ts) |  |
| Refund and chargeback handling | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`src/lib/billing/studio-topup.ts`](../src/lib/billing/studio-topup.ts)<br>[`tests/whop.test.ts`](../tests/whop.test.ts) |  |
| Failed-payment grace period rules | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/billing-lifecycle.test.ts`](../tests/billing-lifecycle.test.ts) |  |
| Prevention of repeated free-trial abuse | Done | [`src/lib/privacy/free-gate.ts`](../src/lib/privacy/free-gate.ts)<br>[`src/lib/accounts/persist.ts`](../src/lib/accounts/persist.ts)<br>[`tests/free-plan.test.ts`](../tests/free-plan.test.ts) | Per-IP and per-browser daily caps, deleted-login tombstones, verified email required for anything beyond Free. |
| Prevention of credit balance manipulation | Done | [`src/lib/create/platform/usage.ts`](../src/lib/create/platform/usage.ts)<br>[`src/lib/usage/daily.ts`](../src/lib/usage/daily.ts)<br>[`tests/usage-windows.test.ts`](../tests/usage-windows.test.ts) |  |
| Atomic credit deductions | Done | [`src/lib/usage/daily.ts`](../src/lib/usage/daily.ts)<br>[`tests/daily-use-pg.test.ts`](../tests/daily-use-pg.test.ts) |  |
| Transactional credit ledger | Done | [`src/lib/create/platform/usage.ts`](../src/lib/create/platform/usage.ts)<br>[`src/lib/ops/retention.ts`](../src/lib/ops/retention.ts)<br>[`tests/usage-windows.test.ts`](../tests/usage-windows.test.ts) |  |
| Protection against concurrent double spending | Done | [`src/lib/usage/daily.ts`](../src/lib/usage/daily.ts)<br>[`src/lib/billing/studio-topup.ts`](../src/lib/billing/studio-topup.ts)<br>[`tests/daily-use-pg.test.ts`](../tests/daily-use-pg.test.ts) |  |
| Usage reconciliation | Done | [`src/lib/billing/admin.ts`](../src/lib/billing/admin.ts)<br>[`tests/billing-audit.test.ts`](../tests/billing-audit.test.ts)<br>[`tests/cost-meter.test.ts`](../tests/cost-meter.test.ts) |  |
| Spending limits | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/create/platform/spend.ts`](../src/lib/create/platform/spend.ts)<br>[`tests/rate-limit-audit.test.ts`](../tests/rate-limit-audit.test.ts) |  |
| Billing administrator permissions | Done | [`src/lib/team/policy.ts`](../src/lib/team/policy.ts)<br>[`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`tests/team.test.ts`](../tests/team.test.ts) |  |
| Invoice and billing record access controls | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) | The manage URL and billing status belong to the workspace; Whop hosts invoices behind the customer's own login. |
| Payment event audit logs | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`tests/billing-audit.test.ts`](../tests/billing-audit.test.ts) |  |
| Periodic reconciliation with the payment provider | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`src/app/api/billing/sync/route.ts`](../src/app/api/billing/sync/route.ts)<br>[`docs/security-policy.md`](../docs/security-policy.md) | On-demand sync against Whop plus the monthly review in the policy calendar. |

<a id="ai"></a>

## 11. AI and LLM security

Untrusted text fenced and sanitized; models never hold credentials; actions pass a deterministic firewall and approvals; budgets and step caps bound every run.

32 items, 32 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Prompt injection defenses | Done | [`src/lib/mcp/sanitize.ts`](../src/lib/mcp/sanitize.ts)<br>[`src/lib/documents/guard.ts`](../src/lib/documents/guard.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md) |  |
| Clear separation of trusted instructions and untrusted content | Done | [`src/lib/documents/guard.ts`](../src/lib/documents/guard.ts)<br>[`src/lib/mcp/sanitize.ts`](../src/lib/mcp/sanitize.ts)<br>[`src/lib/business/draft-safety.ts`](../src/lib/business/draft-safety.ts) |  |
| Untrusted webpage content treated as data, not authority | Done | [`src/lib/attachments/link.ts`](../src/lib/attachments/link.ts)<br>[`src/lib/business/firewall.ts`](../src/lib/business/firewall.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md) | Read pages inform answers only; any proposed action still passes the Firewall and approvals. |
| Untrusted repository instructions treated as data unless explicitly authorized | Done | [`src/lib/mcp/sanitize.ts`](../src/lib/mcp/sanitize.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md) |  |
| Tool output validation | Done | [`src/lib/mcp/schema.ts`](../src/lib/mcp/schema.ts)<br>[`src/lib/mcp/sanitize.ts`](../src/lib/mcp/sanitize.ts)<br>[`tests/mcp-gateway.test.ts`](../tests/mcp-gateway.test.ts) |  |
| Protection against indirect prompt injection | Done | [`src/lib/mcp/sanitize.ts`](../src/lib/mcp/sanitize.ts)<br>[`src/lib/business/draft-safety.ts`](../src/lib/business/draft-safety.ts)<br>[`tests/draft-safety.test.ts`](../tests/draft-safety.test.ts) |  |
| Protection against malicious retrieved documents | Done | [`src/lib/documents/guard.ts`](../src/lib/documents/guard.ts)<br>[`tests/chat-docs.test.ts`](../tests/chat-docs.test.ts) |  |
| Prevention of system prompt and secret leakage | Done | [`src/lib/business/firewall.ts`](../src/lib/business/firewall.ts)<br>[`tests/secrets-audit.test.ts`](../tests/secrets-audit.test.ts)<br>[`tests/draft-safety.test.ts`](../tests/draft-safety.test.ts) |  |
| No API credentials exposed to models unless strictly necessary | Done | [`src/lib/mcp/crypto.ts`](../src/lib/mcp/crypto.ts)<br>[`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts) | Tokens are opened inside the request builder only; prompts never contain them. |
| AI tool allowlists | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`src/lib/api/tools.ts`](../src/lib/api/tools.ts)<br>[`tests/mcp-gateway.test.ts`](../tests/mcp-gateway.test.ts) |  |
| Tool-specific authorization checks | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`src/lib/business/firewall.ts`](../src/lib/business/firewall.ts)<br>[`tests/firewall.test.ts`](../tests/firewall.test.ts) |  |
| Human approval for high-impact actions | Done | [`src/lib/business/agents.ts`](../src/lib/business/agents.ts)<br>[`src/lib/mcp/chat.ts`](../src/lib/mcp/chat.ts)<br>[`tests/agent-chat-flow.test.ts`](../tests/agent-chat-flow.test.ts) |  |
| Restricted agent permissions | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`src/lib/business/agents.ts`](../src/lib/business/agents.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md) |  |
| Sandboxed AI-generated code execution | Done | [`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts)<br>[`src/lib/core/sandbox.ts`](../src/lib/core/sandbox.ts)<br>[`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts) |  |
| Network egress controls for agents | Done | [`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts)<br>[`src/lib/mcp/ssrf.ts`](../src/lib/mcp/ssrf.ts) |  |
| Filesystem access restrictions for agents | Done | [`docs/agent-security.md`](../docs/agent-security.md)<br>[`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts) | No agent has filesystem or shell access on Keplar's servers. |
| Maximum execution duration | Done | [`src/lib/mcp/chat.ts`](../src/lib/mcp/chat.ts)<br>[`src/lib/business/computer.ts`](../src/lib/business/computer.ts)<br>[`src/lib/app-builder/pipeline.ts`](../src/lib/app-builder/pipeline.ts) |  |
| Maximum model token consumption | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/orchestration/live-budget.ts`](../src/lib/orchestration/live-budget.ts) |  |
| Maximum spending per task | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/create/platform/spend.ts`](../src/lib/create/platform/spend.ts)<br>[`tests/rate-limit-audit.test.ts`](../tests/rate-limit-audit.test.ts) |  |
| Maximum number of tool calls | Done | [`src/lib/mcp/chat.ts`](../src/lib/mcp/chat.ts)<br>[`src/lib/browser/policy.ts`](../src/lib/browser/policy.ts)<br>[`tests/mcp-chat.test.ts`](../tests/mcp-chat.test.ts) |  |
| Maximum retry and recursion depth | Done | [`src/lib/mcp/chat.ts`](../src/lib/mcp/chat.ts)<br>[`src/lib/app-builder/pipeline.ts`](../src/lib/app-builder/pipeline.ts)<br>[`src/lib/roblox-cloud/model.ts`](../src/lib/roblox-cloud/model.ts) |  |
| Protection against infinite agent loops | Done | [`src/lib/browser/run.ts`](../src/lib/browser/run.ts)<br>[`src/lib/roblox-cloud/worker.ts`](../src/lib/roblox-cloud/worker.ts)<br>[`tests/browser-agent.test.ts`](../tests/browser-agent.test.ts) |  |
| Model output schema validation | Done | [`src/lib/app-builder/verify/review.ts`](../src/lib/app-builder/verify/review.ts)<br>[`src/lib/mcp/schema.ts`](../src/lib/mcp/schema.ts)<br>[`tests/app-builder.test.ts`](../tests/app-builder.test.ts) |  |
| Verification before executing model-generated commands | Done | [`tests/studio-agent.test.ts`](../tests/studio-agent.test.ts)<br>[`src/lib/business/firewall.ts`](../src/lib/business/firewall.ts)<br>[`src/lib/app-builder/verify/static.ts`](../src/lib/app-builder/verify/static.ts) |  |
| Sensitive data redaction before model calls | Done | [`src/lib/business/draft-safety.ts`](../src/lib/business/draft-safety.ts)<br>[`src/lib/mcp/sanitize.ts`](../src/lib/mcp/sanitize.ts)<br>[`tests/draft-safety.test.ts`](../tests/draft-safety.test.ts) |  |
| Explicit controls for sending data to third-party models | Done | [`src/lib/privacy/training-statement.ts`](../src/lib/privacy/training-statement.ts)<br>[`tests/free-privacy.test.ts`](../tests/free-privacy.test.ts)<br>[`tests/training-statement.test.ts`](../tests/training-statement.test.ts) |  |
| Model provider retention and training policy review | Done | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/privacy/training-statement.ts`](../src/lib/privacy/training-statement.ts) |  |
| AI-generated code security testing | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`src/lib/app-builder/verify/static.ts`](../src/lib/app-builder/verify/static.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) |  |
| Model output evaluation against malicious inputs | Done | [`tests/studio-agent.test.ts`](../tests/studio-agent.test.ts)<br>[`tests/draft-safety.test.ts`](../tests/draft-safety.test.ts)<br>[`tests/firewall.test.ts`](../tests/firewall.test.ts)<br>[`tests/fuzz-parsers.test.ts`](../tests/fuzz-parsers.test.ts) |  |
| Monitoring for abnormal agent behavior | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/lib/ops/telemetry.ts`](../src/lib/ops/telemetry.ts)<br>[`src/app/admin/security/page.tsx`](../src/app/admin/security/page.tsx) |  |
| AI action audit trails | Done | [`src/lib/business/repo.ts`](../src/lib/business/repo.ts)<br>[`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts) |  |
| Emergency agent shutdown | Done | [`src/lib/ops/controls.ts`](../src/lib/ops/controls.ts)<br>[`tests/controls.test.ts`](../tests/controls.test.ts) |  |

<a id="agents"></a>

## 12. Autonomous agent security

Every action is tied to a workspace and a user, checked per tool, bounded by budgets, approved for anything that reaches the world, logged, and stoppable.

36 items, 36 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Every agent action tied to an authenticated user or authorized service identity | Done | [`src/lib/business/agents.ts`](../src/lib/business/agents.ts)<br>[`src/lib/create/platform/workspace.ts`](../src/lib/create/platform/workspace.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) |  |
| Explicit user authorization for the requested outcome | Done | [`src/lib/business/agents.ts`](../src/lib/business/agents.ts)<br>[`src/lib/mcp/chat.ts`](../src/lib/mcp/chat.ts)<br>[`tests/agent-chat-flow.test.ts`](../tests/agent-chat-flow.test.ts) |  |
| Separate permission checks for individual tools | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`tests/mcp-gateway.test.ts`](../tests/mcp-gateway.test.ts) |  |
| Scoped, expiring execution credentials | Done | [`src/lib/mcp/crypto.ts`](../src/lib/mcp/crypto.ts)<br>[`src/lib/business/handoff.ts`](../src/lib/business/handoff.ts)<br>[`src/lib/api/keys.ts`](../src/lib/api/keys.ts) |  |
| No unrestricted access to the host operating system | Done | [`docs/agent-security.md`](../docs/agent-security.md)<br>[`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts) |  |
| Sandboxed code execution with resource limits | Done | [`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts)<br>[`src/lib/blender-cloud/machine.ts`](../src/lib/blender-cloud/machine.ts) |  |
| Isolated execution environments per user or task | Done | [`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts)<br>[`docs/architecture-cloud.md`](../docs/architecture-cloud.md) |  |
| Isolation between customer projects | Done | [`src/lib/create/platform/store.ts`](../src/lib/create/platform/store.ts)<br>[`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts)<br>[`tests/account-scope.test.ts`](../tests/account-scope.test.ts) |  |
| Restriction of arbitrary shell commands | Done | [`src/lib/blender-cloud/machine.ts`](../src/lib/blender-cloud/machine.ts)<br>[`tests/studio-agent.test.ts`](../tests/studio-agent.test.ts) |  |
| Restriction of arbitrary outbound requests | Done | [`src/lib/mcp/ssrf.ts`](../src/lib/mcp/ssrf.ts)<br>[`src/lib/sandbox/runner.ts`](../src/lib/sandbox/runner.ts) |  |
| Protection against agent-initiated SSRF | Done | [`src/lib/mcp/ssrf.ts`](../src/lib/mcp/ssrf.ts)<br>[`tests/mcp-ssrf.test.ts`](../tests/mcp-ssrf.test.ts) |  |
| Approval gates for purchases, payments, and transfers | Done | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md) | No agent can pay: checkout is provider-hosted and user-driven; Business orders are placed by buyers on the seller's site. |
| Approval gates for destructive operations | Done | [`tests/studio-agent.test.ts`](../tests/studio-agent.test.ts)<br>[`src/lib/business/agents.ts`](../src/lib/business/agents.ts) |  |
| Approval gates for external publication | Done | [`src/lib/site-builder/store.ts`](../src/lib/site-builder/store.ts)<br>[`src/app/api/deploy/[id]/route.ts`](../src/app/api/deploy/[id]/route.ts) | Sites and apps go live only on the owner's explicit publish. |
| Approval gates for sending messages on a user's behalf | Done | [`src/lib/business/firewall.ts`](../src/lib/business/firewall.ts)<br>[`src/lib/business/agents.ts`](../src/lib/business/agents.ts)<br>[`tests/firewall.test.ts`](../tests/firewall.test.ts) |  |
| Approval gates for production deployment | Done | [`scripts/build-guard.mjs`](../scripts/build-guard.mjs)<br>[`docs/security-policy.md`](../docs/security-policy.md) | Keplar's own production changes come from merged pull requests and stamped deploys; no agent has deploy credentials. |
| Approval gates for permission changes | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md) | Tool classes, auto-run flags and budgets are owner-edited rows with no tool API. |
| Maximum monetary spending per execution | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/mcp/limits.ts`](../src/lib/mcp/limits.ts) |  |
| Per-user and per-organization spending budgets | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/orchestration/plans.ts`](../src/lib/orchestration/plans.ts)<br>[`tests/rate-limit-audit.test.ts`](../tests/rate-limit-audit.test.ts) |  |
| Tool call logging | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`src/lib/business/repo.ts`](../src/lib/business/repo.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts) |  |
| Durable execution state | Done | [`src/lib/create/platform/jobs.ts`](../src/lib/create/platform/jobs.ts)<br>[`src/lib/core/jobs.ts`](../src/lib/core/jobs.ts)<br>[`src/lib/inngest/functions.ts`](../src/lib/inngest/functions.ts) |  |
| Cancellation support | Done | [`src/lib/create/platform/jobs.ts`](../src/lib/create/platform/jobs.ts)<br>[`src/lib/ops/controls.ts`](../src/lib/ops/controls.ts) |  |
| Emergency stop controls | Done | [`src/lib/ops/controls.ts`](../src/lib/ops/controls.ts)<br>[`tests/controls.test.ts`](../tests/controls.test.ts) |  |
| Checkpointing and safe resumption | Done | [`src/lib/core/jobs.ts`](../src/lib/core/jobs.ts)<br>[`src/lib/inngest/functions.ts`](../src/lib/inngest/functions.ts)<br>[`src/app/api/cron/core/route.ts`](../src/app/api/cron/core/route.ts) |  |
| Prevention of duplicated side effects after retries | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`src/lib/billing/studio-topup.ts`](../src/lib/billing/studio-topup.ts)<br>[`src/lib/inngest/functions.ts`](../src/lib/inngest/functions.ts) |  |
| Idempotency for real-world actions where supported | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts) |  |
| Verification of external action results | Done | [`src/lib/business/connectors.ts`](../src/lib/business/connectors.ts)<br>[`docs/security.md`](../docs/security.md) | A provider reply that is not a confirmed success is reported as an error. |
| Evidence-backed completion reports | Done | [`src/lib/app-builder/verify/smoke.ts`](../src/lib/app-builder/verify/smoke.ts)<br>[`src/lib/app-builder/verify/review.ts`](../src/lib/app-builder/verify/review.ts)<br>[`src/lib/browser/run.ts`](../src/lib/browser/run.ts) |  |
| No fabricated execution success | Done | [`src/lib/business/connectors.ts`](../src/lib/business/connectors.ts)<br>[`tests/connectors-honesty.test.ts`](../tests/connectors-honesty.test.ts) |  |
| Protection against agents modifying their own authorization policies | Done | [`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md)<br>[`tests/firewall.test.ts`](../tests/firewall.test.ts) |  |
| Prevention of agents bypassing approval gates | Done | [`src/lib/business/agents.ts`](../src/lib/business/agents.ts)<br>[`tests/agent-chat-flow.test.ts`](../tests/agent-chat-flow.test.ts) | Approved edits are inspected again at execution; a blocked action never goes out. |
| Agent-to-agent trust boundaries | Done | [`src/lib/business/event-agents.ts`](../src/lib/business/event-agents.ts)<br>[`docs/agent-security.md`](../docs/agent-security.md) |  |
| Restricted delegation between agents | Done | [`docs/agent-security.md`](../docs/agent-security.md)<br>[`src/lib/business/event-agents.ts`](../src/lib/business/event-agents.ts) | No delegation API exists; each agent runs with the owner's rows and budgets. |
| No privilege amplification through subagents | Done | [`docs/agent-security.md`](../docs/agent-security.md)<br>[`src/lib/business/agents.ts`](../src/lib/business/agents.ts) |  |
| Revocation of permissions during running tasks | Done | [`src/lib/ops/controls.ts`](../src/lib/ops/controls.ts)<br>[`src/lib/mcp/gateway.ts`](../src/lib/mcp/gateway.ts) |  |
| Reviewable history of autonomous actions | Done | [`src/lib/business/repo.ts`](../src/lib/business/repo.ts)<br>[`src/app/admin/security/page.tsx`](../src/app/admin/security/page.tsx)<br>[`src/app/api/business/approvals/route.ts`](../src/app/api/business/approvals/route.ts) |  |

<a id="github"></a>

## 13. GitHub and app-builder security

A ruleset on main, CI as the gate, CodeQL, dependency review, pinned actions, no secrets in CI, SBOM, stamped deploys.

27 items, 22 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| GitHub App permissions restricted to necessary repositories | Not applicable | [`docs/connectors.md`](../docs/connectors.md) | Keplar has no GitHub App; the GitHub connector is user OAuth with minimal scopes. |
| GitHub installation token handling | Not applicable | [`docs/connectors.md`](../docs/connectors.md) | No GitHub App installation tokens. |
| GitHub webhook verification | Not applicable | [`docs/connectors.md`](../docs/connectors.md) | Keplar receives no GitHub webhooks. |
| Branch protection rules | Done | `github:ruleset=main`<br>[`docs/security-policy.md`](../docs/security-policy.md) | Ruleset on main: pull requests only, required CI check, no force pushes, no deletion. |
| Required code reviews for sensitive changes | Policy | [`.github/CODEOWNERS`](../.github/CODEOWNERS)<br>[`docs/security-policy.md`](../docs/security-policy.md) | CODEOWNERS names the sensitive paths; with one maintainer the review is the PR checklist plus CI, and code-owner review becomes required the day a second maintainer joins. |
| Required CI checks | Done | `github:ruleset=main`<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |  |
| Secret scanning | Done | `github:secret_scanning=enabled`<br>[`scripts/secret-scan.mjs`](../scripts/secret-scan.mjs) |  |
| Dependency scanning | Done | [`.github/dependabot.yml`](../.github/dependabot.yml)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |  |
| Static application security testing (SAST) | Done | [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) |  |
| Dynamic application security testing (DAST) | Done | [`scripts/smoke-prod.mjs`](../scripts/smoke-prod.mjs)<br>[`tests/security.test.ts`](../tests/security.test.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) | In-house probes of the running app (headers, anonymous and cross-user requests on every route); no commercial scanner. |
| Software composition analysis (SCA) | Done | [`.github/workflows/dependency-review.yml`](../.github/workflows/dependency-review.yml)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |  |
| Infrastructure-as-code scanning | Done | [`tests/infra-config.test.ts`](../tests/infra-config.test.ts) |  |
| Container vulnerability scanning | Not applicable | [`docs/infrastructure.md`](../docs/infrastructure.md) | No containers. |
| Automated security regression tests | Done | [`tests/security.test.ts`](../tests/security.test.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts)<br>[`tests/security-checklist.test.ts`](../tests/security-checklist.test.ts) |  |
| Prevention of malicious dependency installation | Done | [`scripts/lockfile-check.mjs`](../scripts/lockfile-check.mjs)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`.github/workflows/dependency-review.yml`](../.github/workflows/dependency-review.yml) |  |
| Lockfile integrity | Done | [`scripts/lockfile-check.mjs`](../scripts/lockfile-check.mjs)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |  |
| Dependency update review | Done | [`.github/dependabot.yml`](../.github/dependabot.yml)<br>[`docs/security-policy.md`](../docs/security-policy.md) |  |
| Supply-chain provenance | Done | [`scripts/lockfile-check.mjs`](../scripts/lockfile-check.mjs)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Registry and sha512 pinned for every package; third-party actions pinned to commits. |
| Software bill of materials (SBOM) | Done | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |  |
| Signed or verifiable release artifacts | Done | [`docs/download.md`](../docs/download.md)<br>[`scripts/build-guard.mjs`](../scripts/build-guard.mjs) | SHA-256 checksums for desktop releases; stamped web deployments. Code signing of installers is accepted risk AR-11. |
| Protected deployment credentials | Done | [`docs/deploy.md`](../docs/deploy.md)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) | CI holds no deploy credentials; Vercel's Git integration or the operator's stamped deploy ship code. |
| CI/CD environment isolation | Done | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`tests/infra-config.test.ts`](../tests/infra-config.test.ts) |  |
| Protection against untrusted pull-request workflow execution | Done | [`tests/infra-config.test.ts`](../tests/infra-config.test.ts) |  |
| No privileged CI secrets available to untrusted code | Done | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`tests/infra-config.test.ts`](../tests/infra-config.test.ts) |  |
| Deployment approval controls | Done | [`scripts/build-guard.mjs`](../scripts/build-guard.mjs)<br>[`scripts/deploy-prod.mjs`](../scripts/deploy-prod.mjs)<br>[`tests/deploy-guard.test.ts`](../tests/deploy-guard.test.ts) |  |
| Secure rollback procedures | Done | [`docs/runbooks/rollback.md`](../docs/runbooks/rollback.md)<br>[`docs/deploy.md`](../docs/deploy.md) |  |
| Prevention of unauthorized production changes | Done | `github:ruleset=main`<br>[`scripts/build-guard.mjs`](../scripts/build-guard.mjs)<br>[`tests/deploy-guard.test.ts`](../tests/deploy-guard.test.ts) |  |

<a id="logging"></a>

## 14. Logging, monitoring, and incident response

Structured logs with request ids, a security event log with thresholds that email the owner, an audit log, retention, and a runbook with severities and drills.

27 items, 22 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Centralized security logs | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/app/admin/security/page.tsx`](../src/app/admin/security/page.tsx) |  |
| Authentication event logging | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`src/lib/accounts/new-device.ts`](../src/lib/accounts/new-device.ts) |  |
| Authorization failure logging | Done | [`src/lib/create/platform/workspace.ts`](../src/lib/create/platform/workspace.ts)<br>[`src/lib/security/origin.ts`](../src/lib/security/origin.ts)<br>[`tests/security-events.test.ts`](../tests/security-events.test.ts) |  |
| Administrative action logging | Done | [`src/lib/ops/audit.ts`](../src/lib/ops/audit.ts) |  |
| Billing change logging | Done | [`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/billing-audit.test.ts`](../tests/billing-audit.test.ts) |  |
| Agent action logging | Done | [`src/lib/business/agents.ts`](../src/lib/business/agents.ts)<br>[`src/lib/business/repo.ts`](../src/lib/business/repo.ts) |  |
| Security configuration change logging | Done | [`src/lib/ops/controls.ts`](../src/lib/ops/controls.ts)<br>[`src/lib/ops/audit.ts`](../src/lib/ops/audit.ts) |  |
| Secret access logging | Done | [`src/lib/mcp/crypto.ts`](../src/lib/mcp/crypto.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts) |  |
| Sensitive data redaction in logs | Done | [`src/lib/ops/log.ts`](../src/lib/ops/log.ts)<br>[`src/lib/ops/errors.ts`](../src/lib/ops/errors.ts)<br>[`tests/secrets-audit.test.ts`](../tests/secrets-audit.test.ts) |  |
| Log access restrictions | Done | [`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts)<br>[`docs/infrastructure.md`](../docs/infrastructure.md) |  |
| Log integrity protection | Policy | [`docs/infrastructure.md`](../docs/infrastructure.md)<br>[`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md) | Append-only rows under the system tenant with no delete route; Vercel logs are immutable on the platform; the runbook says never to delete during an incident. |
| Log retention policies | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/lib/ops/retention.ts`](../src/lib/ops/retention.ts)<br>[`docs/privacy-inventory.md`](../docs/privacy-inventory.md) |  |
| Consistent timestamps and correlation IDs | Done | [`src/lib/ops/log.ts`](../src/lib/ops/log.ts)<br>[`src/proxy.ts`](../src/proxy.ts) |  |
| Alerts for suspicious login activity | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/lib/accounts/new-device.ts`](../src/lib/accounts/new-device.ts)<br>[`tests/security-events.test.ts`](../tests/security-events.test.ts) |  |
| Alerts for privilege escalation attempts | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts) |  |
| Alerts for unexpected spending spikes | Done | [`src/lib/ops/telemetry.ts`](../src/lib/ops/telemetry.ts)<br>[`src/lib/create/platform/spend.ts`](../src/lib/create/platform/spend.ts)<br>[`tests/cost-guard.test.ts`](../tests/cost-guard.test.ts) |  |
| Alerts for unusual data exports | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`src/app/api/account/export/route.ts`](../src/app/api/account/export/route.ts) |  |
| Alerts for abnormal API traffic | Done | [`src/lib/ops/telemetry.ts`](../src/lib/ops/telemetry.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts) |  |
| Alerts for excessive failed authorization checks | Done | [`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`tests/security-events.test.ts`](../tests/security-events.test.ts) |  |
| Alerts for production configuration changes | Done | [`src/lib/ops/audit.ts`](../src/lib/ops/audit.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts) | Kill-switch and limit changes are config.change events; Vercel emails the team on environment changes. |
| Incident response runbooks | Done | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md)<br>[`docs/runbooks/README.md`](../docs/runbooks/README.md) |  |
| Defined incident severity levels | Done | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md) |  |
| Emergency credential revocation | Policy | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md) | Same procedure as above, exercised in the quarterly tabletop. |
| Emergency deployment rollback | Done | [`docs/runbooks/rollback.md`](../docs/runbooks/rollback.md)<br>[`scripts/deploy-prod.mjs`](../scripts/deploy-prod.mjs) |  |
| Customer notification procedures | Policy | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md)<br>[`docs/privacy-inventory.md`](../docs/privacy-inventory.md) | Who is told, when (72 hours, sooner if they must act), what the notice contains and that legal reviews it first; sending needs a person and a lawyer, not code. |
| Post-incident review process | Policy | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md)<br>[`docs/security-progress.md`](../docs/security-progress.md) | A dated, blameless review in the findings log within a week, with a regression test and threat-model update; a people process by nature. |
| Periodic incident response exercises | Policy | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md)<br>[`docs/security-policy.md`](../docs/security-policy.md) | Quarterly tabletop; the runbook records the last date (none yet). |

<a id="privacy"></a>

## 15. Privacy and compliance

A privacy policy written from the code, an inventory of data and processors, export and deletion in the product, consent-gated analytics.

20 items, 12 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Privacy policy matching actual data practices | Done | [`src/components/legal/content/privacy.ts`](../src/components/legal/content/privacy.ts)<br>[`tests/legal.test.ts`](../tests/legal.test.ts)<br>[`tests/training-statement.test.ts`](../tests/training-statement.test.ts) |  |
| Data processing inventory | Done | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md) |  |
| Data retention schedule | Done | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/ops/retention.ts`](../src/lib/ops/retention.ts) |  |
| User data export | Done | [`src/app/api/account/export/route.ts`](../src/app/api/account/export/route.ts)<br>[`tests/privacy.test.ts`](../tests/privacy.test.ts) |  |
| User data deletion | Done | [`src/app/api/account/delete/route.ts`](../src/app/api/account/delete/route.ts)<br>[`tests/deletion-grace.test.ts`](../tests/deletion-grace.test.ts)<br>[`tests/privacy.test.ts`](../tests/privacy.test.ts) |  |
| Workspace deletion procedures | Done | [`src/lib/team/store.ts`](../src/lib/team/store.ts)<br>[`tests/team.test.ts`](../tests/team.test.ts)<br>[`docs/teams.md`](../docs/teams.md) |  |
| Third-party processor inventory | Done | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md) |  |
| Data processing agreements where required | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md) | Each processor's DPA is listed; accepting them in the provider dashboards and recording the date is an owner action. |
| International data transfer assessment where applicable | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/components/legal/content/privacy.ts`](../src/components/legal/content/privacy.ts) | Processing is in the US under each processor DPA and SCCs; the privacy policy discloses it; an EU representative is an open legal decision. |
| Consent management where required | Done | [`src/lib/consent.ts`](../src/lib/consent.ts)<br>[`src/components/consent/CookieBanner.tsx`](../src/components/consent/CookieBanner.tsx)<br>[`tests/consent.test.ts`](../tests/consent.test.ts) |  |
| Cookie disclosure and controls where required | Done | [`src/components/legal/content/privacy.ts`](../src/components/legal/content/privacy.ts)<br>[`src/components/consent/CookieSettingsButton.tsx`](../src/components/consent/CookieSettingsButton.tsx)<br>[`tests/cookie-banner-narrow.test.ts`](../tests/cookie-banner-narrow.test.ts) |  |
| Appropriate age-related protections | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/safety/screen.ts`](../src/lib/safety/screen.ts)<br>[`docs/legal-open-decisions.md`](../docs/legal-open-decisions.md) | 13+ terms, teen defaults and Family mode in code; purchases by minors remain a legal decision. |
| Access request handling procedures | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md) | Export and deletion are self-serve in the product; other rights are handled by email with identity verified through a signed link to the account address, within 30 days. |
| Data breach notification procedures | Policy | [`docs/runbooks/security-incident.md`](../docs/runbooks/security-incident.md)<br>[`docs/privacy-inventory.md`](../docs/privacy-inventory.md) | Thresholds (72 hours to the authority, without undue delay to people at high risk), contents of the notice and legal review are written down; the decision is a human one. |
| Privacy impact assessments for high-risk processing | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md) | Required triggers and the assessment template are defined; each is a section in the feature design doc linked from the PR. |
| Restrictions on internal employee access to customer data | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/ops/admin-auth.ts`](../src/lib/ops/admin-auth.ts) | One operator today; access is through MFA-protected consoles and audited admin pages with no impersonation feature; the rule is written for the first hire. |
| Support access auditing | Done | [`src/lib/ops/audit.ts`](../src/lib/ops/audit.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`docs/privacy-inventory.md`](../docs/privacy-inventory.md) |  |
| Secure handling of analytics data | Done | [`src/lib/seo/events.ts`](../src/lib/seo/events.ts)<br>[`src/lib/consent.ts`](../src/lib/consent.ts)<br>[`tests/growth-events.test.ts`](../tests/growth-events.test.ts) |  |
| Separation of customer content from product analytics | Done | [`src/lib/traffic/visits.ts`](../src/lib/traffic/visits.ts)<br>[`tests/growth-events.test.ts`](../tests/growth-events.test.ts)<br>[`docs/privacy-inventory.md`](../docs/privacy-inventory.md) |  |
| Contractual controls for AI providers and subprocessors | Policy | [`docs/privacy-inventory.md`](../docs/privacy-inventory.md)<br>[`src/lib/privacy/training-statement.ts`](../src/lib/privacy/training-statement.ts) | Provider terms and no-training settings are listed per processor; signing DPAs is an owner action recorded with a date in the inventory. |

<a id="abuse"></a>

## 16. Business logic and abuse prevention

Server-side prices and limits, atomic counters, honeypots and verification against bots, cooldowns and takedowns for abusive workloads.

18 items, 17 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Protection against free-trial farming | Done | [`src/lib/privacy/free-gate.ts`](../src/lib/privacy/free-gate.ts)<br>[`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`tests/free-plan.test.ts`](../tests/free-plan.test.ts) |  |
| Prevention of referral reward abuse | Done | [`src/lib/referrals/abuse.ts`](../src/lib/referrals/abuse.ts)<br>[`tests/referrals.test.ts`](../tests/referrals.test.ts)<br>[`docs/referrals.md`](../docs/referrals.md) |  |
| Coupon and discount validation | Not applicable | [`src/lib/billing/whop.ts`](../src/lib/billing/whop.ts) | Keplar issues no coupons; promotions live in Whop, which validates them at its checkout. |
| Prevention of negative-price or negative-credit exploits | Done | [`src/lib/billing/plans.ts`](../src/lib/billing/plans.ts)<br>[`src/lib/billing/extensions.ts`](../src/lib/billing/extensions.ts)<br>[`tests/limit-extensions.test.ts`](../tests/limit-extensions.test.ts) |  |
| Protection against race conditions | Done | [`src/lib/usage/daily.ts`](../src/lib/usage/daily.ts)<br>[`src/lib/billing/studio-topup.ts`](../src/lib/billing/studio-topup.ts)<br>[`tests/daily-use-pg.test.ts`](../tests/daily-use-pg.test.ts) |  |
| Transaction state-machine validation | Done | [`src/lib/desktop-auth/core.ts`](../src/lib/desktop-auth/core.ts)<br>[`src/lib/billing/sync.ts`](../src/lib/billing/sync.ts)<br>[`tests/desktop-auth.test.ts`](../tests/desktop-auth.test.ts)<br>[`tests/billing-lifecycle.test.ts`](../tests/billing-lifecycle.test.ts) |  |
| Prevention of skipped workflow steps | Done | [`src/lib/desktop-auth/core.ts`](../src/lib/desktop-auth/core.ts)<br>[`src/lib/accounts/mfa/gate.ts`](../src/lib/accounts/mfa/gate.ts)<br>[`tests/mfa-signin.test.ts`](../tests/mfa-signin.test.ts) |  |
| Server-side enforcement of plan limits | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/create/platform/plans.ts`](../src/lib/create/platform/plans.ts)<br>[`tests/limits.test.ts`](../tests/limits.test.ts) |  |
| Prevention of resource exhaustion | Done | [`src/lib/create/platform/cooldown.ts`](../src/lib/create/platform/cooldown.ts)<br>[`src/lib/create/platform/queue.ts`](../src/lib/create/platform/queue.ts)<br>[`tests/cooldown.test.ts`](../tests/cooldown.test.ts) |  |
| Protection against automated account creation abuse | Done | [`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`src/lib/accounts/email-domain.ts`](../src/lib/accounts/email-domain.ts)<br>[`tests/email-domain.test.ts`](../tests/email-domain.test.ts) |  |
| Bot mitigation where appropriate | Done | [`src/lib/site-builder/features/spam.ts`](../src/lib/site-builder/features/spam.ts)<br>[`src/app/api/feedback/route.ts`](../src/app/api/feedback/route.ts)<br>[`src/proxy.ts`](../src/proxy.ts) | Honeypots, MX checks and rate limits; no CAPTCHA by design (accessibility), which the policy records. |
| Email and notification sending limits | Done | [`src/lib/accounts/password-auth.ts`](../src/lib/accounts/password-auth.ts)<br>[`src/lib/accounts/outbox.ts`](../src/lib/accounts/outbox.ts)<br>[`tests/magic-link.test.ts`](../tests/magic-link.test.ts) |  |
| Prevention of unrestricted expensive API calls | Done | [`src/lib/create/platform/spend.ts`](../src/lib/create/platform/spend.ts)<br>[`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`tests/rate-limit-audit.test.ts`](../tests/rate-limit-audit.test.ts) |  |
| Protection against fraudulent usage reporting | Done | [`src/lib/ops/request-cost.ts`](../src/lib/ops/request-cost.ts)<br>[`tests/cost-meter.test.ts`](../tests/cost-meter.test.ts) | Usage is metered server-side from provider responses; nothing client-reported is billed. |
| Abuse detection for account sharing | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/accounts/new-device.ts`](../src/lib/accounts/new-device.ts) | Concurrency caps, per-IP daily caps and new-device notices; a dedicated sharing detector is not built. |
| Fraud monitoring for high-value actions | Done | [`src/lib/billing/studio-topup.ts`](../src/lib/billing/studio-topup.ts)<br>[`src/lib/security/events.ts`](../src/lib/security/events.ts)<br>[`tests/studio-topup.test.ts`](../tests/studio-topup.test.ts) |  |
| Tenant-specific resource budgets | Done | [`src/lib/orchestration/limits.ts`](../src/lib/orchestration/limits.ts)<br>[`src/lib/business/tiers.ts`](../src/lib/business/tiers.ts)<br>[`tests/rate-limit-audit.test.ts`](../tests/rate-limit-audit.test.ts) |  |
| Automatic suspension of clearly abusive workloads with appropriate review | Done | [`src/lib/create/platform/cooldown.ts`](../src/lib/create/platform/cooldown.ts)<br>[`src/lib/safety/store.ts`](../src/lib/safety/store.ts)<br>[`src/app/api/create/abuse/route.ts`](../src/app/api/create/abuse/route.ts)<br>[`tests/safety-reports.test.ts`](../tests/safety-reports.test.ts) |  |

<a id="governance"></a>

## 17. Security verification and governance

A threat model, a written lifecycle with gates and reviews, an accepted-risk register, disclosure with response targets, and evidence kept in the repository.

24 items, 17 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Documented threat model | Done | [`docs/threat-model.md`](../docs/threat-model.md) |  |
| Security requirements defined before implementation | Policy | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`.github/pull_request_template.md`](../.github/pull_request_template.md) | The PR template asks the security questions on every change and the policy requires a threat-model row before a new surface; a process, enforced by review rather than code. |
| Security architecture review | Policy | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/threat-model.md`](../docs/threat-model.md) | Any change that crosses a trust boundary gets a design doc linked from the PR; with one maintainer this is a self-review against the threat model. |
| Secure coding standards | Done | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`tests/secrets-audit.test.ts`](../tests/secrets-audit.test.ts)<br>[`tests/authz.test.ts`](../tests/authz.test.ts) |  |
| Automated unit security tests | Done | [`tests/security.test.ts`](../tests/security.test.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts)<br>[`tests/upload-scan.test.ts`](../tests/upload-scan.test.ts) |  |
| Integration security tests | Done | [`tests/mfa-signin.test.ts`](../tests/mfa-signin.test.ts)<br>[`tests/admin-mfa.test.ts`](../tests/admin-mfa.test.ts)<br>[`tests/security-events.test.ts`](../tests/security-events.test.ts) |  |
| Authorization matrix tests | Done | [`tests/authz.test.ts`](../tests/authz.test.ts) |  |
| Cross-tenant isolation tests | Done | [`tests/account-scope.test.ts`](../tests/account-scope.test.ts)<br>[`tests/share-isolation.test.ts`](../tests/share-isolation.test.ts) |  |
| Fuzz testing for critical parsers and inputs | Done | [`tests/fuzz-parsers.test.ts`](../tests/fuzz-parsers.test.ts) |  |
| Penetration testing | Policy | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/known-gaps.md`](../docs/known-gaps.md) | Yearly external test is an owner purchase in the policy calendar; none has been done, and /security says so. |
| Independent security review for high-risk releases | Policy | [`docs/security-policy.md`](../docs/security-policy.md) | Yearly external review is budgeted in the policy calendar as an owner purchase; none has happened yet. |
| Vulnerability disclosure process | Done | [`SECURITY.md`](../SECURITY.md)<br>[`src/app/(marketing)/security/page.tsx`](../src/app/(marketing)/security/page.tsx)<br>[`tests/security-page.test.ts`](../tests/security-page.test.ts) |  |
| Security contact | Done | [`SECURITY.md`](../SECURITY.md)<br>[`tests/security.test.ts`](../tests/security.test.ts) |  |
| Vulnerability remediation deadlines based on severity | Done | [`SECURITY.md`](../SECURITY.md)<br>[`docs/security-policy.md`](../docs/security-policy.md) |  |
| Tracking of accepted security risks | Done | [`docs/security-policy.md`](../docs/security-policy.md) |  |
| Security regression testing | Done | [`tests/security-checklist.test.ts`](../tests/security-checklist.test.ts)<br>[`tests/security.test.ts`](../tests/security.test.ts)<br>[`docs/security-progress.md`](../docs/security-progress.md) |  |
| Disaster recovery testing | Policy | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`docs/runbooks/backup-restore.md`](../docs/runbooks/backup-restore.md) | Quarterly restore drill into a scratch Neon branch and a yearly full rehearsal; dates are recorded in the backup runbook (none held yet). |
| Business continuity planning | Done | [`docs/security-policy.md`](../docs/security-policy.md) |  |
| Secure software development lifecycle | Done | [`docs/security-policy.md`](../docs/security-policy.md)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`.github/pull_request_template.md`](../.github/pull_request_template.md) |  |
| Periodic dependency review | Done | [`.github/dependabot.yml`](../.github/dependabot.yml)<br>[`docs/security-policy.md`](../docs/security-policy.md) |  |
| Periodic permission review | Policy | [`docs/security-policy.md`](../docs/security-policy.md) | Quarterly review of GitHub collaborators, Vercel team, admin emails, OAuth scopes and API keys, recorded in the findings log. |
| Periodic secrets review | Policy | [`docs/security-policy.md`](../docs/security-policy.md) | Quarterly inventory of every environment variable, rotation of anything older than a year, deletion of unused ones; recorded in the findings log. |
| Security release gates | Done | [`scripts/verify.mjs`](../scripts/verify.mjs)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`scripts/build-guard.mjs`](../scripts/build-guard.mjs) |  |
| Evidence retained for security verification | Done | [`security/checklist.json`](../security/checklist.json)<br>[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)<br>[`docs/security-progress.md`](../docs/security-progress.md) |  |

<a id="generated-output"></a>

## 18. Websites and apps Keplar generates

What every generated site and app gets automatically: the security and mobile checklist on each build (31 checks, deterministic repairs applied, the rest sent to the repair pass), plus the platform's own serving guarantees.

14 items, 14 done in code.

| Control | Status | Evidence | Note |
|---|---|---|---|
| Security and mobile checklist runs on every build and is stored with the version | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`src/lib/site-builder/job.ts`](../src/lib/site-builder/job.ts)<br>[`src/lib/app-builder/pipeline.ts`](../src/lib/app-builder/pipeline.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) |  |
| No inline, third-party or dynamic script; no inline handlers; no javascript: URLs; no frames, base or meta refresh | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`src/lib/site-builder/sanitize.ts`](../src/lib/site-builder/sanitize.ts)<br>[`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts) |  |
| Every resource over HTTPS; new-tab links carry noopener; forms post to Keplar only; no password fields on static sites | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) |  |
| No credentials in generated files; no HTML built from data with innerHTML; no remote module imports | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) |  |
| Mobile viewport declared with zoom allowed; UTF-8 and language declared; every page titled | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) | Repaired automatically when the model forgets. |
| Images scale to the screen, carry alt text, and load lazily below the first | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) | Repaired automatically. |
| Layout adapts to width (media or container queries, clamp, minmax); no fixed page width; overflow fixed rather than hidden | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`src/lib/app-builder/rubric.ts`](../src/lib/app-builder/rubric.ts)<br>[`src/lib/site-builder/qa/run.ts`](../src/lib/site-builder/qa/run.ts) | Checked statically on every build and in a real browser at phone, tablet and desktop widths in the site QA run. |
| Readable text (12 px minimum) and 44 px tap targets | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`src/lib/app-builder/rubric.ts`](../src/lib/app-builder/rubric.ts) |  |
| Reduced-motion preference respected | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`tests/output-checklist.test.ts`](../tests/output-checklist.test.ts) | Repaired automatically. |
| Main landmark, one h1, labelled form fields | Done | [`src/lib/create/output-checklist.ts`](../src/lib/create/output-checklist.ts)<br>[`src/lib/site-builder/finalize.ts`](../src/lib/site-builder/finalize.ts) |  |
| Served under a sandbox CSP with an opaque origin, nosniff, no framing by third parties, HSTS on custom domains | Done | [`src/app/s/[slug]/[[...path]]/route.ts`](../src/app/s/[slug]/[[...path]]/route.ts)<br>[`src/lib/app-builder/files.ts`](../src/lib/app-builder/files.ts)<br>[`src/proxy.ts`](../src/proxy.ts)<br>[`tests/fx-frame-headers.test.ts`](../tests/fx-frame-headers.test.ts) |  |
| Forms and app APIs rate limited with honeypots; uploads scanned; app data isolated per app and environment | Done | [`src/app/s/[slug]/[[...path]]/route.ts`](../src/app/s/[slug]/[[...path]]/route.ts)<br>[`src/lib/app-runtime/router.ts`](../src/lib/app-runtime/router.ts)<br>[`src/lib/app-runtime/files.ts`](../src/lib/app-runtime/files.ts) |  |
| Drafts are noindex and token-protected; publishing is the owner's explicit action; abuse reports and takedown on every published page | Done | [`src/app/apps/draft/[siteId]/[version]/[token]/[[...path]]/route.ts`](../src/app/apps/draft/[siteId]/[version]/[token]/[[...path]]/route.ts)<br>[`src/app/api/create/abuse/route.ts`](../src/app/api/create/abuse/route.ts)<br>[`docs/security.md`](../docs/security.md) |  |
| Failed required checks block a quiet ship: they go to the model repair pass and into the build report | Done | [`src/lib/site-builder/job.ts`](../src/lib/site-builder/job.ts)<br>[`src/lib/app-builder/pipeline.ts`](../src/lib/app-builder/pipeline.ts) |  |
