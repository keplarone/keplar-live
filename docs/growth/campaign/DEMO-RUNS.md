# Demo runs: the only results campaign assets may cite

**Rules.** (1) Cite only what is written here; if you want a new claim, run it, save the stream, add it. (2) Every public use must state date, that it was the **Free plan with free models**, and that results vary. (3) Do not describe agreement as proof. (4) Failures are published as readily as successes.

**Conditions for all runs:** live production API (`POST https://keplar.one/api/keplar`), anonymous visitor, Free plan, routing strategy `auto`, no attachments, no conversation history, 3 Oct 2026, 02:15-02:48 ET. Models are the free OpenRouter models Keplar's roster used that night (named as the product shows them; exact provider versions are not exposed by the product). Costs: $0 (free models). Raw event streams are saved in [`runs/`](runs/) so each number can be re-read.

**What the 8 runs show, in plain terms**
- 3 of 8 showed a visible split or a stale answer worth teaching (R6 Node LTS, R8 mortgage; R3 shows the verifier revising a draft). 5 of 8 were agreement.
- R6 is the strongest honest story: the panel split 2-1 on "current Node.js LTS" and Keplar showed the split, but **both positions were out of date** (nodejs.org on 3 Oct 2026: Node 24 is LTS, 22 also LTS, 26 Current, 20 end-of-life). It shows why Keplar says agreement is not proof and why a real-time check is still needed for version questions.
- R7 is a miss: letter counting routed to a single model; it answered 7; the true count is 9. Nothing was compared. We list it as a known limit.
- R3: only 2 of 3 models answered (Gemma 4 31B failed); the product still produced an answer and said so. The final text contains a "Where the models disagree" passage even though the structured count shows 0 disagreements (the verifier pushed the draft to include the counterargument the user asked for). Good outcome, but the count and the text are not perfectly consistent; do not describe it as a "split".
- **Defect found in this review (R3 and R4):** the final text contained a "Where the models disagree" section although all responding models took the same position (R4: 3 of 3 picked PostgreSQL, yet the text describes "one position favors managed NoSQL"). That presents an alternative as a model position. Do **not** quote those sections as disagreement. Mitigated in the synthesis prompt on 3 Oct 2026 (commit 4bded51, deployed as keplar-o3etfpn08): the section is requested only when positions differ. **Live re-run of the R4 prompt at 03:14 ET after deploy** ([`runs/R4-after-fix.ndjson`](runs/R4-after-fix.ndjson)): 3 of 3 PostgreSQL; the section still appeared but now states "The models do not disagree on the final recommendation... differences in emphasis, not in the conclusion". So it is no longer misleading, but not eliminated; a stronger fix (omit the section in code when the comparison has a single position) is a follow-up. One re-run is not evidence of a rate.
- Latency: 9.5-40.5 s for multi-model answers (median 18.8 s across the 12 multi-model runs in the baseline).
- Not run: any comparison against other products (ChatGPT, Claude, Perplexity, MultipleChat etc.). No "Keplar beats X" claim may be published until a comparison is run with the conditions disclosed (same prompt, same day, free tiers named, screenshot saved).
- Two further attempts (Prisma vs Drizzle; hashing vs encrypting API keys) were rejected by the Free daily limit and produced no answer; re-run them from a signed-in account or after the 24-hour reset if a clip needs them.

## Runs
### R1
- **Prompt (exact):** `I'm a solo developer. JSONB column or a normalized table for user preferences whose shape keeps changing? Pick one and say what would change your mind.`
- **When:** 2026-10-03T02:44:14-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** consensus — 3 agreed, 0 did not, 3 of 3 models responded; finished in 22.9 s
- **Models (free versions, as named by the product):**
  - Qwen3.8 27B (free) (panel): responded — "Pick JSONB"
  - Nemotron 3 Super (free) (panel): responded — "Pick JSONB"
  - Dots3-Note Preview (free) (panel): responded — "Pick JSONB"
  - Nemotron 3 Super (free) (verifier): responded
- **Disagreement shown:** none
- **Verification:** Nemotron 3 Super (free) (verifier) reviewed the draft answer against the 3 responses. No reasoning gaps, contradictions or unsupported claims found.
- **First lines of the final answer:** **Pick JSONB.** It avoids migration overhead and handles sparse, evolving schemas natively; Postgres GIN or expression indexes give you query performance on specific keys. Switch to a normalized table only when you need complex relational queries (joins across preferences), strict constraints (foreign keys, rigid typing), or when high volume and large JSONB rows cause measurable performance degradation.…
- **Raw stream saved:** [`runs/R1.ndjson`](runs/R1.ndjson)

