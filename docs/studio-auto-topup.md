# Studio auto top-up

Studio has no per-run credit budget. It keeps its normal account allowance, usage cooldowns, safety gates, manual pause/stop, and 80-step pause. The shared Studio dock includes auto top-up on both the page and the desktop overlay.

Auto top-up is off by default. A verified personal Lite/Plus/Pro account owner reviews a saved Whop card, price, credits, expiry and a limit of 1–10 top-ups per calendar month (UTC), then explicitly authorizes automatic purchases. Enabling does not charge. Disabling prevents new purchases; an already-started payment can finish.

## Pricing and configuration

- Custom amounts use the owner-approved rate **$1 USD = 120 credits**. Users choose $5–$500, to the nearest cent; fractional credits round down. A $10 top-up grants 1,200 credits.
- `KEPLAR_STUDIO_TOPUP_CREDITS_PER_USD` can override the rate (positive integer up to 10,000). Set `0` to turn custom amounts off. Changed prices/credits/expiry require new consent before another charge. The amount range also ensures each purchase covers a Studio turn and grants no more than 200,000 credits.
- Custom purchases use Whop's inline **one-time** plan, with a separate hidden product identified as `keplar-studio-custom-credits`. No pre-created pack plan is required. It never changes the customer's subscription.
- Optional preset packs use existing `WHOP_EXTENSION_PLAN_SMALL` / `WHOP_EXTENSION_PLAN_MEDIUM` and the existing extension credit settings. Their current USD price comes from Whop's `/variants/{id}` endpoint.
- Existing `WHOP_API_KEY`, `WHOP_COMPANY_ID`, `WHOP_WEBHOOK_SECRET`, durable storage (`DATABASE_URL` on Vercel) and an active stored Whop membership/customer binding are required. The card must be available for off-session use. Tax and Whop fees may apply in addition to the displayed base price and are disclosed at consent.
- The API key needs the scopes listed by Whop for [creating payments](https://docs.whop.com/api-reference/payments/create-payment), [retrieving payments](https://docs.whop.com/api-reference/payments/retrieve-payment), [retrieving memberships](https://docs.whop.com/api-reference/memberships/retrieve-membership), and [listing saved payment methods](https://docs.whop.com/api-reference/payment-methods/list-payment-methods). In particular, check `payment:charge`, `member:payment_methods:read`, membership/member reads and the plan/product creation permissions for custom amounts.
- The existing signed webhook endpoint must receive `payment.succeeded`, `payment.failed`, `refund.created` and `dispute.created`.

## Payment handling

Only a Studio credit-shortfall response triggers `POST /api/billing/studio-topup` with `action: recharge`. The server rechecks credit sufficiency and safety gates. It never charges because of a global pause, cooldown or unrelated entitlement failure.

Each charge first claims a durable, numbered attempt. Concurrent callers share that attempt. A timed-out create is never retried: it may have charged successfully. The signed webhook can recover its payment ID through the recorded attempt reference and random nonce. Credits are granted only after Whop confirms a paid payment with matching company, member, user, currency, reference and price/plan. Grants are idempotent by payment ID. Refunds and disputes revoke remaining credits.

The browser polls pending payments for about 30 seconds (plus network time), then pauses. Continue checks the existing payment instead of creating another one. Declines require reviewing and re-enabling the settings; all non-skipped attempts count toward the monthly cap. An unknown create with no response and no webhook remains locked: support must reconcile it in Whop, not delete the attempt or retry the charge blindly.

Settings and short-lived quotes are user data and are removed on account deletion. Attempts are retained financial records, including the consent snapshot. Account deletion removes the authorization for future charges.

## Validation

`node --import tsx --test tests/studio-topup.test.ts tests/limit-extensions.test.ts tests/whop.test.ts`

These tests stub every provider request and never charge a card. Cover live permission/setup validation separately with Whop's sandbox before enabling purchases for customers.
