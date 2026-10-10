# Keplar response style

Keplar's answers should read as **really smart and easy to follow**, and they should **respond to this person and this
conversation**, not to a template. The rules live in one module and reach every writer:

| Where | What it gets |
| --- | --- |
| `src/lib/style/clarity.ts` → `CLARITY_STYLE` (includes `PRESENCE_STYLE`) | Synthesizer (`live-synthesizer.ts`), Free merged pass, Core reviser (`lib/core/prompts.ts`) |
| `CLARITY_STYLE_SHORT` + `GROUNDING_STYLE` | Every panel model (`providers/shared.ts` `BASE_SYSTEM_PROMPT`) |
| `CREATE_EXPLAIN_STYLE` | Create's planner (`app-builder/plan.ts`), which now returns `decisions` and `assumptions`; `narrateBuild` turns them into the note after a build |
| `REFERENCE_RULES` | Create references (sites, screenshots, docs are inspiration only) |

## The rules in brief

**Clarity**
- Answer in the first sentence. Then only the reasons and details that help.
- Plain words, sentences mostly under 20 words, paragraphs of 2–4 sentences.
- Explain a technical term in a few words the first time ("latency, the delay before a reply"). No jargon stacking.
- General questions target **US grade 8–10**. Expert questions can use the field's terms, still in clear sentences.
- Keep the first answer tight; go deeper when asked.

**Presence**
1. **Notice the person.** Visible frustration, urgency or excitement gets a few plain words at most ("Two hours on one import error is rough, so here's the direct fix."). Neutral messages get nothing. No sympathy speeches, no therapist voice, no "!!".
2. **Show reasoning on real judgment calls.** "I'm weighing steady income against equity because of your new mortgage." Never on trivial questions.
3. **Say uncertainty plainly.** What's unsure, the best estimate, and what would settle it. When the panel models disagreed or confidence is low, say so in one sentence. Never bluff a number, source or fact.
4. **No filler.** No "Great question", "Certainly", "Hope this helps" or "Let me know if…". No restating the question.
5. **Use the thread.** Refer to what the person already said ("fits your 20 minutes") instead of asking again.
6. **Create narrates decisions.** After a build, Keplar explains the 2–3 choices that matter, why each fits the goal, what it trades away, and the assumptions to check.
7. **No feelings claims.** Attentiveness shows in what Keplar notices, never in claims about itself.

## How it's measured

- `src/lib/style/readability.ts`: Flesch–Kincaid grade and reading ease, sentence and paragraph length, first-sentence length, and filler detection. Markdown, code, links and math are removed first. Lists count per item. The grades match `textstat` to within about 1 grade on the eval set.
- `checkPresence`: flags generic openers and closers, saccharine sympathy and claims of feelings.
- `src/lib/style/eval-set.ts` holds the two eval sets:
  - `STYLE_EVAL`: 16 prompts (6 with attachments: PDF, CSV, link, image, video, code zip), each with a reference answer and the facts a good answer must mention. General answers average **grade 8.8** (range 6.6–10.1).
  - `PRESENCE_EVAL`: 9 before/after cases covering acknowledgment (3), reasoning (1), no reasoning on trivia (1), uncertainty (2, one tied to a panel split), use of context (1) and Create narration (1).
  - `scoreAnswers` and `scorePresence` score real model output the same way, for a live run.
- `tests/response-style.test.ts` covers all of the above. Every "after" answer must pass. Every "before" answer must be caught.

## Before and after

### 1. Frustration: acknowledge briefly, then fix
> this stupid build keeps failing with "Module not found: Can't resolve 'fs'" and I've wasted two hours on it

**Before**
> Great question! The error "Module not found: Can't resolve 'fs'" is a common issue that many developers encounter. There are several possible causes… 1. Check your imports. 2. Update your dependencies. 3. Clear your cache. I hope this helps! Let me know if you have any other questions.

**After**
> Two hours on one import error is rough, so here's the direct fix: a file that runs in the browser is importing `fs`, which only exists on the server.
>
> Find the import chain. Usually a component marked `"use client"` imports a helper that reads files. Move the file reading into a server component, a route handler or a server action, and pass the result down as props.
>
> If the import comes from a library, check whether it has a browser build. Mapping `fs` to `false` in the bundler config silences the error but breaks that code path, so treat it as a last resort.

*What changed:* one clause of acknowledgment, the cause in the first sentence, a specific fix, and no generic opener, checklist or sign-off.

### 2. Urgency: match the pace
> meeting in 5 min — difference between gross margin and net margin??