### R2
- **Prompt (exact):** `Is it safe to store JWTs in localStorage for a single-page app, or must I use httpOnly cookies? Give a definite answer.`
- **When:** 2026-10-03T02:45:05-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** consensus — 3 agreed, 0 did not, 3 of 3 models responded; finished in 9.5 s
- **Models (free versions, as named by the product):**
  - Nemotron 3 Super (free) (panel): responded — "Must use httpOnly cookies"
  - Qwen3.8 27B (free) (panel): responded — "Must use httpOnly cookies"
  - Dots3-Note Preview (free) (panel): responded — "Must use httpOnly cookies"
  - Nemotron 3 Super (free) (verifier): responded
- **Disagreement shown:** none
- **Verification:** Nemotron 3 Super (free) (verifier) reviewed the draft answer against the 3 responses. No reasoning gaps, contradictions or unsupported claims found.
- **First lines of the final answer:** You must use httpOnly cookies. Storing JWTs in localStorage is unsafe because any JavaScript on the page—including malicious code injected via XSS—can read and exfiltrate the token. httpOnly cookies are inaccessible to client-side scripts, which effectively mitigates this theft vector.…
- **Raw stream saved:** [`runs/R2.ndjson`](runs/R2.ndjson)

### R3
- **Prompt (exact):** `Is it a good idea for a two-person startup to rewrite a working Node.js backend in Rust before it has any paying customers? Give the strongest counterargument too.`
- **When:** 2026-10-03T02:45:43-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** consensus — 2 agreed, 0 did not, 2 of 3 models responded; finished in 26.5 s
- **Models (free versions, as named by the product):**
  - Gemma 4 31B (free) (panel): failed
  - Qwen3.8 27B (free) (panel): responded — "No, it is not a good idea"
  - Dots3-Note Preview (free) (panel): responded — "No, it is not a good idea"
  - Nemotron 3.5 Lightning (free) (verifier): responded
- **Disagreement shown:** none
- **Verification:** Nemotron 3.5 Lightning (free) (verifier) reviewed the draft answer against the 2 responses. 1 issue found, each resolved below.
- **First lines of the final answer:** Rewriting a working Node.js backend in Rust before securing paying customers is generally not advisable. The primary risk is that a large-scale rewrite consumes the limited time and engineering capacity of a two-person team, directly delaying the search for product-market fit and the acquisition of revenue. A working system already meets current needs; destabilizing it introduces bugs and instability without validate…
- **Raw stream saved:** [`runs/R3.ndjson`](runs/R3.ndjson)

### R4
- **Prompt (exact):** `Compare Postgres, DynamoDB and MongoDB for a multi-tenant app run by two people. Which would you pick?`
- **When:** 2026-10-03T02:46:39-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** consensus — 3 agreed, 0 did not, 3 of 3 models responded; finished in 40.5 s
- **Models (free versions, as named by the product):**
  - Dots3-Note Preview (free) (panel): responded — "Pick PostgreSQL"
  - Nemotron 3 Super (free) (panel): responded — "Pick PostgreSQL"
  - Qwen3.8 27B (free) (panel): responded — "Pick PostgreSQL"
  - Nemotron 3.5 Lightning (free) (verifier): not-needed
- **Disagreement shown:** none
- **Verification:** The verifier reviewed the draft answer against the 3 responses.
- **First lines of the final answer:** For a two-person team running a multi-tenant app, PostgreSQL is the strongest choice. It offers native multi-tenancy through Row-Level Security and robust ACID guarantees, minimizing the application-level code needed to enforce tenant isolation. DynamoDB and MongoDB both shift significant burden to the application layer: DynamoDB demands careful key design and provisioning management to prevent leakage, while MongoDB…
- **Raw stream saved:** [`runs/R4.ndjson`](runs/R4.ndjson)

### R5
- **Prompt (exact):** `Should a two-person team building a Next.js SaaS use a monorepo or separate repositories for the web app and the API? Pick one.`
- **When:** 2026-10-03T02:47:49-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** consensus — 3 agreed, 0 did not, 3 of 3 models responded; finished in 9.7 s
- **Models (free versions, as named by the product):**
  - Qwen3.8 27B (free) (panel): responded — "Use a monorepo"
  - Nemotron 3 Super (free) (panel): responded — "Use a monorepo"
  - Dots3-Note Preview (free) (panel): responded — "Use a monorepo"
  - Nemotron 3 Super (free) (verifier): responded
