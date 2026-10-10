# Runbooks

Who: the operator (team@keplar.one). Where: `/admin` (kill switches, audit log, spend, errors), Vercel dashboard, Neon console, Whop dashboard.
Every response from `/api/*` has an `x-request-id`; logs are JSON lines containing it (`reqId`).

First move in any incident: **decide whether money or data is at risk.** If money: `/admin` -> Global AI stop (reason required). If data: see security-incident.md.

| Situation | Runbook |
|---|---|
| Database (Neon) down or slow | [database-outage.md](database-outage.md) |
| Model provider down / degraded | [provider-outage.md](provider-outage.md) |
| Sign-in broken | [auth-outage.md](auth-outage.md) |
| Billing / webhooks wrong | [billing-outage.md](billing-outage.md) |
| Spend spike or runaway cost | [cost-emergency.md](cost-emergency.md) |
| Suspected breach, leaked key, abuse | [security-incident.md](security-incident.md) |
| Bad deploy | [failed-deploy.md](failed-deploy.md) |
| Backups, restore, rollback | [backup-restore.md](backup-restore.md), [rollback.md](rollback.md) |
