# Positioning: three options, one chosen hypothesis

Product facts used (all verified in the repo or on the live product on 3 Oct 2026): Keplar One sends a question to several AI models, detects where they disagree, verifies a draft, and writes one answer. Tagline: **One question. Multiple intelligences. One answer.** Founders: Hassen and Hussain (a two-person team, plus the Keplar Team), founded 2026. Free: free models only, up to 50 questions a day. Paid: Lite $20, Plus $45, Pro $99 (billed through Whop). Limits we always state: Keplar can be wrong even when models agree; there are no live web lookups yet; simple questions go to one model; Free answers take roughly 15-25 seconds.

## The three options

### Option 1. "A second opinion on your technical decision" (developers and technical solo founders)
- **Who:** independent developers and technical founders who choose their own stack and have no one to ask.
- **Task:** pressure-test a decision (database shape, auth approach, rewrite or not, library choice, a security question) before committing.
- **Why it is useful:** one question replaces pasting the same prompt into three chatbots; the places where models *split* are the places to check. The answer tells you which part to verify.
- **Evidence it is needed (public):** developers distrust AI answers (46% distrust vs 33% trust; 66% frustrated by "almost right"; 75% would still ask a person) [SEGMENT S1]; open-source multi-LLM "second opinion" tools exist [S3]; a commercial one exists at a high tier (Perplexity Model Council on Max) [S2].
- **Evidence it works (ours, small and honest):** on the live Free plan, trade-off questions showed per-model stances; some split, some agreed; a version question showed the failure mode (all models stale). See [BASELINE.md](BASELINE.md) and [campaign/DEMO-RUNS.md](campaign/DEMO-RUNS.md).
- **Next step to test it:** the research form + 4 real-run demo clips; success = first 100 activated users with at least 5 describing the job as recurring.

### Option 2. "Find where the AI answers conflict before you cite" (researchers and students)
- **Who:** researchers and students using AI for early orientation.
- **Task:** map a topic and decide which claims to verify in primary sources.
- **Why useful:** the conflicts are a to-do list for verification.
- **Evidence needed:** high AI use (84% of researchers [S4]) and accuracy worries [S5]; but no public evidence for multi-model demand, and Keplar cannot look sources up. 
- **Next step:** not now. It needs web lookups and checked citations first.

### Option 3. "Stop pasting the same question into three chatbots" (everyone)
- **Who:** anyone who already compares chatbots by hand.
- **Task:** get one answer without the copy-paste.
- **Why useful:** time saved. **Weakness:** generic, no specific buyer, nothing to search for, hard to reach, and it competes head on with ChatGPT/Claude/Perplexity at $20.
- **Next step:** keep as the supporting line, not the lead.

## Chosen: Option 1, with Option 3 as the supporting line
**Hypothesis:** *Independent developers who already paste a tough technical question into more than one AI chatbot will try, and a fraction will pay for, a tool that does that in one step and shows where the models disagree.* It is falsifiable: if fewer than 5 of the first 15 research respondents already compare models by hand, or fewer than 1 in 5 activated developers use the disagreement view, the hypothesis is weak.

### Messaging architecture (lead with the concrete benefit, then how multiple models contribute)
| Layer | Copy | Notes |
|---|---|---|
| Headline | **Get a second opinion before you commit to the technical decision.** | Concrete benefit, one job. Live on `/for-developers`. |
| Lede | Ask once. Keplar sends your question to several AI models, shows how many agreed and exactly where they split, and writes one answer. The split is the part to check before you ship. | How multi-model contributes. |
| Proof | A real, dated example (campaign/DEMO-RUNS.md), including the one where every model was out of date. | Shows the limit, which builds trust with skeptics. |
| Supporting line | Ask once instead of pasting the same question into three chatbots. | Option 3 as a secondary line. |
| Limits (always visible) | Can be wrong even when models agree; no live web lookups; simple questions use one model; Free uses free models. | Never removed. |
| Pricing line | Free to try, no signup. Lite $20, Plus $45, Pro $99, billed through Whop. | Matches `/pricing`. |
| Brand line | One question. Multiple intelligences. One answer. | Unchanged. |

### Founder story (approved public facts only)
"Keplar was created by two co-founders, Hassen and Hussain Keder. Founded in 2026." They are two different people; never write "Hassen/Hussain", "the founder" or "he" for them. Any sentence about *why* they started must be written by the co-founders themselves. **Never publish an age, a birth date or any personal detail beyond this.** Do not invent a backstory, a reason that has not been given, or past employers.

### Words we do not use
smartest AI, always accurate, guaranteed, better than every competitor, confidence score or percentage (Keplar does not show them; the app now shows "N of M models" counts), "AGI" or "superintelligence" as a description of Keplar.

## Where the chosen messaging is implemented
| Surface | Status |
|---|---|
| `/for-developers` landing page (headline, lede, tested examples, limits, pricing, FAQ) | **Built and live** |
| First-run welcome starters for the "coding" use (decision-style prompts instead of a code-writing prompt) | **Built and live** |
| In-app answer: counts instead of a percentage, a plain "the models did not fully agree, see where they split" callout, "agree is a good sign, not proof" note | **Built and live** |
| Shared answer page `/r/<token>` (counts, positions, limits, CTA) | **Built and live** |
| Home page hero and navigation | **Not changed by this work** (owned by the design/SEO executors, uncommitted edits in the tree). Three hero variants for testing are in [campaign/LANDING-VARIANTS.md](campaign/LANDING-VARIANTS.md); adding `/for-developers` to the sitemap and footer is a listed hand-off in [COORDINATION.md](COORDINATION.md). |

Sources S1-S5 refer to [SEGMENT.md](SEGMENT.md).
