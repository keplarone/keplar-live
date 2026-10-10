# Legal pages: decisions made, and what is still open

Pages: `/terms` and `/privacy` (content in `src/components/legal/content/`, renderer in `src/components/legal/LegalPage.tsx`).
There are no separate cookies, acceptable use, refund, DPA or subprocessor pages: cookies and subprocessors are sections of the
Privacy Policy, and acceptable use ("Prohibited uses") and refunds are sections of the Terms.

Status (Oct 3, 2026): both pages are in effect, drafted by the Keplar team, **not reviewed by an attorney** (each page says so in its footer).
Anything in the text must match the code; `tests/legal.test.ts` pins the numbers (45-day learning records, 90-day share links,
180-day events, 5-person question threshold, 7-day provider copies) and the provider list to the code constants.

## Still open: only the founders can supply these (shown on the pages as marked notes, never guessed)

| # | Missing fact | Where it shows | Notes |
|---|---|---|---|
| 1 | Legal entity name and where it is registered | Terms > The agreement; Terms > Contact; Privacy > Contact; footer (`site.legalEntity` in `src/lib/site.ts`) | Until set, pages say "Keplar One" (the company name) only. |
| 2 | Postal address for legal notices | Terms > Contact; Privacy > Contact | Until set, legal notices go to team@keplar.one. |
| 3 | Governing jurisdiction (and so the court venue) | Terms > Governing law (inline placeholder `[[governing jurisdiction...]]`) | Replace the placeholder text in `terms.ts`; the disputes clause already points to "the courts of the governing jurisdiction". |

Removing a note: when a fact is known, edit the text, delete that `review` block, and update the expected list in `tests/legal.test.ts`.
Also have the contracting party's legal capacity to sign checked by counsel or a parent/guardian before the entity is registered.

## Also for the founders (not legal text, but connected)

- Counsel review of both pages is still the right next step; remove the "not reviewed by an attorney" footer only after it happens.
- Annual plans, top-ups and a lifetime plan are not offered, so the Terms say monthly billing and no extra Usage purchases. Update both if that changes (`docs/growth/OFFER.md`).
- Provider terms: the Terms pass through provider usage policies and the no-competing-model rule. Nobody has checked every provider's current terms against the output-ownership wording (OpenRouter free models differ per host).
- Inngest (background jobs for Business agents), Sentry and Upstash may receive operational data when configured. Upstash is listed; confirm whether Inngest and Sentry are used in production and add them to the Privacy Policy if they are.

## Decisions made (recommended, conventional choices)

| Topic | Decision |
|---|---|
| Minimum age | 13 for an account; under 18 only with a parent or guardian's permission; a higher local age applies where the law sets one. Sign-up checkbox and OAuth line say so. |
| Sanctions | Not offered where U.S. export controls or sanctions law prohibit it. |
| Acceptable use | "Prohibited uses" is the AUP; provider usage policies apply too. Fraud/phishing/spam added. |
| Regulated topics | Not restricted; clear "not medical, legal or financial advice" and emergency wording. |
| AI disclosure | "You are talking to an AI"; asked "Are you human?" Keplar answers "No." (the fixed reply). Nothing is claimed about consciousness. |
| Content license | Narrow: only to run the service for you; no model training; the opt-in "Help improve Keplar" exception (off by default) is stated. |
| Output ownership | We assign whatever rights we have; no uniqueness or non-infringement promise. |
| Provider pass-through | Follow provider policies; no using outputs to train a competing model unless the provider allows it. |
| Plan changes | Pricing page is part of the Terms; 30 days' notice for a price rise or a meaningful allowance cut, effective next period. |
| Keplar Usage | Resets on the billing date; no rollover; no top-ups today; plan limits live on Pricing/in-app. |
| Billing | Monthly, USD, in advance, through Whop; taxes added where required. |
| Renewal / cancellation | Auto-renews monthly; cancel any time in Account > Manage billing (Whop); access to period end. |
| Refunds | Full refund of the first payment if asked within 7 days; no proration afterwards; mistaken charges and our own terminations refunded; statutory rights unaffected; a refund or dispute moves the account to Free (what the billing code does). |
| Generated media | Only upload what you own; real people must have agreed; no deceptive depictions; label AI media where required or misleading; publisher responsible. |
| Agents | User responsible within granted permissions; safety rules and the Terms can't be overridden by permissions. |
| Business / API | Business agreement wins on conflict, no SLA unless it says so; API under these Terms, no resale-only products. |
| Termination | Export and delete in Account > Your data; paid time kept to period end; refund unused time if we end access without a breach. |
| Disclaimer / liability | "As is"; cap = greater of fees paid in the last 12 months or US$100; no indirect damages; carve-outs for fraud, willful misconduct, personal injury. |
| Indemnity | Users cover third-party claims from their input, published content or breach, where the law allows; no Keplar indemnity for outputs outside a Business agreement. |
| Disputes | 30 days of informal resolution, then the courts of the governing jurisdiction; no mandatory arbitration, no class-action waiver. |
| Changes | 30 days' notice for material changes by email or in-app. |
| Subprocessors (Privacy) | Vercel, Neon, Resend, Whop, Google/Microsoft sign-in, OpenRouter, OpenAI, NVIDIA, Higgsfield, Upstash (when configured), Stripe (Business sellers only, not Keplar billing). |
| Retention (Privacy) | Per the code: chats/memory until deleted; learning records 45 days; events 180 days; rate-limit counts 60 days; share links 90 days; provider copies of media at least 7 days. |
| Certifications | None claimed; the Security section says there is no certification or audit. |
