# 2 longer tutorial scripts (5-7 min each)

Both use saved real runs ([DEMO-RUNS.md](DEMO-RUNS.md)); re-run live on recording day and show the date. Disclosure on screen: "Free plan, free models; results vary; agreement is not proof."

## T1 - "Make a technical decision with a three-model panel" (JSONB vs normalized table) - about 6 min
**Problem:** a solo developer must decide how to store user preferences whose shape keeps changing. **Demonstrated capability:** R1 (3 of 3 picked JSONB; the answer lists when to switch). **Next step:** viewer runs the same prompt on their own decision (`/for-developers`, example 1) and copies the answer.
| Time | Screen | Voice |
|---|---|---|
| 0:00 | Title card with date and "Free plan, free models" | "A decision with no one to ask: JSONB column or a normalized table?" |
| 0:20 | Write the decision as a good prompt: context (solo dev, shape changes), the choice, "pick one and say what would change your mind" | "Three things make a decision prompt useful: your situation, the options, and a request for the switching conditions." |
| 1:10 | Send; narrate stages; show models responding | "Keplar picks several models, they answer independently, then it compares positions." |
| 2:00 | Result: "3 of 3 models agree", the answer | "All three said JSONB. That is a good sign, not proof." |
| 2:40 | Open Models, Verification | "You can see who said what and what the reviewer checked." |
| 3:30 | Without Keplar: a 4-line checklist (do I need joins across preference keys? foreign keys or strict typing? are JSONB rows getting large? do I need to query by key often -> index?) | "Turn the answer into a checklist you can test against your own data." |
| 4:30 | Ask a follow-up: "Which Postgres index would I add for a key I filter on?" | "Follow-up in the same thread." |
| 5:20 | Copy, paste into a design doc; show Share option (signed in) | "Save it, or share one answer without sharing the chat." |
| 5:50 | End card | "Try your own decision: keplar.one/for-developers" |
Measure: tutorial -> `/for-developers` visits -> `ask_started` with example 1; copy actions.

## T2 - "How to read a multi-model answer: agreement is not proof" - about 7 min
**Problem:** people over-trust agreement. **Demonstrated capability:** R6 (split, and all wrong), R7 (single-model miss), R3 (model failure, verifier revision), R8 (a real 2-1 split). **Next step:** viewer asks one question where being wrong matters and reads the Disagreements and Verification sections.
| Time | Screen | Voice |
|---|---|---|
| 0:00 | R6 prompt: current Node.js LTS | "Two models say 22, one says 20." |
| 0:45 | Disagreements section | "Keplar shows the split and picks the better supported side." |
| 1:30 | nodejs.org releases page for that day | "Both sides were out of date. No live lookups yet, so version facts are a known weak spot." |
| 2:30 | R7 strawberry prompt | "Easy questions go to one model. Here it said 7; the count is 9." |
| 3:30 | R3 Rust question, a model marked failed | "A model failed; the answer says two of three responded." |
| 4:30 | Verification: reviewer found an issue and the answer was revised | "The reviewer can change the draft. It is a different pass, not an oracle; sometimes it is the same model as a panelist." |
| 5:30 | R8 mortgage split | "Where models split on a trade-off, the minority view is the thing to read." |
| 6:30 | Recap card: split = look closer; agree = good sign; facts that change weekly = check the source | "Agreement is a signal, not proof." |
Measure: watch-through (platform), visits, Disagreements opened.

## Production notes
Record at 1440x900 and 390x844 (mobile cut). Captions on. No music claims. Upload to the founders' own channels (not automated). Publish the transcript as the guide body for search.
