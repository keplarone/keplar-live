# Measurement dashboard: `/admin/growth`

Admin-only page (non-admins get a 404; verified live). It reads real data and says **"No data yet"** where there is none. No numbers are invented; there is no seeded or sample data. Window: last 30 days.

| Panel | Source | Notes |
|---|---|---|
| Qualified visits | consented landing events (`seo_events` landing_view) | distinct browsers that allowed Analytics; understates true traffic (those who decline are not counted); use Vercel Analytics and Search Console for totals |
| Sign-ups | account records | total, last 7 and 30 days |
| Activated browsers / repeat use | `growth_events` | definition in [ACTIVATION.md](ACTIVATION.md) |
| Funnel | landing view -> CTA -> sign-up -> first prompt -> synthesis | distinct browsers per step |
| Asking and time to first result | `growth_events` | started, done, failed, abandoned, median and p90 seconds, share of multi-model answers, share with a visible disagreement, error kinds |
| Paying customers, MRR | Whop-synced subscription records | MRR = active subscriptions x Whop price ($19.99 / $44.99 / $99.99); never includes lifetime or one-time sales |
| Churn, refunds, disputes | Whop events | churn shown only once there are at least 10 customers+cancellations ("No data yet" before that) |
| CAC | recorded marketing spend | "Not defined" at $0 spend |
| Contribution after serving users | cash collected - estimated card fees - provider cost | excludes hosting/database/email/support |
| Sharing | `answer_shares` | links created, live, views |
| Feedback | `feedback` | counts by kind, latest messages |

**Not yet measured:** per-channel (utm) conversion table (utm is carried by the landing funnel; a per-source breakdown view is a follow-up), Search Console, inviter attribution (by design), retention by cohort (needs 30+ users per cohort). Founders review it every Friday ([PLAN-90.md](PLAN-90.md)).
