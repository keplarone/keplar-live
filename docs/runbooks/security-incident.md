# Security incident (breach, leaked key, abuse)

1. **Contain.** `/admin` -> Global AI stop (reason "security incident"). For a leaked provider key: rotate it at the provider first, then update the Vercel env var and redeploy. For a leaked `DATABASE_URL`: reset the Neon role password, update env, redeploy.
2. **Preserve.** Do not delete rows or logs. Note the time (ET) and request ids. The admin audit log (`/admin`) and Vercel logs are the record.
3. **Assess.** Which data? Accounts/emails (`keplar_users`), chats and memory (`keplar_rows`), billing (Whop holds card data, Keplar never sees it). Check recent sign-ins and `model_calls`/spend for anomalies.
4. **Revoke.** Rotate `BETTER_AUTH_SECRET` only if sessions themselves are compromised (it signs out everyone and invalidates plan cookies); otherwise revoke the affected sessions.
5. **Abuse of user-built sites:** `/api/create/abuse` reports; takedown uses `KEPLAR_ADMIN_TOKEN` (POST `/api/create/abuse/{id}` with `Authorization: Bearer ...`). CSAM/NCII reports auto-disable the site pending review.
6. **Notify.** If personal data was exposed, notify affected users and regulators as the law requires (legal review needed: not automated). Contact: team@keplar.one.
7. **Learn.** Write a short post-mortem in `docs/revamp/CHECKPOINTS.md` and add a regression test.
