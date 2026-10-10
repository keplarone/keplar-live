# Bank connections and analytics (BETA)

## Plaid (read-only, Hosted Link)
- Business > Connectors > "Bank accounts · Plaid". **Not configured** until the server has `PLAID_CLIENT_ID` and `PLAID_SECRET` (and `PLAID_ENV=sandbox` for Plaid's free test banks, or `production`; default sandbox). Nothing is shown as connected without them.
- Flow: Keplar creates a Plaid link token with Hosted Link; the browser goes to Plaid's own bank picker (no Plaid script runs in Keplar, so the Content-Security-Policy is unchanged); on return Keplar asks Plaid for the finished session, exchanges the public token and stores the access token encrypted with the workspace-bound key. Tokens never reach the browser.
- Shows balances and up to 25 recent transactions (money in is positive). Cannot move money. Disconnect tells Plaid to drop the Item and deletes our copy.
- Honest limits: a newly linked bank may say "still loading transactions" for a few minutes (Plaid `PRODUCT_NOT_READY`). The bank/institution name comes from the link session result and falls back to "Bank".
- **Tested:** unit tests with mocked Plaid responses (`tests/banks-plaid.test.ts`) and a browser test of the Not-configured state (`e2e/connectors.e2e.ts`). **Not tested against real Plaid**: that needs your Plaid keys; the sandbox test (bank "First Platypus", user `user_good` / `pass_good`) is pending them.

## Stripe Financial Connections (read-only)
- Business > Connectors > "Bank accounts", button **Connect with Stripe**. Hidden from regular users until the server has `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`, both matching `KEPLAR_STRIPE_MODE` (`rk_`/`sk_` and `pk_` of that mode). The Connect webhook secret is not used. Admins see the missing names under Setup needed.
- Flow: Keplar creates a Stripe Customer for the workspace and a Financial Connections session with permissions `balances` and `transactions` only (no `payment_method`, no `ownership`), US institutions, manual entry off. The browser loads Stripe.js on `/app` only and opens Stripe's bank window. On return, Keplar stores the account ids encrypted with the workspace-bound key. The secret key and the session client secret never go into the bank list.
- Shows balances (Stripe's cent amounts converted to dollars; positive means money the holder has) and up to 25 recent transactions (positive cents move into the account). Disconnect tells Stripe to drop access and deletes our copy.
- Content-Security-Policy: `https://js.stripe.com`, `https://connect-js.stripe.com`, and `https://hooks.stripe.com` are allowed on `/app` pages only (`script-src` / `frame-src`), plus `https://api.stripe.com` on `connect-src`. The rest of the site still blocks those hosts. `/app` uses `Cross-Origin-Opener-Policy: same-origin-allow-popups` so a bank's login popup can return.
- **Tested:** unit tests with a fake Stripe client (`tests/banks-stripe.test.ts`). **Not tested against a real bank**: that needs your Stripe keys. In test mode, search for **Test (Non-OAuth)** or **Test (OAuth)** (no password). **Bank (Non-OAuth)** accepts any username and password.

## Analytics
Overview already had revenue, orders, leads and traffic from real orders and page views. Added **Conversion · 14 days** = paid orders / site views over the same window; it shows "—" with an explanation when there are no views, never 0%.