- **Disagreement shown:** none
- **Verification:** Nemotron 3 Super (free) (verifier) reviewed the draft answer against the 3 responses. No reasoning gaps, contradictions or unsupported claims found.
- **First lines of the final answer:** For a two-person team building a Next.js SaaS, a monorepo is the better choice. It simplifies shared code, dependency management, and deployment coordination, reducing the overhead of maintaining multiple CI/CD pipelines and repository permissions. Atomic commits across the web app and API keep types and pipelines in sync, which is critical for a small team moving fast.…
- **Raw stream saved:** [`runs/R5.ndjson`](runs/R5.ndjson)

### R6
- **Prompt (exact):** `What is the current latest long-term-support (LTS) version of Node.js, and when did it enter LTS?`
- **When:** 2026-10-03T02:15:40-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** partial — 2 agreed, 1 did not, 3 of 3 models responded; finished in 23.6 s
- **Models (free versions, as named by the product):**
  - Nemotron 3 Super (free) (panel): responded — "Node.js 20 LTS (Oct 2023)"
  - Qwen3.8 27B (free) (panel): responded — "Node.js 22 LTS (Oct 2024)"
  - Dots3-Note Preview (free) (panel): responded — "Node.js 22 LTS (Oct 2024)"
  - Nemotron 3 Super (free) (verifier): responded
- **Disagreement shown:** Node.js LTS version and start date → Node.js 22 LTS (Oct 2024) [Dots3-Note Preview (free), Qwen3.8 27B (free)] vs Node.js 20 LTS (Oct 2023) [Nemotron 3 Super (free)]
- **Verification:** Nemotron 3 Super (free) (verifier) reviewed the draft answer against the 3 responses. No reasoning gaps, contradictions or unsupported claims found.
- **First lines of the final answer:** Node.js 22 is the current latest LTS version, entering LTS in October 2024. Node.js 20 remains in active LTS since October 2023, but Node.js 22 supersedes it as the newest long-term support release.  **Where the models disagree**   Two models identify Node.js 22 (October 2024) as the latest LTS, while one model cites Node.js 20 (October 2023). The majority position is better supported because Node.js follows a predic…
- **Raw stream saved:** [`runs/R6.ndjson`](runs/R6.ndjson)

### R7
- **Prompt (exact):** `How many times does the letter "r" appear in the phrase "strawberry raspberry cranberry"? Show your count.`
- **When:** 2026-10-03T02:16:06-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** single — 1 agreed, 0 did not, 1 of 1 models responded; finished in 0.6 s
- **Models (free versions, as named by the product):**
  - Nemotron 3 Super (free) (panel): responded
- **Disagreement shown:** none
- **Verification:** No cross-model verification needed for this question.
- **First lines of the final answer:** The phrase "strawberry raspberry cranberry" contains 7 occurrences of the letter "r".   Breakdown:   - "strawberry": 2 r's   - "raspberry": 3 r's   - "cranberry": 2 r's   Total: 2 + 3 + 2 = 7.…
- **Raw stream saved:** [`runs/R7.ndjson`](runs/R7.ndjson)

### R8
- **Prompt (exact):** `Is it better to take a 3.5% fixed-rate 30-year mortgage and invest the difference, or pay extra principal each month? Give one answer.`
- **When:** 2026-10-03T02:16:47-04:00 (ET), live `https://keplar.one/api/keplar`, anonymous, Free plan, `routing.strategy = auto`, no files, no history
- **Result type:** partial — 2 agreed, 1 did not, 3 of 3 models responded; finished in 15.4 s
- **Models (free versions, as named by the product):**
  - Dots3-Note Preview (free) (panel): responded — "Depends on investment return"
  - Nemotron 3 Super (free) (panel): responded — "Depends on investment return"
  - Qwen3.8 27B (free) (panel): responded — "Invest the difference"
  - Nemotron 3 Super (free) (verifier): responded
- **Disagreement shown:** Mortgage vs investment decision → Depends on investment return [Dots3-Note Preview (free), Nemotron 3 Super (free)] vs Invest the difference [Qwen3.8 27B (free)]
- **Verification:** Nemotron 3 Super (free) (verifier) reviewed the draft answer against the 3 responses.
- **First lines of the final answer:** Paying extra principal is the more defensible default because it guarantees a risk-free 3.5% return by avoiding interest, whereas investing the difference relies on uncertain market returns that must exceed 3.5% after taxes and fees to come out ahead.  **Key supporting points** - Prepaying principal locks in a certain 3.5% savings with no market risk, sequence-of-returns risk, or tax drag. - Investing only wins if af…
- **Raw stream saved:** [`runs/R8.ndjson`](runs/R8.ndjson)
