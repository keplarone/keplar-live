# Marketing / landing / pricing / billing mega scan — 2026-10-06 (EDT)

After Auth deploy (`dpl_3F8m7Hji3Z8zZDnrw9vXGURwJvGT`).

## Method
- Surfaces: `/` (MonolithHome + sections), `/pricing`, `/checkout`, PlanCta / WhopEmbed / CheckoutStart, `/api/billing/*`.
- Tests: billing-audit, billing-lifecycle, site-features-checkout (13/13 with lifecycle+checkout).

## Findings

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| M1 | — | Billing APIs use `assertSameOrigin`; Whop purchase URLs restricted to `*.whop.com` | **ok** |
| M2 | — | Embedded checkout: browser metadata cannot grant tier (only known Whop plan id) | **ok** |
| M3 | — | Tier prices match `PAID_PLANS` ($20/$45/$99); Lite gated until WHOP_PLAN_LITE | **ok** |
| M4 | — | Checkout redirects unsigned users to `/signin?next=/checkout?plan=…` safely | **ok** |
| M5 | — | Home canvas `#0b0b0d`; tokens ink-only accent; no creator ages/birthdates | **ok** |
| M6 | P2 | Home/sections/billing CSS had boxed focus outlines + FieldHome “blue accent” comment | **fixed** |
| M7 | — | No P0/P1 found | — |

## Counts
- Found: 0 P0, 0 P1, 1 P2 fixed
- Open: none blocking

## Deploy
- Commit `4789da2`; production `dpl_DpNk6MqKKZF6ADLXu1hkdA2YCngm` → https://keplar-ayruvdg8b-team-6667.vercel.app aliased to https://keplar.one.

## Next
Feature surfaces: Debate, Study, Slides, Deep Research, docs/blogs, admin, API health.
