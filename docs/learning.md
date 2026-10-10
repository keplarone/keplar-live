# How Keplar learns (system-level learning)

**The AI models are not retrained, fine-tuned or changed in any way.** Keplar learns at the system level: it remembers
things about *you* (so answers fit you), and it keeps score of *which models and modes worked for which kind of question*
(so routing gets better). Everything below is bounded by fixed guardrails, versioned, logged and reversible.

This is what the product says in Settings and on `/admin/learning`; keep the two in step with this page.

## 1. Learning about you (after every prompt)

Signed-in people only, with **Memory** on (the existing switch in Settings, on by default, off = nothing new is saved and
nothing saved is used). Anonymous visitors get no memory at all.

- After each real answer a **free** model reads *only your own typed message* (never documents you upload; short messages
  only; small talk skipped) and may save up to three short third-person notes: `name`, `goal`, `preference`, `project`,
  `fact`, **`style`** (how you like answers written: tone, length, format) and **`correction`** (something you corrected,
  stored as what is right, never as the mistake). Code: `src/lib/memory/extract.ts`, `facts.ts`.
- Every note is checked before saving (`cleanFact`): passwords, keys, tokens, card/IBAN/SSN numbers, **birthdates** (words
  and numeric dates), addresses, phone numbers, emails, links, and anything that reads like an instruction to the assistant
  are refused. A saved note must share a word with what you actually wrote (no inventing).
- The next prompt gets the relevant notes (token-capped, fenced as data, never instructions). Names, preferences, styles and
  corrections always qualify.
- You can **view, edit, add and delete** every note and erase all of it (Settings → Memory), or say "forget that".
  Costs no credits.

## 2. Learning which models to use (router learning)

**What is recorded after each prompt** (`src/lib/learning/record.ts`, collections `system_learn_*`): the question *type*
(classifier kind + complexity, e.g. `code:complex`), plan tier (Free / paid), mode (single / consensus), each panel model and
whether it answered and whether it agreed with the majority (only when 3+ answered), latency, credits used, and which
policy version was routing. **No prompt text and no account id**: the key is a salted one-way hash only the owning
account can recompute (needed so a thumbs-up can find its turn and nobody can vote on someone else's).
Anonymous visitors are counted the same way (operational numbers only).

**Feedback** (`POST /api/learning/signal`): thumbs up/down, copy, regenerate ("Ask again"), and a follow-up that says the
answer was wrong ("no, that's wrong", "that's not what I asked", "actually, I meant ..."). Counted once per turn and kind; a
vote can change. Each signal updates the tallies of every model that took part.

**How it is used** (`bandit.ts`, `active.ts`, `warm.ts`, router): each model on each question type is an *arm* with
evidence-weighted successes and failures. Its quality is a Beta posterior shrunk toward the question type's pooled mean (a few
lucky answers move nothing), scored with an upper confidence bound (a little optimism for models we know less about: the
exploration part of a bandit; no randomness, so results are reproducible). That becomes a **multiplier on the router's own score**:

| layer | span | changes |
|-------|------|---------|
| live (from running tallies) | ±8% | continuously, refreshed at most once a minute per server |
| promoted policy | ±25% | only through the nightly pipeline or an admin |
| combined | clamped to 0.8–1.3 | always |

**Minimum samples:** a model's numbers count after **20** turns on a question type; a question type is scored only after
**60** turns and with **two** seasoned models. Below that the multiplier is exactly 1 and the dashboard says "collecting".

**Guardrails.** The multiplier is applied in `CostAwareRouter.eligible` *after* every filter, so it can only reorder models that
already qualified: Free plan = free models only and no judge, vision-only for media, retention rules for the sensitive tier,
excluded providers, context window and price. Panel size, verifier and judge are not touched. A model that fails half the time
on a question type is shown as **breaker tripped** and ranks last through the same maths. `KEPLAR_LEARNING_OFF=1` (env) or
the admin **Freeze** makes every multiplier exactly 1 (the router is the plain baseline) within a minute.

## 3. Nightly self-improvement (`/api/cron/learning`)

Runs once a day (`vercel.json`, `37 4 * * *` UTC; fits the Hobby cron limit). Protected by `CRON_SECRET` (same as the
domains cron; without it the endpoint answers 401 to everyone).

