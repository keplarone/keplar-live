# Auth / sign-in / welcome / invite mega scan — 2026-10-06 (EDT)

After Ask + Settings deploy (`dpl_DTgqw66SupBPV1HPJokkY3vYJL1j`).

## Method
- Surfaces: `/signin`, `/signup`, `/welcome`, `/invite/[code]`, magic link, password, OAuth, MFA, passkeys, desktop auth, recovery (`forgot`/`reset`/`verify-email`), SavedAccounts.
- Tests: password-auth, magic-link, oauth, launch-auth, mfa-signin, passkeys-signin, desktop-auth (55/55), onboarding (+api), referrals (+api), security (open-redirect + same-origin).

## Findings

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| A1 | — | `authRedirectPath` / `safeCallbackPath` refuse absolute, `//`, backslash, control chars, auth-page loops | **ok** |
| A2 | — | Password / magic / passkey / desktop / MFA plugins use same-origin Origin checks | **ok** |
| A3 | — | Invite route rate-limits, validates code, hardcodes `/signup?invited=1` (no open redirect) | **ok** |
| A4 | — | Welcome uses `afterWelcomePath`; hostile `next` flattened; no creator ages/birthdates | **ok** |
| A5 | — | Auth unit matrix green (55); onboarding 16; referrals+security green | **ok** |
| A6 | P2 | `auth.module.css` / SavedAccounts / onboarding CSS claimed “blue accent” and boxed `outline` focus (globals already kill outlines; cleaned to match Settings) | **fixed** |
| A7 | — | No P0/P1 found | — |

## Counts
- Found: 0 P0, 0 P1, 1 P2 fixed
- Open: none blocking

## Deploy
- Commit `ff9568f`; production `dpl_3F8m7Hji3Z8zZDnrw9vXGURwJvGT` → https://keplar-13t06s755-team-6667.vercel.app aliased to https://keplar.one.

## Next
Marketing / landing / pricing / billing hooks.
