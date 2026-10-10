# Settings / account mega scan — 2026-10-06 (EDT)

## Method
- `/account` (`src/app/(marketing)/account/page.tsx`), `SettingsSections`, Memory / MFA / Passkeys / Data / Billing actions, `/api/account/**`.
- Tests: settings-tabs, memory, passkeys, mfa (subset), billing-audit/lifecycle contracts already on tree.

## Findings

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| S1 | — | Mutating account APIs use `assertSameOrigin` | **ok** |
| S2 | — | No creators’ ages/birthdates on account UI | **ok** |
| S3 | — | Settings tabs / sticky / search / deep-link contracts green | **ok** |
| S4 | P2 | Account module used boxed `outline` on focus-visible (overridden by globals; cleaned anyway) | **fixed** |
| S5 | — | No P0/P1 found | — |

## Counts
- Found: 0 P0, 0 P1, 1 P2 fixed
- Open: none blocking

## Deploy
- Commit `cc15427`; production `dpl_DTgqw66SupBPV1HPJokkY3vYJL1j` (same batch as Ask).

## Next
Auth / sign-in / welcome / invite.
