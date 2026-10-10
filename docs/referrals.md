# Referral rewards

Code: `src/lib/referrals/{config,abuse,repo,http}.ts`, routes `/invite/<code>`, `/api/referrals`, `/api/referrals/redeem`, `/api/admin/referrals[/:id]`,
pages `/referral-terms`, Account → Invite friends, `/admin/referrals`. Tests: `tests/referrals.test.ts`, `tests/referrals-api.test.ts`.

## What it is (and is not)
- Every signed-in, email-verified account has a unique 8-character invite code and link (`https://keplar.one/?ref=<code>`, which redirects to `/invite/<code>`).
- A friend who opens the link, then creates a **new** account with a verified email, gets extra usage credit, and so does the referrer.
- **The reward is extra usage credit only**: a row in `limit_extensions` (pack `referral`, the same ledger as purchased packs, `src/lib/create/platform/extensions.ts`).
  There is no cash, payout, coupon, gift card or transfer anywhere in the code (a test greps the module). Credits are spent only on Lite/Plus/Pro
  after the plan's own allowance, with every per-request/day cap still applying; Free (free models only) and Business hold them until usable. They expire (default 180 days).
  Referral rows are excluded from the admin revenue report (they are not sales).

## Flow
1. `/?ref=<code>` (or `/invite/<code>`) sets `kp_ref` (HttpOnly, 30 d), `kp_ref_p` (readable flag, no code) and, if absent, `kp_dev` (HttpOnly random browser id), then redirects to `/signup?invited=1`. Nothing is rewarded on click.
2. After sign-in, the app (`ReferralClaim`) sees the flag and calls `POST /api/referrals/redeem`. The server reads the code from the HttpOnly cookie, never from the body.
3. `redeemReferral` decides: **block** (no reward), **hold** (admin reviews), **capped** (no reward), or **grant**.

## Abuse protection
| Rule | Result |
|---|---|
| One claim per new account (row id derived from the account; also unique per normalised mailbox: Gmail dots/`+tags`/googlemail) | later claims blocked |
| Self-referral: same account, same mailbox, same browser id as the referrer | blocked |
| Throwaway domains (built-in list + `KEPLAR_REFERRAL_BLOCK_DOMAINS`) | blocked |
| Same browser id already rewarded | blocked |
| Account older than `KEPLAR_REFERRAL_CLAIM_DAYS` (7) | no claim |
| Same coarse network (/24, /48) as the referrer; 3+ claims from one network; same non-public email domain as the referrer; 3+ friends from one company domain; referrer account < 24 h old | **held** for admin |
| Per referrer: `KEPLAR_REFERRAL_PER_MONTH` (5) and `KEPLAR_REFERRAL_LIFETIME` (20); whole program `KEPLAR_REFERRAL_DAILY_CAP` (100) a day | atomic counters; over cap = capped (neither side rewarded) or held |
| Kill switch `KEPLAR_REFERRALS=off` | links still open sign-up; nothing is granted |

Network, browser and mailbox values are stored only as keyed HMACs (`BETTER_AUTH_SECRET`); the admin page shows a masked address and the rule, never a hash.
Claims and counters are retained after account deletion (so delete-and-re-register cannot earn twice); they hold no chat content. The invite profile is exported/deleted with the account.

## Settings (env, with bounds)
`KEPLAR_REFERRAL_CREDITS_REFERRER` / `_FRIEND` (500 each, 50–5000), `KEPLAR_REFERRAL_VALID_DAYS` (180), `KEPLAR_REFERRAL_PER_MONTH`, `KEPLAR_REFERRAL_LIFETIME`,
`KEPLAR_REFERRAL_DAILY_CAP`, `KEPLAR_REFERRAL_CLAIM_DAYS`, `KEPLAR_REFERRAL_REFERRER_MIN_AGE_HOURS`. 500 credits ≈ $1.00 of model cost per side at most, only if spent.
The terms page, the Account panel and the admin page all read these values, so the copy cannot drift from the code.

## Honest limits
- The heuristics are not a guarantee against a determined farmer (a new browser profile plus a new mailbox on a different network earns one reward each, bounded by the caps above). The cost ceiling is `lifetime × credits` per referrer and `dailyProgramCap × (both credits)` per day.
- Caps and the "earlier claims" scan read the whole claims collection; fine for launch volume, move to an indexed query if claims pass ~50k.
- No email is sent to the referrer or friend (COMING SOON: a notification once a held claim is approved). They see the result in-app (toast and Account → Invite friends).