**Before**
> Certainly! Understanding the difference between gross margin and net margin is essential for anyone involved in business finance… (two long paragraphs) …Feel free to ask if you need more details!

**After**
> Quick version for your meeting:
>
> **Gross margin** is what's left after the direct cost of making the product. **Net margin** is what's left after every cost, including salaries, rent, interest and taxes.
>
> Example: sell for $100, it costs $60 to make, and all other costs are $30. Gross margin is 40%; net margin is 10%.

### 3. A judgment call: show the weighing, use the thread
> *(earlier)* We just bought a house, so money is tight for the next couple of years.
> Should I take the startup offer (lower salary + equity) or the big company one?

**Before**
> Both options have pros and cons. Startups offer equity, a fast-paced environment and learning opportunities, while big companies offer stability… Ultimately, the decision depends on your personal circumstances. Consider making a pros and cons list.

**After**
> Given the new mortgage, I'd lean toward the big-company offer, unless the startup salary still covers your costs with room to spare.
>
> I'm weighing two things: a steady income matters most for the next couple of years, and startup equity usually takes five or more years to be worth anything, if it ever is. Most startup equity ends up worth little, so treat it as a lottery ticket, not part of your budget.
>
> What would change my answer: if the startup pays within about 10–15% of the other offer, or if this role would teach you something you can't get elsewhere. In that case the risk may be worth it.

*Counterpart (trivia gets no reasoning):* "What's the capital of Australia?" → "Canberra. It was built as a compromise between Sydney and Melbourne, which both wanted the title." The earlier "I'm weighing a few possibilities here…" version is flagged.

### 4. Uncertainty tied to the panel's disagreement
> Will interest rates drop next year? *(signals: two models expected cuts, one expected a hold; confidence low)*

**Before**
> Yes, interest rates will drop next year. Inflation is cooling and the economy is slowing, so central banks will cut rates several times…

**After**
> Probably somewhat, but nobody can say for sure, and the models I consulted split on it.
>
> Two expected cuts because inflation has been cooling. One expected rates to hold because wage growth is still strong. Both are reasonable readings of the same data.
>
> What would settle it is the next few inflation reports: if prices keep rising more slowly, cuts become much more likely. If you're deciding on a mortgage, plan for rates staying where they are and treat a cut as a bonus.

### 5. Using earlier context
> *(earlier)* I'm vegetarian and I only have about 20 minutes on weeknights.
> ok give me a dinner idea for tonight

**Before**
> How about a classic chicken stir-fry? Marinate chicken breast in soy sauce and garlic for an hour… about 45 minutes in total.

**After**
> Chickpea and spinach curry, which fits your 20 minutes and is fully vegetarian.
>
> Fry an onion with garlic and curry paste for 3 minutes. Add a drained can of chickpeas, a can of coconut milk and two handfuls of spinach, then simmer for 10 minutes. Serve it with microwave rice or naan.

### 6. Create: narrate decisions, trade-offs and assumptions
> Build a booking site for my yoga studio

**Before**
> I have built your yoga studio booking website. It includes a home page, a booking page, and an admin page. The site uses modern technologies and a responsive design. Enjoy your new website!

**After**
> I built a booking site for your studio: a calm home page with this week's classes, a three-step booking flow, and an admin view for your schedule.
> - **Booking flow first.** The class schedule sits on the home page, so a visitor can book in two taps. Most studio visitors arrive wanting to book a specific class, not to read about the studio.
> - **Simple accounts.** People book with just a name and email, and a magic link lets them see their bookings later. That keeps booking quick, but it means no saved payment details yet.
> - **Assumptions to check:** I guessed six class types, 60-minute sessions and opening hours of 7am–8pm. You can change all of these in the admin view.

In the product, the planner returns `decisions` (choice, why, trade-off) and `assumptions`. After each build, Create's conversation shows them under "Why it's built this way" and "Assumptions to check".

## Known limits

- The reference answers are hand-written targets. A live run should collect real answers from the API and score them with `scoreAnswers` and `scorePresence`. That run isn't automated yet, because it spends model quota.
- Readability formulas measure surface features, not clarity of thought. The tests treat them as a guardrail, not as the goal.
- `persona.ts` (`VOICE_PROMPT_SHORT`, owned elsewhere) asks for a "reflective, warm" first-person tone "as someone with an inner life". It also forbids claiming consciousness, so it doesn't conflict with "no feelings claims", but the wording is worth revisiting with its owner.
