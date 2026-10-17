# Security incident (breach, leaked key, abuse)

Who: the operator (team@keplar.one). Where: `/admin` (Global stop, audit log, security events), Vercel, Neon, Whop, Stripe, GitHub.
Severity levels and response targets are in `docs/security-policy.md` §2; this page is the procedure. Keep a timeline from the first
minute (time in ET, what you saw, what you did): it is the post-incident record and, if needed, the notification evidence.

## 0. Decide the severity in two minutes

- Money moving or about to (runaway spend, forged plan grants, seller payouts wrong): **S1**. Go to Contain.
- Data of more than one user readable by someone who should not (cross-tenant bug, leaked `DATABASE_URL`, exposed backup): **S1**.
- One account compromised, a credential leaked that reaches only one integration, SSRF reaching internal addresses: **S2**.
- Hardening gap with no sign of use: **S3/S4**: open an issue, fix on the normal schedule.

## 1. Contain

1. `/admin` → **Global AI stop** (reason: "security incident"). Everything that costs money stops within seconds; sign-in and the site keep working.
2. **Leaked credential**: rotate at the provider first, then update the Vercel env var (Production), redeploy `main`, and only then
   delete the old value. Order matters: a redeploy with a dead key is better than minutes with a live leaked one.
   - Provider key (OpenRouter, OpenAI, NVIDIA, Resend, Whop, Stripe, Higgsfield): rotate in the provider dashboard.
   - `DATABASE_URL`: Neon → Roles → reset password; update `DATABASE_URL` and `POSTGRES_URL*`.
   - `VERCEL_TOKEN` / `VERCEL_DOMAINS_TOKEN`: Vercel → Settings → Tokens → delete, create.
   - `CRON_SECRET`, `OPS_CHECK_SECRET`, `WHOP_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`: new value in both the provider and Vercel.
   - `BETTER_AUTH_SECRET`: **only if sessions themselves are compromised.** It signs every session, the plan cookie, action links and seals
     connector tokens: rotating it signs everyone out, breaks outstanding emailed links, and every connector must be re-authorized. Announce it.
3. **Compromised account**: Account → Devices → sign out everywhere, or set `sessions_valid_after` for the user in Neon; remove the user's
   API keys; if an admin account, remove it from `KEPLAR_ADMIN_EMAILS` until verified.
4. **Abuse through a published site or app**: `/api/create/abuse` report flow, or take it down directly with the admin token
   (`POST /api/create/abuse/{id}`, `Authorization: Bearer $KEPLAR_ADMIN_TOKEN`). CSAM/NCII reports auto-disable pending review.
5. **Active attack on the edge** (traffic, credential stuffing): Vercel → Firewall → Attack Challenge Mode on; tighten `API_PER_IP_PER_MIN`
   if needed and redeploy; the security events page shows which hashed addresses trip the limits.
6. **Bad deploy** is `failed-deploy.md` / `rollback.md`, not this page, unless the deploy introduced the exposure (then both).

## 2. Preserve

Do not delete rows or logs. Export what you will need before anything rotates or expires: Vercel runtime logs for the window (filter by
`reqId`), the admin audit log, the `security_events` rows (`/admin` → Security, or SQL on `keplar_rows` where `collection = 'security_events'`),
the relevant `model_calls`, billing events, and the GitHub audit log if the repository or CI is involved. Take a Neon branch of the
database at the moment of discovery (`pre-incident-<date>`), which is a free, instant snapshot.

## 3. Assess

- Which data, which accounts, which period. Accounts and emails live in `keplar_users`; chats, memory, sites, business data in `keplar_rows`
  (by `workspace_id`); card data never touches Keplar (Whop/Stripe).
- Look at security events around the time: `authz.denied` bursts, `auth.throttled`, `secret.access`, `export.data`, `billing.change`.
- Check spend (`/admin`, `system_daily_spend`, `model_calls`) for anything the attacker bought with the key.
- Decide: was personal data exposed? To whom? Is it likely to cause harm? Write the answer down with the evidence.

## 4. Revoke and recover

Finish rotating everything the attacker could have reached (not just what you know they used). Revoke OAuth grants for affected connectors
in the provider consoles (Google Cloud, Slack, GitHub, Notion, Linear) and ask affected users to reconnect. Restore data from the Neon
branch if rows were changed (`backup-restore.md`). Lift the Global stop only after the entry point is closed and a regression test exists.

## 5. Notify

- **Users**: if their data or account was exposed, email them from team@keplar.one within 72 hours of knowing, sooner when they should act
  (reset a password, revoke a connector). Say what happened, what data, when, what Keplar did, what they should do, and how to reach us.
  No marketing tone, no minimizing.
- **Regulators**: where GDPR applies, the supervisory authority within 72 hours of becoming aware unless the breach is unlikely to risk
  people's rights; US state laws by the data involved. The notice text gets a legal review before it goes (`docs/legal-open-decisions.md`
  names the open counsel question). Keep the draft and the sent copy with the timeline.
- **Payment providers**: Whop or Stripe if payment flows were abused (they may need to reverse charges).
- **Public**: `/status` and `/security` get a short, factual note for S1 incidents that affected users.

## 6. Learn

Within a week: a post-incident review in `docs/security-progress.md` (timeline, root cause, what detected it, what slowed the response,
what changes), a regression test next to the fix, and updates to `docs/threat-model.md` and `security/checklist.json` if a control was missing.
Blameless, specific, dated.

## 7. Exercise

Quarterly tabletop (policy §4): pick one scenario below, walk this runbook with the clock running, record the date and what was unclear.
Scenarios: (a) OpenRouter key pushed to a public gist; (b) a user reports seeing another user's chat; (c) Whop webhook secret leaked and
Pro plans granted to strangers; (d) Dependabot-updated package found malicious. Last exercise: not yet held.
