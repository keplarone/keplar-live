# Engine roadmap

One ordered list for the answer engine. It merges the gaps in [`BASELINE-ENGINE.md`](./BASELINE-ENGINE.md) with the **engine** items in [`AUDIT-2026-10-18.md`](./AUDIT-2026-10-18.md) sections 17 and 18 (draft PR #82).

Audit gap numbers below are section 17. Section 18 items are owner decisions. They are listed at the end and are not scheduled work.

Draft PR #43 deletes Keplar Studio and is still open. Do not build on `src/lib/studio/` or `src/lib/space-studio/`.

`authorize()` is the shared allow / require-approval / deny check described in audit section 16. Its interface will be written at [`docs/architecture/authorize.md`](./authorize.md). That file is not in the tree yet. Agent mode, the workflow planner, and any new tool use go through `authorize()` once it exists. They do not start before it.

## Order

Do these in order. A later item can start only when the items it names are already in.

### 1. `authorize()` gate — waiting on the gate

Audit item 1 is product work (another change). It extracts the check the MCP gateway already performs into `authorize({ actor, workspace, action, resource })` beside `src/lib/security/events.ts`.

These engine items wait on that function, and on `docs/architecture/authorize.md`:

| Item | What it is | Why it waits |
| --- | --- | --- |
| Agent mode | Baseline roadmap item 1. `modes.agent` is a label. Core skips it (`src/lib/core/assess.ts`). It does not run an agent. | Making it run tools or a workflow is an action. It calls `authorize()` first. |
| Audit #4 | One chat tool through the MCP gateway, grant defaulting off. | A tool call. It calls `authorize()`. |
| Audit #15 | A workflow planner for arbitrary goals. | A planner without the gate is an open tool loop. It also waits on audit #4. |

Until the gate exists, the honest engine change for agent mode is a test that the flag still does not call `runChatTools` or `solve` by itself. Routing the flag into the MCP pre-stage is the later step, and that step uses `authorize()`.

### 2. Lock the classifier and the router

Audit #2. A CI test runs `HeuristicClassifier` and `CostAwareRouter` on a fixed question set and records the panel, verifier, and judge. The roster is the static live and Free seeds, the date is pinned, and the learning boost is 1. This is a lock, not a new model. No provider spend.

Files: `src/lib/orchestration/classifier.ts`, `src/lib/orchestration/router.ts`, `tests/route-golden.test.ts`.

### 3. Model classifier, flag off — turning it on waits on the owner

Audit #6. One cheap model call can classify a question behind the `Classifier` interface. `KEPLAR_MODEL_CLASSIFIER` must be exactly `1`. The default is off, so production keeps the regex in `HeuristicClassifier`.

When the flag is on:

- The call goes through the existing registry, so the free-plan guard and the daily spend guard still apply.
- Free plans use a $0 `:free` model. Paid plans use one fast cheap model.
- Timeout, error, invalid JSON, or no model falls back to the regex.
- Token estimates stay local. The model cannot set them, and it cannot turn web retrieval on.

**Owner decision.** Turning the flag on spends one extra model call per question. That is the same class of decision as audit section 18 item 6 (live-model flags and provider spend). Do not change `KEPLAR_LIVE_MODELS`, `KEPLAR_RETRIEVAL_ENABLED`, the daily USD caps, or per-user OpenRouter keys as part of this slice.

### 4. Deep Research says when no pages will be read — retrieval stays off

Audit #8, and baseline roadmap item 2. When `KEPLAR_RETRIEVAL_ENABLED` is not exactly `true`, the composer shows `DEEP_RESEARCH_PRE_SEND` from `src/lib/orchestration/research-notes.ts` before the request, next to the runs-left line or the out-of-allowance reason. That sentence is forward-looking. Finished reports still use `OFF_NOT_ENABLED`. The desktop app's Live Research path is the exception: that app reads pages on the computer, so the composer does not say that search is off.

The public API uses the same sentence for a paid caller when retrieval is off, and it does not return an unfetched "Web search" note as a source. `research.pages_read` counts pages that were actually retrieved.

**Owner decision (section 18 item 6).** Do not set `KEPLAR_RETRIEVAL_ENABLED=true`. Turning retrieval on spends search fees (`SEARCH_PRICE_USD` in `src/lib/orchestration/config.ts`). Do not change `PLAN_ALLOWANCES`, `DEEP_RESEARCH_UNITS`, or the other numbers in section 18 item 2.

A follow-up test can still pin the engine contract: `modes.web` with the default env never calls `Retriever.check`, and the synthesizer note stays "Web retrieval isn't live yet" (`src/lib/orchestration/live-synthesizer.ts`).

### 5. Release eval, without live models

Audit #13, and baseline roadmap item 5. CI scores 20 real items from `BENCH` in `src/lib/core/bench.ts` (`tests/release-eval.test.ts`). The threshold is 1: a canned correct answer scores 1, and a canned wrong answer scores below 1. The same test fails if the output quality gate rejects those answers or lets a known-bad sample through, and if a Free route for one of the prompts would call a model that is not a $0 `:free` model.

The live before/after bench is a different run. `scripts/core-eval.mts` and `src/lib/core/selfdev/evals.ts` call the free roster. They need `OPENROUTER_API_KEY` and `KEPLAR_LIVE_MODELS=1`. CI does not have that key, and this roadmap does not turn the live flag on. Running that script is provider spend and waits on the owner (section 18 item 6).

### 6. Extractor failure stays unscored

Baseline roadmap item 4. When the extractor returns bad JSON, the answer is already `unscored`. Add a fixture that asserts the client event is `unscored`, not a guessed consensus (`src/lib/orchestration/comparator.ts`). No new model and no new spend.

### 7. Injection fixtures, still not a tool

Baseline roadmap item 6. Documents, memory notes, and `<untrusted_tool_output>` that say "ignore previous instructions" stay inside the fence and cannot add a tool or a grant (`src/lib/documents/guard.ts`, `src/lib/mcp/chat.ts`). Assert on the gateway. This does not add a tool and does not replace `authorize()`.

### 8. Direct provider keys — wiring them waits on the owner

Baseline roadmap item 3. `defaultProviders` constructs NVIDIA, OpenAI, and OpenRouter only. `DirectProvider` (Anthropic, Google, xAI, LiteLLM) is never constructed, while `liveEnv` still reads those keys (`src/lib/orchestration/providers/index.ts`, `src/lib/orchestration/config.ts`).

A registry test that shows which providers exist for a fixture env can land without sending traffic. **Owner decision** before any of those keys serve Ask: that is new provider spend, the same class as section 18 item 6.

### 9. Core jobs: a lease test, not a new queue

Audit #10 and baseline roadmap item 7. Do not add a third `defineJob`, and do not put Ask on Inngest, unless a real caller needs it. The slice that can land now is a test that a leased Core job is not resumed twice (`src/lib/core/jobs.ts`). Moving the daily cron is a platform change and is not part of this item.

### 10. Provider request ids — only if the HTTP helper already has them

Baseline roadmap item 8. `src/lib/orchestration/http.ts` does not return a provider request id today. Leave the flight log as it is. Do not invent a trace or add OpenTelemetry in this slice.

### 11. Embeddings — waiting on the owner

Baseline gap. Long context is BM25. `setEmbedder` in `src/lib/core/retrieval.ts` is unused. An embeddings key, and any vector store, is new spend and a new vendor. **Owner decision.** Not scheduled.

## Owner decisions (audit section 18)

Do not implement these. They touch production data, auth, payments, infrastructure, or real spend.

| # | Decision | Engine effect |
| --- | --- | --- |
| 1 | Neon backup and PITR | None in the answer path. |
| 2 | `PLAN_ALLOWANCES`, `WINDOW_LIMITS`, `TEAM_POLICY`, `DEBATE_POLICY` | Do not change Deep Research units or plan caps to make the off-state copy look cheaper. |
| 3 | Whop live checkout | None. |
| 4 | Stripe live mode and connected-account charges | None. |
| 5 | Apple production purchases | None. |
| 6 | `KEPLAR_LIVE_MODELS`, `KEPLAR_RETRIEVAL_ENABLED`, daily USD caps | Blocks turning retrieval on, turning `KEPLAR_MODEL_CLASSIFIER` on, and running the live Core bench. |
| 7 | `KEPLAR_FREE_DATA_COLLECTION` | `deny` shrinks the free roster. `allow` lets free hosts train. Do not flip it. |
| 8 | `KEPLAR_AUTH_REQUIRED`, `KEPLAR_ADMIN_REQUIRE_MFA` | None in this roadmap. |
| 9 | Auth provider stays Better Auth | None. |
| 10 | R2 for images | Audit #12. Not an engine slice. |
| 11 | Inngest production keys | Do not move Ask onto Inngest (item 9 above). |
| 12 | Upstash versus Postgres rate limits | None in the router. |
| 13 | Sentry, uptime, alert webhook | Audit #14. Not an engine slice. |
| 14 | Desktop code-signing | None. |
| 15 | Legal entity, minors, connector OAuth | None. |
| 16 | A migration that alters or drops a production table | None of the slices above change a table. |

## Not in the "do now" list

- Audit #4 and #15, and any agent-mode path that runs tools, until `authorize()` exists.
- Audit #10's new job, unless a real caller appears.
- Anything under section 18.
- Keplar Studio.
