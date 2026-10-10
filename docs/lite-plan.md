# Keplar Lite ($20 / month shown)

The site shows Lite as **$20 a month** (like Plus $45 and Pro $99, which Whop charges as 44.99 and 99.99). The Whop plan is unchanged and bills $19.99; checkout and the account page say it is billed through Whop and the exact amount is shown at checkout. The step between Free and Plus: premium models for everyday questions at a lower price.

## What is sold
Whop plan `plan_qpgb6JV0jhQGj` (product `prod_1DdzDiYfW63Nk`, 30-day renewal, `initial_price` 0, visibility `hidden`, `buy_now`). It has exactly the same shape as the Plus and Pro plans (also hidden), which is what embedded checkout and `checkout_configurations` expect.

Set `WHOP_PLAN_LITE` (alias `WHOP_PLAN_ID_LITE`) to that id. There is deliberately **no code default**: while it is unset, `/checkout?plan=lite` redirects to `/pricing`, `POST /api/billing/checkout` refuses `lite`, `/api/compute` reports `liteCheckout: false` and the Account and Pricing pages hide the Lite buy button. The webhook cannot map an unknown plan id to a tier either.

Plan ids are matched case-insensitively (Whop resolves them that way; its canonical form is mixed case, e.g. `plan_wd9Xs4iDlwvDi`). The tier always comes from the Whop plan id in the webhook; browser metadata can never choose it.

## What Lite includes
| | Lite | Plus (for comparison) |
|---|---|---|
| Credits / month | 2,400 (provider budget $4.80 = 24% of price) | 6,000 |
| 5-hour / weekly windows | 400 / 1,280 credits | 1,000 / 3,200 |
| Models | all (premium chat models and Keplar consensus) | all |
| Deep Research | no | yes |
| Study mode | stronger models, mid limits | higher limits |
| Create (site builder) | 2 projects, 5 pages, small jobs ($0.30 cap) | 5 projects |
| Images, video, Slides, commerce, agents, connected apps (MCP), custom domains | **no** (start at Plus) | yes |
| Per request cap / day cap (USD) | 0.30 / 1.20 | 0.75 / 3 |
| Cooldown trigger (provider USD / hour) | 0.80 | 2 |

All the numbers live in `src/lib/orchestration/plans.ts` (`PLAN_ALLOWANCES`, `WINDOW_LIMITS`), `src/lib/orchestration/limits.ts` (`PLAN_LIMITS`), `src/lib/create/platform/plans.ts` (`ENTITLEMENTS`), `src/lib/tools/limits.ts`, `src/lib/site-builder/limits.ts`, `src/lib/mcp/limits.ts`, `src/lib/images/config.ts`, `src/lib/domains/limits.ts` and `src/lib/tiers.ts`; `tests/lite-plan.test.ts` pins the relationships (cost margin, ordering, nothing unlocked by accident).

## Webhook
Same handler as Plus/Pro (`src/lib/billing/sync.ts`): the Whop `plan_id` -> `planForWhopPlanId` -> `lite`. All three paid plan ids are handled for `payment.succeeded`, `membership.activated`, `membership.deactivated`, `payment.failed`, `refund.created`, `dispute.created`, `membership.cancel_at_period_end_changed`. Upgrade Lite -> Plus is a new membership on the Plus plan id. Purchases are matched to the account by the signed `keplar_ref` (email) in the checkout metadata, never by plain metadata.

## Turning it on
1. `WHOP_PLAN_LITE=plan_qpgb6JV0jhQGj` in Vercel (production), then redeploy.
2. Buy it once with a real card, confirm `/account` shows Keplar Lite and 2,400 credits, then refund it and confirm Free.
