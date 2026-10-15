# Everyday Wants

Wants now prepares a real request and uses Keplar's existing answer engine and connected-app gateway. It no longer presents the synthetic helper catalog, example.com OAuth, or a local form submission as production execution.

## Behavior

- Food and groceries collect items/customizations, delivery or pickup, an approximate area, and a budget.
- Shopping collects product requirements, budget, fulfillment, and area.
- Bookings collect a destination, dates/times, party size and requirements, and budget.
- Local services collect the work, area, timing, and budget.
- Advice and other everyday tasks go directly to Keplar. A photo can be attached for room organization or other visual questions.
- Follow-up answers stay with their request, including custom text. Failed preparation can be retried without losing the current question. New request clears the local conversation and photo.
- Answers stream in the same screen. Source links, connected-app activity, approvals, and receipts are shown there. After an approved action returns, Continue with this result passes its outcome back as explicitly untrusted data for the next step. It does not approve another action.

## Real execution

The user explicitly switches on connected apps for the request. The existing `/api/keplar` pipeline still checks the account plan, enabled tools, Ask grants, policy, schema, limits, metering, and approvals on the server. Adding a server or discovering a tool grants no permission by itself. Advice remains available without a connected provider; connected-app execution retains the existing plan requirements.

Connect/manage apps opens the existing connection manager in Wants. Provider OAuth can still require a provider-owned consent page. Keplar does not handle passwords, payment-card numbers, or authentication codes in the conversation.

The request context instructs the answer/tool planner to obtain a current provider quote, show the actual merchant/items or booking/destination/dates/total/terms, and obtain approval before any paid commitment. This is conversational guidance on top of the gateway's approval enforcement, not a provider-specific checkout or a server-side price-lock guarantee. Integrations must implement their own quote validation and idempotency semantics.

A completed tool call is not proof that a reservation, order, charge, or delivery happened. Provider confirmations and receipts are the evidence. Timeout and Stop messaging does not assert that nothing happened. Stop requests cancellation through Keplar's existing turn endpoint; it cannot undo a provider operation already running.

## Provider prerequisites (checked 2026-10-15)

This change does not provision merchant partnerships, API credentials, consumer OAuth clients, or payment services.

- DoorDash MCP: official docs describe a private beta with provider-provisioned OAuth clients and PKCE. It is currently for organizational/corporate ordering and explicitly unavailable for consumer-facing integrations. Do not advertise it as generally available in Keplar. Endpoint/setup instructions come from DoorDash after approval.
  - https://developer.doordash.com/en-US/docs/mcp/overview/about_mcp/
  - https://developer.doordash.com/en-US/docs/mcp/tutorials/get_started/
- Uber Consumer Delivery: official docs describe account linking, discovery, carts, ordering and tracking, but detailed specs and test credentials are early access, granted case by case. An approved integration is needed before native Uber ordering can be implemented and verified.
  - https://developer.uber.com/docs/consumer-delivery/introduction
- Accommodation, restaurant reservations and other bookings need a legitimate connected provider that exposes the relevant operations. Never invent a booking API or equate a provider's public homepage with a checkout.

Without an enabled relevant provider, Wants can advise, prepare the request, and use available web retrieval to find verified official options. It cannot place a real order or reservation just because this code is installed. Web retrieval remains subject to the existing deployment flags and plan limits.

## Legacy demos

The old fixture planner is lazy-loaded from `src/lib/wants/sandbox.ts` only with `KEPLAR_WANTS_SANDBOX=1` outside production. Production ignores the flag. Its placeholder OAuth endpoints also reject outside that explicit non-production mode. Existing fixture tests opt in locally. Old sandbox confirmation IDs cannot execute through the normal flow.

## Validation

`tests/wants-everyday.test.ts` covers the contextual question sequences, retained answers, custom input, advice routing, stale-answer filtering, and legacy confirmation rejection. `tests/wants-live-routing.test.ts` verifies default routing, production sandbox isolation, and preserved safety checks. The existing Wants API/browser/registry tests remain explicit fixture tests.

Live merchant ordering and booking, browser rendering, and full provider OAuth must be verified separately using approved accounts; no real purchases are made by these tests.
