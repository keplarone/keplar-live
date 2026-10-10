# Retention: why would someone come back?

Facts only; no retention data exists yet (zero known paying customers at the time of writing), so everything about *rates* is labelled assumption in [MODEL.md](MODEL.md) and has to be measured.

## 1. The recurring reason to return (hypothesis)
For the chosen segment (independent developers and technical solo founders), the recurring job is **pressure-testing the next technical or product decision**: stack choices, schema design, build-vs-buy, pricing, "is this safe". A solo builder faces such decisions weekly and has no colleague to argue with. Keplar's reasons to return are:
1. A **second opinion on each new decision**, with the places the models split shown.
2. **Saved history**: decisions and the reasoning behind them can be found again (saved chats exist when signed in; search/history is in the product).
3. **Optional memory** (exists when signed in; per-account and user-controlled) so context about the project need not be retyped each time.
4. **Shared answers** for teammates or co-founders (the link built in this work).
Whether this is a weekly habit is unknown: it is the retention hypothesis H-return (see [EXPERIMENTS.md](EXPERIMENTS.md)). The measure is *repeat usage*: an account with at least 2 synthesized answers on 2 different days in its first 14 days.

## 2. What exists in the product (verified in the repo)
Saved chats and history when signed in, optional memory, copy, daily usage meter and reset time, the 5-hour and weekly credit windows with reset times. What is missing for retention: a gentle "come back with the next decision" prompt (needs email, which stays inactive), saved *decision* notes (a "decision log" view), and a way to re-run an old question later to see if answers changed (the Node.js LTS run is an example of why).

## 3. Onboarding guidance that supports return
First-run `/welcome` flow (5 steps) now offers decision-style starters for the "coding" interest; the first synthesized answer tells the user to save or share it and shows "Ask a follow-up" and history. Three **inactive** lifecycle drafts are in [campaign/EMAILS.md](campaign/EMAILS.md): a day-1 "your first decision" message, a day-4 "a decision you are about to make" prompt, and a day-10 "what would make this more useful" ask. **They are not wired to any sender**; no email will be sent until the founders approve copy, sender domain, an unsubscribe path and consent basis.

## 4. Feedback and cancellation (never blocks cancellation)
- `/feedback` collects problems, ideas, and cancel reasons (`?kind=cancel`), with an optional email only if the user wants a reply. The form says plainly that cancellation is separate and not affected.
- Cancellation itself stays the existing Whop-managed flow. **Follow-up:** add a link "Tell us why (optional)" next to cancel in the account page (file owned by another workstream, see [COORDINATION.md](COORDINATION.md)). It must never be a required step, never gate the cancel button, and never show a retention offer that hides cancel.
- Reasons are stored as one of a fixed list plus optional free text, with no prompt content, and appear aggregated in `/admin/growth`.

## 5. Retention review (method, to run when data exists)
Cohort by signup week and by source (utm_source/channel A vs B, share links, direct) and by plan (Lite/Plus/Pro). Weekly view: activated users returning in week 2 and 4; paying customers retained at month 1, 2, 3; refunds and cancel reasons. Do not read cohorts under 30 users; label small samples "too early". Review cadence: every Friday during the 90 days ([PLAN-90.md](PLAN-90.md)).

## 6. Fix causes of churn before expanding acquisition
Known or likely causes to fix first (observed or inferred; none verified as causes of customer churn yet):
- Slow answers (median ~19 s, up to 40 s) and one in four panels missing a model: reliability work and clearer progress.
- Stale facts (the Node LTS miss): the product says "Keplar can be wrong, even when models agree"; real-time lookups are not live. Do not promise currency.
- Verifier not always independent of the panel.
- Free-capacity ceiling ("you have reached today's limit") shown to people who haven't seen the value yet.
- Plan fit and price (Plus is 2.25x Lite).
**Rule:** if the first 10 paying customers show a repeated cancel reason, fix that before sending more traffic to the same flow. Stop-the-line threshold (assumption): if 3 of the first 10 payers cancel or ask for refunds within 14 days citing the same reason, pause new acquisition posts (Channel A, B) until a fix ships.
