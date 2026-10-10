# Sign-in outage

Signals: users cannot sign in or get signed out; magic-link emails not arriving; Google/Microsoft errors.

1. Magic link: check Resend dashboard (domain verified, quota), `KEPLAR` outbox logs. Links are HMAC-signed and valid on any instance; they need `BETTER_AUTH_SECRET` unchanged. **Never rotate `BETTER_AUTH_SECRET` casually**: it signs sessions, magic links and plan cookies (everyone is signed out and cookies are invalid).
2. OAuth: provider console (redirect URIs must match `BETTER_AUTH_URL`), env client id/secret present.
3. Session store (Neon) down: sessions fall back to the cookie; revoked sessions may live up to 15 s longer. See database-outage.md.
4. If a session or account is compromised: Account -> Sign out everywhere (user), or set `sessions_valid_after = now()` on the user row in `keplar_users` (operator).
5. Admin cannot reach `/admin`: sign in with the verified admin email (`KEPLAR_ADMIN_EMAILS`, default team@keplar.one). It returns 404 for everyone else by design.
