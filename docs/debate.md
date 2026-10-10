# Debate mode (BETA)

Ask a question with **Debate** on and the models argue it out in rounds on screen. Each one reads the others' arguments before its next
turn, so it can keep, refine or change its position. Then Keplar writes **one** answer on the normal answer card (same agreement,
disagreement and review extras as any answer). Below it, a collapsed **How the debate went** section keeps the transcript.

"Gaining knowledge" means only this: in later rounds each model gets the other models' previous arguments as input. Nothing is stored,
trained or carried into other questions. Models can still be wrong together, and the card does not claim certainty they don't have.

## How it runs (src/lib/orchestration/debate.ts)

| | Free | Paid plans (Lite, Plus, Pro, Business) |
|---|---|---|
| Models | 2 free OpenRouter `:free` models (the registry refuses anything else) | up to 3 paid models (routing "thorough", capped at 3) |
| Rounds | 2: opening, then final answer | 3: opening, rebuttal, final answer |
| Model requests | 4 turns + 1 combined review/write = **5** from the shared free key (a normal Free answer is 3) | 9 turns + the usual review and synthesis |
| Counts as | **2** of today's Free questions | metered in Keplar Usage at billed cost x `METER_MARGIN` |

- Round 1: every model writes `POSITION:` (one sentence) and a short argument, independently and in parallel.
- Round 2+: every model reads the others' latest arguments (fenced as data, each clipped to 1,500 characters, 6,000 in all) and replies
  with `POSITION:` and `UPDATE: held | refined | changed - why`. The last round is each model's complete final answer.
- The last round's answers go through the normal pipeline (classify, compare, review, synthesize). A model that fails a later round keeps
  its last good argument and sits out the rest; with fewer than two models left the debate ends early.
- Output caps per turn: 700 tokens (opening), 600 (rebuttal), 1,400 (final). A turn that takes over 60 s is dropped.
- The system prompt tells debaters to concede to better evidence, not to agree for its own sake, and never to claim to be conscious,
  sentient, AGI or superintelligent (a test pins this).

## Metering (proposals, `TODO(founder approval)` in debate.ts)

- **Cost factor** for the up-front estimate: `1 + (rounds - 1) x 1.25` times the panel's share of a normal answer
  (a rebuttal re-reads the others, so it is estimated at 1.25x an opening). 3 rounds = **3.5x** the panel, 2 rounds = 2.25x. Review and
  synthesis are not repeated, so the whole answer's planned usage comes out at about **2-3.5x** a normal answer (a test checks the range).
  The bill is what the providers actually charged for every turn (estimate only where no billed cost is reported), times `METER_MARGIN` (1.1).
- If the full debate would pass the plan's per-request cost cap or the remaining allowance, it tries fewer rounds; if even 2 rounds don't
  fit, the question is answered normally and the screen says why.
- **Free**: Debate runs only while the shared free pool (`FREE_POOL_DAILY_LIMIT`, pool-governor.ts) is at its normal level with 5 requests
  to spare this minute and today, the person's own daily request budget (`dailyProviderCalls`, 150) has 5 left, and 2 of today's questions
  (50/day) are left. Otherwise it is answered normally, counted as 1 question, with the reason on screen. A question with no answer gives
  both questions back.
- **Stop**: aborts the turns in flight and starts no further round. Paid plans are charged only for the rounds that had started
  (the planned units are lowered per round); Free gives the questions back.

## UI

- Composer: a **Debate** chip with a **Beta** tag, next to Deep Research (turning one on turns the other off). When on, a note says what it
  will do and what it counts as. Keyboard: it is a toggle button (`aria-pressed`). Not with image attachments yet (answered normally).
- While running: a "Debate" panel with the cast, then each round's turns as rounded-rect bubbles (seat color bar, name, position,
  held/refined/changed tag, streaming text). Screen readers hear each finished turn once (polite live region), not every streamed word.
  Motion is a short fade and the caret blink, both off under reduced motion. Colors come from the Light/Dark tokens (Auto resolves to one).
- After: the normal answer card, then the collapsed transcript.

## What is BETA / not done

- Not tested against real providers on this box (no live keys): engine tests use a stubbed OpenRouter (including real SSE streaming), and
  the browser test mocks the `/api/keplar` stream.
- Not in the public API (`/api/v1/ask` sends no modes; its progress stage map knows `debating` for later).
- No image attachments, no Deep Research combination, no per-round model choice, no "ask a follow-up to one debater".
- Numbers above are proposals awaiting founder approval.

## Tests

- `tests/debate.test.ts` (15): protocol parsing, transcript fencing and caps, cost factor and policy, Free daily double-claim, Free run
  (5 free requests, round 2 reads round 1, live deltas, order of events), paid run (9 turns, paid models, units, planned range), stop
  (no further round, partial billing), failed seat, skips (one model, Deep Research), prompt wording, client state, and `/api/keplar` Free
  end to end (2 questions, live turns before the answer; tight pool skips).
- `e2e/debate.e2e.ts` (2): chip by keyboard, live turns appear round by round while the stream is open, then one answer and the collapsed
  transcript; Stop aborts the stream and says so.
