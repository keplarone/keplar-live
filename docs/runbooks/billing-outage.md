# Billing / entitlement incident

Source of truth: the workspace row (plan, status, period) written by verified Whop webhooks; the signed plan cookie is only a fallback and is ignored when the row says `canceled` or `unpaid`.

Signals: paid user shows Free; refunded user still paid; webhook failures in the Whop dashboard.

1. Webhook failing: Whop dashboard -> webhooks -> failed deliveries. 401 = secret mismatch (`WHOP_WEBHOOK_SECRET`), 503 = secret not set, 500 = handler error (see logs by `webhook-id`). Fix, then **resend** failed events (idempotent by id).
2. Paid user shows Free: ask them to press *Refresh plan* on Account (works only if no refund/dispute is on file). Otherwise check the payment in Whop and resend the `payment.succeeded` / `membership.activated` event.
3. Refund/dispute: the webhook sets the account to Free (status `unpaid`) and alerts the owner. Refresh plan will not undo it; restore by a new successful payment event or manually after review.
4. Never edit plan fields by hand without writing the reason in `docs/revamp/CHECKPOINTS.md`.
5. If checkout itself is broken: set nothing; the UI says "Checkout opens soon" when keys are missing. Hosted fallback exists when `WHOP_API_KEY`/`WHOP_COMPANY_ID` are set.
