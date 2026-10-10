# Asynchronous customer-research kit (developers and technical solo founders)

**Status: built and live; no response has been collected.** Nothing in this repo is, or may be described as, an interview, a testimonial or validation until a real person has submitted it. All outreach text here is a **draft for the founders to review and send themselves**.

## What exists
- **The form:** `https://keplar.one/feedback?kind=research` (ten short questions, optional role, optional contact permission). Anonymous by default; signed-out visitors can use it. Stored in the `feedback` collection as plain text; shown only in the admin growth view (`/admin/growth`, counts) and to the team. Rate limited (8 submissions per hour per IP), honeypot, 3,000-character cap, same-origin only. It never blocks using or cancelling the product.
- Other short forms on the same page: `?kind=idea`, `?kind=problem`, `?kind=cancel` (cancellation reason, optional, see [RETENTION.md](RETENTION.md)), `?kind=general`.
- Add `&from=<where-you-posted>` to a link so the answers can be grouped by source (letters, digits, `:_.-`, 60 characters). Example: `/feedback?kind=research&from=hn-comment`.
- Email is stored only if the person ticks "you may contact me" and types an address.

## The ten questions (identical in the form; source: `src/lib/growth/research.ts`)
Designed to learn behaviour and past decisions, not opinions about Keplar. Questions 1-7 do not mention the product.
1. What is the last technical or product decision you made where you were not sure?
2. Before you decided, what did you do? (asked an AI chatbot, searched, read docs, asked a person; which tools)
3. Did you ask more than one AI model the same question? If so, why, and what did you do when they disagreed?
4. How long did that take, and what was the most annoying part?
5. Have you ever acted on an AI answer that turned out to be wrong? What happened?
6. How often does a decision like this come up (per week or per month)?
7. What do you pay for AI tools today, if anything? (optional, a rough monthly range)
8. If you tried Keplar on a real question, what would the answer need for you to trust it enough to act on it?
9. What would make you not come back to a tool like this?
10. If you could change one thing about how you get second opinions today, what would it be?

## Recruiting copy (drafts; nobody has been contacted)
Rules: say who you are, that it is a research request, how long it takes, that it is anonymous, and that there is no obligation. No incentives that cost money. No sending in bulk; no sending to people who have not shown the problem in public. Venue rules apply (see [CHANNELS.md](CHANNELS.md)).

**Short post (for a community thread where the venue allows it; adapt to its rules):**
> I'm Hassen, one of two people building Keplar (an app that asks several AI models the same question and shows where they disagree). Before I build more, I'm trying to understand how solo developers actually make technical decisions when there's nobody to ask: which tools, what goes wrong, what you'd never trust an AI with. Ten short questions, anonymous, 5 minutes, no sign-up and nothing to buy: keplar.one/feedback?kind=research&from=<venue>. If you've got one story about an AI answer that burned you, that alone helps. Happy to share what I learn back here.

**Direct message (founder-written, one person at a time, only to someone who publicly described this problem; never bulk):**
> Hi <name>, I saw your <post/comment> about <the specific thing they said>. I'm building something around that exact problem and I'd rather learn from your experience than guess. Would you answer ten short questions (anonymous, 5 minutes, async, nothing to buy)? keplar.one/feedback?kind=research&from=dm. If you'd rather not, no problem at all.

**Existing-user prompt (in product or email, to people who already used Keplar; inactive until approved):**
> You asked Keplar a few questions. Two founders read every reply, so one honest paragraph about what was useful and what wasn't would help more than a rating. keplar.one/feedback?kind=research&from=user

## How to run it (async, no calls)
1. **Target:** 15-25 completed forms from people who match "independent developer / technical founder who makes their own stack decisions". Stop earlier if the same answers repeat (saturation).
2. **Send one at a time**, record in the tracking sheet below which venue/person got which version (never store contact details here).
3. **Read raw answers weekly**, 30 minutes, in `/admin/growth` (counts) and the `feedback` rows (ask the backend/admin to export them; there is no public view).
4. **Never reply publicly with product pitches** to answers; thank, and ask a follow-up question only if the person ticked "you may contact me".

## Organizing the findings (method)
1. **Copy each answer verbatim** into a sheet: one row per respondent, one column per question, plus `from`, role, date. Do not paraphrase or fix grammar.
2. **Tag each answer** with 1-3 short codes made from the respondent's own words (e.g. `checks-twice`, `trusts-for-boilerplate-only`, `stale-versions`, `price-too-high`). Reuse codes; merge near-duplicates after the first ten.
3. **Count, don't weigh.** For each code: how many respondents (not mentions). Mark anything with fewer than 3 respondents as "anecdote".
4. **Evidence grades:** *Behaviour* (what they did, e.g. "pasted into three chatbots last week") outweighs *intent* ("I would pay for...") outweighs *opinion*. Only behaviour and money paid count toward validating a segment.
5. **Decision questions the data should answer** (write the answer and the count next to each in a doc, or "not enough data"):
   - Does the job (pressure-test a technical decision) occur at least weekly for most respondents? (Q6)
   - Do they already compare models by hand? How? (Q2-Q3)
   - What did a wrong AI answer cost? (Q5)
   - What do they pay today? (Q7) Is $20 within range? Is $45? (infer only from Q7, never ask leading price questions)
   - What must an answer contain to be trusted? (Q8) Feed back into the answer UI and the landing page.
   - What makes them leave? (Q9) Feed into [RETENTION.md](RETENTION.md).
6. **Stop/continue rule:** if after 15 completed forms fewer than 5 describe the job as recurring *and* already working around it (multiple tools, manual comparison), the segment hypothesis is **not supported**; switch to the next segment in [SEGMENT.md](SEGMENT.md) rather than polishing copy.
7. **Publishing findings:** only aggregate counts and short quotes **with the respondent's permission**; label the sample size and how people were recruited. Never describe a handful of answers as market validation.

## Tracking sheet (columns; copy into a spreadsheet)
`date | venue/source (from=) | role | q1 ... q10 (verbatim) | codes | behaviour or intent? | permission to quote (Y/N) | follow-up allowed (Y/N)`

## Open decisions for the founders
- Who sends recruiting messages and from which accounts (nothing is sent automatically).
- Whether to also run the form from the signed-in app (a "Tell us" link after the 3rd answer) once the activation baseline is known.
- Privacy page wording for feedback (see [IMPLEMENTED.md](IMPLEMENTED.md), follow-ups).
