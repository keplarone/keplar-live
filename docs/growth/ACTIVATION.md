# Activation: from landing to a first useful answer

## Definition (used by the dashboard and every experiment)
**Activated** = a browser (or account) got a finished answer **and then did a deliberate action** on it: opened a detail section (consensus, models, disagreements, verification, reasoning), copied the answer, shared it, retried it, or asked a second question. Reading alone is not counted; one completed answer with no action is a "got an answer" but not activated. **Repeat use** = finished answers on two or more different days. **Time to first result** = seconds from pressing send to the finished answer. **Abandonment** = a started question with no finished answer or error after 3 minutes. Why this definition: an answer is the product's promise; the action shows the user engaged with the *difference* (agreement/disagreement) or took the result away. Whether activation predicts payment is unproven (experiment E4).

## Measurement (first-party, minimal, consent-gated)
Events (`src/lib/growth/events.ts`): `ask_started`, `ask_done` (seconds, models consulted/responded, disagreement yes/no, single/consensus), `ask_error` (network/server/no_response/limit), `answer_action`, `share_dialog`, `share_created`, `feedback_submitted`, `upgrade_click`. Stored: event name, a random browser id, a short ask id, coarse numbers. **Never stored:** prompt or answer text, uploads, emails, account ids, IP, user agent, referrer URL. Collected only after the visitor allows Analytics in the cookie banner (also re-checked on the server) and skipped for Global Privacy Control / Do Not Track. Retained 180 days. Tests: `tests/growth-events.test.ts`. Landing-side steps (landing view, CTA click, signup, first prompt, synthesis success) come from the SEO workstream's `seo_events`; the dashboard merges both.

## What was improved (shipped 3 Oct 2026)
| Step | Before | Now |
|---|---|---|
| Landing relevant to a first task | Generic home | `/for-developers`: headline about the job, 3 example decisions (click to open the app with the question prefilled, unsent), what we saw when we tested (including failures), when not to use it |
| First prompt | Onboarding "coding" starters asked for code (one answer, nothing to compare) | Decision-style starters (trade-offs, "what would change your mind") where models are more likely to differ |
| Result explanation | A percentage ring "Consensus 87%" read as accuracy | "N of M models" with "Models agree / split / No majority", plain sentence "Agreement is a good sign, not proof", and when they did not fully agree a callout "N models did not fully agree. See where they split" opening Disagreements |
| Progress | Six-stage stream (existing) | unchanged; measured |
| Error recovery | Messages exist ("You're asking quickly", daily limit with reset time) | measured by `ask_error` kind; follow-ups below |
| Share | none | revocable answer link ([SHARING.md](SHARING.md)) |
| Feedback | none | `/feedback` page and endpoint |
Screenshots recorded 2026-10-03 on the live site are in `docs/growth/screenshots/` (home, app empty state, `/for-developers`, `/feedback` research and cancel on desktop 1440 px and mobile 390 px).

## Verified
Playwright on the live site (Chromium, 3 Oct 2026): `/for-developers`, `/feedback?kind=research`, `/feedback?kind=cancel` at 1440 and 390 px: exactly one h1, no horizontal overflow, axe-core WCAG 2.0/2.1 A/AA: **0 violations**. Unit tests: 611 pass in the HEAD copy.

## Honest finding about the product
Across 12 multi-model runs, a visible disagreement appeared in 2 (17%); 5 of the 5 saved "pick one" developer prompts (R1-R5) ended in agreement. So a newcomer will usually see "models agree", which is a weaker first impression of the multi-model idea. Consequences: (1) landing and prompts steer to trade-off questions; (2) the agreement case must still deliver value (one answer, what would change it, saved to history); (3) the pitch says "see where they split *when they do*"; never implies splits are common. Also note 3 of 12 runs had one model fail, and median time was ~19 s: both appear in the dashboard.

## Follow-ups not done (files owned by other workstreams or needing decisions)
1. Landing-to-composer: in `KeplarApp.tsx` (modified by others) show a one-line "what happens next" under the composer for first-time users and a friendly retry button after `no_response`.
2. Free-limit message names the wrong next plan (Plus; for this segment it is Lite).
3. Reduce wait: show partial per-model answers earlier (design/perf decision).
4. Time-to-first-result target (assumption): median under 20 s, p90 under 45 s; first real numbers come from `/admin/growth` after consenting traffic.