1. Reads the last 30 days of content-free outcomes and the consented failure cases. Outcomes older than 45 days are purged.
2. **Circuit breaker:** if turns under the active policy score at least 5 points below the turns before it (100+ turns on each
   side), it is rolled back automatically and logged.
3. Splits outcomes (stable hash): 80% train, 20% **held out**. Learns a candidate policy from the training share with the same
   Bayesian rules and a ±25% span.
4. Runs **the eval set** (`tests/fixtures/eval-set.ts`, 44 prompts incl. the identity-guard prompts) plus consented failure
   cases through the **real router** under the current policy and the candidate, in six plan situations (Free, Plus, Pro, Pro
   with images, Pro sensitive, Plus without one provider). Checks (`suite.ts`): fixed guard replies still come from the code
   path no policy can reach; Free plans contain only free models, no judge, within the panel cap; images only go to
   vision-capable models; the sensitive tier never gets a retention-mandating model; excluded providers stay excluded; plan shape
   (mode / panel size / verifier / judge) unchanged; plan cost not noticeably higher. Then it estimates, on the held-out
   evidence, which policy would have chosen the better panel (wins / losses / ties, per-question-type regressions).
5. **Auto-promotes only if** every check passes, no question type got worse, wins exceed losses, the gain is at least 0.003,
   there are at least 30 held-out turns, and the change is **small**. A change is **large** (needs an admin) if it touches
   4+ question types, moves any model by more than 0.15, or raises plan cost by more than 3%.
6. Every candidate is saved as a **version** with its diff, evidence, checks and status (`active`, `superseded`,
   `rolled_back`, `pending_approval`, `rejected`, `failed_checks`). Only one proposal waits for an admin at a time.

**What it can change:** a router policy, a closed shape of bounded multipliers (`policy.ts` validates tier, question-type
pattern, model-id pattern and range; nothing else is expressible). **What it can never change:** code, secrets, billing,
prices, plans, prompts, the synthesizer/voice, and the fixed guards (human reply "No.", conscious reply, who-made-Keplar
answer, age rule). Prompt-text candidates are **not** implemented: the answer prompts belong to the voice/persona work and are
not touched by this loop (only router-policy candidates are live).

**Failure cases (consent-gated).** "Help improve Keplar" in Settings is **off by default**. Only if a signed-in person turns it
on, a question that failed (no model answered, thumbs-down, regenerate, correction) is kept as a *shortened, cleaned* copy
(emails, links, long numbers, key-like strings removed; dropped entirely if it looks sensitive) in their own workspace, so it
appears in their data export, can be deleted in Settings, and is deleted when they turn the switch off or delete the
account. Never kept for anonymous visitors. They are added to the nightly safety checks and shown (redacted, no account) on
the admin page. Without consent, only the question *type* and the outcome numbers exist.

## 4. Admin: `/admin/learning`

Admin only (same gate as `/admin`). Shows: the active policy, turns recorded, baseline score, last run; **controls**
(one-click **Roll back**, Freeze/Unfreeze, Dry run, Run nightly job now); proposals waiting for approval with their evidence
(Approve re-runs the safety checks; Reject); scoreboards per question type and tier (turns, quality, latency, credits, current
boost, "collecting" / "breaker tripped"); **win rate by policy version** (mean turn score vs the baseline); feedback seen; the
full promotions / rollbacks log; and the consented failure cases (redacted). API: `POST /api/admin/learning`
`{ action: rollback | approve | reject | restore | freeze | unfreeze | run, version?, reason?, dry? }`. Every action is written
to the admin audit log. Rollback puts back the version the policy replaced (or the plain baseline).

## Honest limits

- "Win rate" is an **offline estimate** on held-out outcomes plus per-version live turn scores; it is not a randomised A/B test.
  Early on there is little data and nothing is promoted: that is intended.
- Agreement between models is a proxy for quality, not truth; feedback is sparse. Both are weighted modestly.
- Multiplier changes can only reorder close calls; they cannot make a weak model beat a much stronger one.
- Tallies are per server-minute cached; a promotion or rollback reaches all servers within about a minute.

## Where things are

The code lives in the folder `src/lib/learning`. The routes are the signal and consent endpoints under `src/app/api/learning`, the nightly job at `src/app/api/cron/learning`, and the admin endpoint at `src/app/api/admin/learning`. The dashboard page is `src/app/admin/learning`, the consent panel is `src/components/account/LearningConsent.tsx`, and the tests are in `tests/learning.test.ts`.
