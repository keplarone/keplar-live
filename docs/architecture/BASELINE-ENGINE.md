# Engine baseline (Part 1.1)

Inspection of the answer engine on `main` at `1c011fe` (19 Oct 2026). This document covers how questions are classified, routed, answered, checked, and metered. It does not cover the product UI, sign-in, the database product, payments, or deploy settings except where those systems call the engine.

Draft PR [#43](https://github.com/keplarone/keplar-live/pull/43) (open, not merged) deletes Keplar Studio. Anything Studio-related below is **on `main` today and being removed**. Do not treat it as a path to extend.

Status words mean:

- **exists** — the behavior is implemented in the engine and wired into a live route.
- **partial** — some of the behavior is implemented, and a stated part is missing, off by default, or only a label.
- **missing** — no engine implementation that does the job.

## Layer map

| Directive piece | Layer | Status | Where it lives |
| --- | --- | --- | --- |
| Intent classification | Intelligence | partial | Rule classifiers in `src/lib/orchestration/classifier.ts` and `src/lib/orchestration/understand.ts`. No model classifier. |
| Model router | Intelligence | exists | `src/lib/orchestration/router.ts` (`CostAwareRouter`). Core adds a second, specialist pick in `src/lib/core/models.ts`. |
| Context management | Intelligence | partial | History, memory, and documents are fenced in `src/lib/memory/context.ts` and `src/lib/documents/guard.ts`. Long context is BM25 only (`src/lib/core/retrieval.ts`). |
| Research engine | Intelligence | partial | Deep Research, disputed-claim checks, and post-answer source checks exist, and all stay off unless `KEPLAR_RETRIEVAL_ENABLED=true` (`src/lib/orchestration/config.ts`). |
| Reasoning workflows | Intelligence | partial | Keplar Core (`src/lib/core/engine.ts`) and Debate (`src/lib/orchestration/debate.ts`) exist. Ask "agent" mode does not run a workflow. |
| Quality evaluation | Intelligence | partial | In-request gates and a 29-item bench exist. The recorded live comparison covered 12 items (`docs/core-intelligence-evals.md`). |
| Workflow planner | Execution | partial | Core plans steps for Thorough and Exhaustive questions (`src/lib/core/engine.ts`). There is no planner for arbitrary goals. |
| Agent orchestrator | Execution | partial | Connected-app tools are a bounded pre-stage (`src/lib/mcp/chat.ts`). Business OS agents are a separate runner (`src/lib/business/agents.ts`, `src/lib/inngest/functions.ts`). |
| Tool registry | Execution | partial | MCP tools, Core's code/search/retrieve helpers, and Slides/Study model calls. No single registry for the answer engine. |
| Browser automation | Execution | missing | The answer engine does not drive a browser. Playwright is used for site QA (`src/lib/site-builder/qa/`). Business computer-use only proposes a step (`src/lib/business/computer.ts`). |
| Background jobs | Execution | partial | Core jobs, a daily cron, and optional Inngest for Business agents. Ask itself is request-scoped. |
| Verification engine | Execution | exists | Cross-model review, exact code checks, an output quality gate, and Core's sandbox checks. External proof is optional and off by default. |
| Sandboxed execution | Infrastructure | partial | Core runs short JavaScript in a locked V8 worker (`src/lib/core/sandbox.ts`). User-facing code runs in the browser (`src/lib/sandbox/runner.ts`). |
| Job queue | Infrastructure | partial | Inngest when `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set (`src/lib/inngest/client.ts`). Otherwise Vercel Cron, once a day on the Hobby plan. |
| Monitoring | Infrastructure | partial | Per-call rows, a text-free flight log, spend spikes, and a daily drift report. No OpenTelemetry traces in `src/`. |
| Secrets | Infrastructure | exists | Provider keys are read from the environment and sent as headers (`src/lib/orchestration/config.ts`, `src/lib/orchestration/providers/openai-compat.ts`). |
| Security controls | Infrastructure | partial | Input caps, rate limits, injection fences, a safety screen, and the AI Firewall for tools. No dedicated injection detector on the answer path. |

## How one question becomes one answer

`POST /api/keplar` (`src/app/api/keplar/route.ts`, `maxDuration` 300) parses the body, then `runCore` (`src/lib/core/run.ts`) decides whether to wrap `orchestrate` (`src/lib/orchestration/orchestrator.ts`). `POST /api/v1/ask` calls that same handler in-process with a stateless workspace (`src/lib/api/ask.ts`). Without `KEPLAR_LIVE_MODELS=1` and a provider key, `engineDeps` returns null and the route answers 503 (`src/lib/orchestration/orchestrator.ts`, `src/lib/orchestration/providers/index.ts`). Nothing is faked.

Before any model call, the route can finish the turn itself:

- Memory commands and recall (`src/lib/memory/intent.ts`).
- A fixed safety refusal (`src/lib/safety/screen.ts`).
- A video request, which returns a card instead of a model answer (`detectVideoIntent` in the route).
- Standing output rules, identity guards, and creator or pricing facts (`src/lib/orchestration/output-rules.ts`, `src/lib/orchestration/identity-guards.ts`, `src/lib/orchestration/understand.ts`).
- A question that is only an exact calculation (`instantExact` in `src/lib/orchestration/orchestrator.ts`, computed in `src/lib/orchestration/exact.ts`).

The live pipeline then does this:

1. **Understand.** `HeuristicClassifier` sets task kind, complexity, capabilities, and token estimates (`src/lib/orchestration/classifier.ts`).
2. **Select.** `CostAwareRouter` picks one model or a panel, plus a verifier and, for complex paid questions, a judge (`src/lib/orchestration/router.ts`). The estimate is checked against the remaining allowance and the per-request cap before any panel call (`src/lib/orchestration/orchestrator.ts`, `src/lib/orchestration/limits.ts`).
3. **Optional research.** Deep Research, when it is allowed, searches and reads pages, then puts a numbered brief in front of the question (`src/lib/orchestration/research.ts`). Live Research from the desktop app arrives already read (`src/lib/research/live-request.ts`).
4. **Panel.** Seats run in parallel through the provider registry. The first model to speak is streamed (`src/lib/orchestration/early-stream.ts`).
5. **Compare.** An extractor turns free text into positions and claims (`src/lib/orchestration/extractor.ts`). `EvidenceWeightedComparator` scores agreement (`src/lib/orchestration/comparator.ts`). A disagreement event is emitted only when `comparison.disagree > 0`.
6. **Verify.** A reviewer model reads the responses and, on paid plans, a draft (`src/lib/orchestration/verifier.ts`). On the Free plan one combined call classifies, reviews, and writes (`src/lib/orchestration/free-merged.ts`).
7. **Optional web check.** Only claims the reviewer still marks disputed, and only when retrieval is enabled (`src/lib/orchestration/retriever.ts`).
8. **Synthesize.** `ModelSynthesizer` writes one markdown answer (`src/lib/orchestration/live-synthesizer.ts`). `guardDisagreement` strips a "where the models disagree" section unless more than one position was found (`src/lib/orchestration/disagreement-guard.ts`).
9. **Answer.** The client receives units and a level. Dollars stay on the server (`src/lib/orchestration/compute.ts`).

Simple questions skip the panel: one model, no verifier. Casual chat, jokes, and support replies use a separate free-model path and are not charged (`src/lib/orchestration/smalltalk.ts`, `src/lib/orchestration/playful.ts`, `src/lib/orchestration/support.ts`).

### Keplar Core

Core is a wrapper, not a replacement (`src/lib/core/run.ts`). Quick and Auto questions use the pipeline above. Thorough and Exhaustive, and Auto when the answer comes back low-confidence (`needsEscalation`), add a loop in `src/lib/core/engine.ts`:

- Plan steps (`makePlan`).
- Solve each step with a specialist model (`src/lib/core/models.ts`).
- Check math and code by running JavaScript, or ask a model from another family.
- Revise until the check passes or the budget stops it (`src/lib/core/config.ts`).
- Critique and revise the final answer until `KEPLAR_CORE_PASS_SCORE` (default 8).

`KEPLAR_CORE_OFF=1` skips the wrapper. Core does not run for Live Research, Create, agent mode, Deep Research, Debate, or playful turns (`coreApplies` in `src/lib/core/assess.ts`). Media questions keep the vision panel; Core cannot see pixels.

## Model providers and routing

Live calls go through `defaultProviders` (`src/lib/orchestration/providers/index.ts`), in this order:

| Provider | When it is used | Code |
| --- | --- | --- |
| NVIDIA | `NVIDIA_API_KEY` set, model has a `nvidia` route | `src/lib/orchestration/providers/openai-compat.ts` |
| OpenAI | `OPENAI_API_KEY` set, model has an `openai` route | same file |
| OpenRouter | `OPENROUTER_API_KEY` (Free may use `OPENROUTER_API_KEY_FREE`) | `src/lib/orchestration/providers/openrouter.ts` |

`DirectProvider` (`src/lib/orchestration/providers/direct.ts`) can call Anthropic, Google, xAI, or a LiteLLM proxy. `liveEnv` reads `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, and `LITELLM_BASE_URL` (`src/lib/orchestration/config.ts`). `defaultProviders` never constructs `DirectProvider`, so those keys do not serve Ask.

OpenRouter routing defaults (`src/lib/orchestration/config.ts`): `data_collection: "deny"` on paid calls, `require_parameters: true`, ignore the first-party DeepSeek host, and pin `fp8`/`bf16` for open-weight models that are not exempt. Judge calls can pin a host order (`JUDGE_PROVIDER_ORDER`). Sensitive tier sets `zdr: true`. Free calls use `freeOpenRouterProviderOptions`. The default data-collection value for Free is `"allow"` unless `KEPLAR_FREE_DATA_COLLECTION=deny`.

The paid roster is the cheap live list in `src/lib/orchestration/live-catalog.ts` (blended price at most $1.50 per million tokens, `LIVE_MAX_BLENDED_USD_PER_M`). Fixed roles: extractor `live:gpt-6-luna`, synthesizer `live:gemini-3.8-flash`. The Free roster is only OpenRouter `:free` slugs at $0. `isFreeModel` refuses anything else before it is sent (`src/lib/orchestration/free-guard.ts`). `catalog.json` is the research catalog; live routing uses the live roster plus `catalog-sync` snapshots (`src/lib/orchestration/catalog-sync.ts`).

`CostAwareRouter.route` (`src/lib/orchestration/router.ts`):

- Score is quality × reliability × latency × a learned boost, divided by a sub-linear price. The boost comes from `activeBoost` (`src/lib/learning/active.ts`) and is bounded, and it cannot relax the free, vision, retention, context, or price filters.
- Simple: 1 model, no verifier. Moderate: 3, or 2 when the question is short and automatic (`isLightModerate`). Complex: 5, plus a judge unless the strategy is `fast` or the plan is Free.
- Strategy `fast` / `thorough` and `maxModels` (1–6) change the size. Panel seats prefer distinct families, and a wide panel keeps an open-weight slot.
- Free panel size is at most `FREE_MAX_PANEL` (2). Free never gets a judge or Deep Research.
- Error-prone counting, arithmetic, and exact facts are forced to at least a small panel (`src/lib/orchestration/classifier.ts`).
- Images go only to models whose catalog modalities include image input (`src/lib/orchestration/media.ts`).

Retries: 3 attempts, 45 s timeout, on paid calls (`RETRY` in `src/lib/orchestration/config.ts`). Free does not retry the same model (`FREE_RETRY`). The registry then tries up to 3 substitute models on rate limit, timeout, or error (`src/lib/orchestration/providers/index.ts`). A refusal is final. A daily spend guard reserves a worst case before a live call (`src/lib/orchestration/live-budget.ts`). The default cap is `KEPLAR_LIVE_DAILY_USD_CAP` or $5. Operator kill switches are checked first (`src/lib/ops/controls.ts`).

The whole live run shares one latency budget, default 60 s (`KEPLAR_LATENCY_BUDGET_MS`). A how-to guide raises it to 120 s. Panel output caps are 1,400 tokens (complex 1,800, reason mode 2,200, guides 3,600) with low or medium reasoning effort (`livePanelParams` in `src/lib/orchestration/orchestrator.ts`).

### Studio routing, being removed

On `main`, Space Studio has its own router (`src/lib/space-studio/core/router.ts`): an explicit model choice is kept, and escalation is only a suggestion unless the person allowed it. Roblox Studio mode calls Claude Opus 5.5 through OpenRouter and no other model (`src/lib/studio/agent.ts`, `STUDIO_MODEL`). Draft PR #43 deletes `src/lib/studio/`, `src/lib/space-studio/`, `src/lib/blender/`, `src/lib/blender-cloud/`, `src/lib/roblox-cloud/`, and their API routes and crons.

## Disagreement, verification, synthesis

Positions are not guessed from wording. `EvidenceWeightedComparator` returns level `unscored` when more than one answer is still `unclassified` (`src/lib/orchestration/comparator.ts`). The extractor prompt asks for as few positions as the bottom line allows (`EXTRACTOR_SYSTEM_PROMPT` in `src/lib/orchestration/extractor.ts`). If that JSON cannot be read, the answers stay unclassified.

Agreement levels: consensus at 80 or above, partial at 60 or above, otherwise none. A missing vote or a refusal is not dissent. After review, each position is weighted by `0.25 + 0.75 × support`, where support is the share of its claims that were not removed.

The reviewer is the plan's verifier, or the judge when the panel disagreed and a judge was planned (`reviewerFor` in `src/lib/orchestration/verifier.ts`). It returns at most five checks of kind `reasoning`, `contradiction`, or `unsupported`, and at most three disputed claims. Malformed JSON is dropped. A failed review is reported as not cross-checked, not as all clear. The verifier prompt forbids external sources.

Synthesis is a separate judge-tier call (`SYNTH_SYSTEM_PROMPT` in `src/lib/orchestration/live-synthesizer.ts`). The Free plan skips the draft and uses the combined review. A final editor pass exists (`CRITIQUE_SYSTEM_PROMPT`). Citations the models write are labeled as not opened by Keplar. When `needsWeb` is set and no research pages were attached, the answer says "Web retrieval isn't live yet."

Two checks do not depend on a model:

- Letter counts, vowels, arithmetic, and unit conversions in `src/lib/orchestration/exact.ts` are computed in code and handed to the models as a fact. A bare calculation is answered from that alone.
- `assessOutput` (`src/lib/orchestration/quality-gate.ts`) rejects empty, looping, or non-word English prose before it is shown or compared. Code, math, and other languages are left alone. A rejected answer is not billed to the user. If every seat fails the gate, the user sees `UNRELIABLE_MESSAGE`.

Optional single-model sanity: another free model can mark a reply incoherent and trigger one retry (`src/lib/orchestration/sanity.ts`).

## Cost and tokens

Users see Keplar Usage units, not tokens or dollars (`src/lib/orchestration/compute.ts`):

- `USD_PER_UNIT` is $0.002.
- `toUnits(usd)` is `max(1, ceil(usd / 0.002) + 1)`.
- Levels: low ≤ 8, moderate ≤ 60, high ≤ 180, otherwise very high.
- Metered cost is multiplied by `METER_MARGIN` (1.1) in `src/lib/orchestration/limits.ts`.

Billed cost is the provider's `usage.cost` when present (`actualCostUsd`). Catalog price is the fallback (`src/lib/orchestration/pricing.ts`, `spentUsd`). Failed panel calls add nothing. The judge is counted only if it ran. Extractor, synthesis, retrieval, research, sourcing, and debate substitutes are added in `orchestrate`. A run that ends with no usable answer sets `noResponse` and is not billed.

Allowances in `src/lib/orchestration/plans.ts` are what the engine reads. The file still says the figures are a proposal awaiting founder approval:

| Plan | Monthly units | Models | Deep Research |
| --- | --- | --- | --- |
| Free | none ( $0 models ) | `:free` only | no |
| Lite | 2,400 | all | no |
| Plus | 6,000 | all | yes |
| Pro | 13,500 | all | yes |
| Business | 30,000 (a tier can replace this) | all | yes |

`DEEP_RESEARCH_UNITS` is the floor for a Deep Research run when providers did not report a billed cost. There is no silent fallback to a cheaper model when the allowance is short: the run stops with a `limit` event. Lite, Plus, and Pro also have rolling 5-hour and weekly credit windows (`USAGE_WINDOWS`, `WINDOW_LIMITS` in the same file). Free and Business do not.

Per-plan caps (`PLAN_LIMITS` in `src/lib/orchestration/limits.ts`) cover burst per minute, daily questions, concurrent questions, prompt and history characters, attachments, images, per-request USD, and daily USD. Free is $0 per request and 150 provider calls per UTC day (`src/lib/usage/call-budget.ts`). After `dailyFanoutRuns`, the plan still answers with at most two models (`src/lib/orchestration/fanout.ts`).

The shared Free OpenRouter key is governed in requests, not dollars (`src/lib/orchestration/pool-governor.ts`): default 20 per minute and 50 per day (1,000 per day once the key qualifies), minus a 5% reserve. As the day fills, stand-ins stop, then fallbacks, then the panel shrinks to one model, then the route returns 503 with `Retry-After`.

Input tokens for routing are estimated as characters / 4, plus attachments, image tiles, and 600 (`src/lib/orchestration/classifier.ts`). Images are reserved against the spend cap as tiles (`src/lib/orchestration/media.ts`).

## Intent, context, and memory

Two classifiers run, both rules:

- `understand` (`src/lib/orchestration/understand.ts`) handles short fragments: creator, pricing, brand, compare, maker, follow-up, playful, and a rewritten question. Product facts are answered without a model. Ambiguous rewrites set `crossCheck`, which forces a second model.
- `HeuristicClassifier` assigns `TaskKind` (`general`, `code`, `finance`, `strategy`, `research`, `analysis`, `writing`, `creation`, `agent`, `factual`) from regexes and modes. Complexity is a point score. `modes.agent` sets kind `agent` and the Planning capability, and it raises the score. It does not start an agent.

`assess` (`src/lib/core/assess.ts`) is a third regex pass used only to choose Core depth (Auto, Quick, Thorough, Exhaustive).

Context the models see is built in the route and in `src/lib/memory/context.ts`:

- Recent turns are kept verbatim, older turns become one line, and the plan's `maxHistoryChars` is the cap (`clampHistory`).
- Fence markers and role tags are stripped so a message cannot close the fence or forge a "System:" turn (`defang`).
- Saved memory notes are included only when the person is signed in, memory is on, the chat is not private, and the caller is not a team workspace, an API key, or an embed (`src/app/api/keplar/route.ts`).
- Documents are clamped, fenced, and labeled untrusted (`src/lib/documents/chat-docs.ts`, `INJECTION_RULES` in `src/lib/documents/guard.ts`). On Free, while free hosts may train, file text is refused before the run (`freeAllowsDoc`, HTTP 422). Public pages and transcripts may still be sent.
- After an answer, a free model may extract short first-person facts (`src/lib/memory/extract.ts`). The user's own short message is the only input. Facts are checked in `src/lib/memory/facts.ts` before they are stored. This call is not charged to credits.

Long context inside Core chunks text and ranks it with BM25 (`src/lib/core/retrieval.ts`). `setEmbedder` can fuse an embedding rank. Nothing in `src/` calls `setEmbedder`, so retrieval stays lexical. A rolling summary is extractive sentences from the thread, not a model paraphrase.

## Research, tools, agents, jobs

**Web search** uses OpenRouter's web plugin with the engine always set to `exa` or `parallel` (`KEPLAR_SEARCH_ENGINE`). Brave, Tavily, and Serper are not used (`src/lib/orchestration/retriever.ts`). It is off unless `KEPLAR_RETRIEVAL_ENABLED` is exactly `true`, the plan is not Free, and the tier is not sensitive. Three uses share that flag:

- Disputed claims after verification, at most 3, 4 results each.
- Deep Research: up to 3 queries, then a read pass (`src/lib/orchestration/research.ts`). Citations that do not match a page that was read are removed (`linkCitations`).
- "Verified answers": after the draft, key claims from the answer are searched (`src/lib/orchestration/sourcing.ts`). Free gets a note that the check did not run.

`modes.web` sets `needsWeb` and blocks the light two-model shortcut. It does not by itself fetch pages. The synthesizer then says retrieval is not live.

**Live Research** is the desktop app reading pages on the person's computer (`src/lib/research/live-request.ts`). The route clamps the brief, refuses it for API keys and embeds, and skips server search so the same question is not searched twice. `KEPLAR_LIVE_RESEARCH_OFF=1` drops the brief.

**Connected-app tools** (`src/lib/mcp/chat.ts`) are a pre-stage, not native tool calling. Limits: 5 tool calls, 3 planner rounds, 45 s. A read runs only if the tool is marked read, set to auto-run, granted to Ask, and the account allows it. Anything else waits for an approval card. Results are sanitized and wrapped as `<untrusted_tool_output>`. The planner is a request, not authority. Grants and the AI Firewall are checked again (`src/lib/business/firewall.ts`).

**Ask agent mode** does not orchestrate those tools. It only changes the classifier. Core refuses the turn (`coreApplies`).

**Business OS agents** (`src/lib/business/agents.ts`) are a separate execution path. They call OpenRouter with `OPENROUTER_API_KEY` directly, not through `CostAwareRouter`. Outbound actions go through the firewall and, for event and scheduled runs, wait for the owner. Inngest runs the schedule tick every 5 minutes when enabled (`src/lib/inngest/functions.ts`). Without Inngest, `GET /api/cron/agents` is the driver, and the route comments say the Hobby cron runs at most once a day (`src/app/api/cron/agents/route.ts`).

**Computer use** (`src/lib/business/computer.ts`) proposes one action from a screenshot the desktop app sent. This server does not click, type, or browse. Sensitive steps always ask the person. This is not browser automation.

**Core tools** (`src/lib/core/tools.ts`) are web search through the same retriever, BM25 over the thread, and the JavaScript sandbox. They are not a general tool registry.

**Slides and Study** call models through `ToolRun` (`src/lib/tools/run.ts`), which reuses the registry, the Free guard, and the spend guard, then charges the ledger once.

**Background work**

| Job | Schedule on `main` | What it does |
| --- | --- | --- |
| `/api/cron/core` | `47 6 * * *` | Resumes paused Core jobs and runs the self-learning pipeline (`src/app/api/cron/core/route.ts`, `src/lib/core/jobs.ts`). |
| `/api/cron/learning` | `37 4 * * *` | Router-policy bandit (`src/lib/learning/pipeline.ts`). Also refreshes FAQ and SEO trends. |
| `/api/cron/agents` | `5 13 * * *` | Business agent schedules. |
| `/api/cron/cost-guard` | `30 13 * * *` | Balance, margin, anomaly alerts (`src/lib/cost/watch.ts`). |
| `/api/cron/observatory` | `53 6 * * *` | Model drift report (`src/lib/ops/observatory.ts`). |
| `/api/ops/openrouter-balance` | `0 14 * * *` | Credit balance. |
| `/api/cron/roblox-cloud`, `/api/cron/blender-cloud`, `/api/cron/space-stats` | nightly | **Being removed** by draft PR #43. |

Crons require `Authorization: Bearer $CRON_SECRET`, compared with a SHA-256 digest (`timingSafeEqual`). Core jobs are per workspace, leased so two slices cannot run one job, and expire after 7 days (`src/lib/core/jobs.ts`). A browser can poll "Keep working". Unattended jobs wait for the daily cron. Inngest is not wired to Core.

## Quality evaluation and tests

In the request:

- Output quality gate on every provider answer (`src/lib/orchestration/quality-gate.ts`).
- Cross-model review and evidence weighting, described above.
- Core's pass score, cross-family critic, and executed checks (`src/lib/core/engine.ts`).
- A coherence retry for some single-model answers (`src/lib/orchestration/sanity.ts`).

Offline and scheduled:

- `src/lib/core/bench.ts` holds 29 auto-scored items. `src/lib/core/selfdev/evals.ts` can run the plain pipeline against Core. The written result (`docs/core-intelligence-evals.md`, 6 Oct 2026) is 12 of those 29 items on Free models: 0.75 before vs 0.83 after, as recorded. That file is a snapshot, not a CI gate.
- The daily Core cron compares a candidate prompt or knob change with the champion on a small rotating subset, and can roll a canary back (`src/lib/core/selfdev/pipeline.ts`). Code proposals are queued for an admin. They are not applied.
- The nightly learning cron learns bounded per-model score multipliers from redacted outcomes and promotes a small policy only when holdout checks pass (`src/lib/learning/pipeline.ts`). It cannot change prompts, secrets, or billing.
- The observatory reports drift from real `model_calls` and flight rows. It does not change routing (`src/lib/ops/observatory.ts`).

Engine tests that exist on `main` (not a claim that they passed in this inspection):

- Pipeline and routing: `tests/live-engine.test.ts`, `tests/limits.test.ts`, `tests/fanout-cost.test.ts`, `tests/free-pool.test.ts`, `tests/deep-research.test.ts`, `tests/debate.test.ts`, `tests/sourcing.test.ts`, `tests/live-research.test.ts`, `tests/exact-numbers.test.ts`.
- Understanding and gates: `tests/understand.test.ts`, `tests/chat-understanding.test.ts`, `tests/smalltalk.test.ts`, `tests/quality-gate.test.ts`, `tests/quality-gate-structured.test.ts`, `tests/identity-guards.test.ts`, `tests/output-rules.test.ts`, `tests/safety-screen.test.ts`.
- Core and learning: `tests/core-units.test.ts`, `tests/core-engine.test.ts`, `tests/core-pipeline.test.ts`, `tests/learning.test.ts`.
- Memory, tools, cost, flight: `tests/memory.test.ts`, `tests/mcp-chat.test.ts`, `tests/mcp-gateway.test.ts`, `tests/mcp-ssrf.test.ts`, `tests/cost-meter.test.ts`, `tests/cost-guard.test.ts`, `tests/flight-recorder.test.ts`.
- Studio (being removed): `tests/studio-agent.test.ts`, `tests/space-studio.test.ts`, `tests/roblox-cloud.test.ts`, `tests/blender-cloud.test.ts`, and the other `tests/studio-*.test.ts` files.

`docs/core-intelligence-status.md` (6 Oct 2026) says the Core unit files passed then. This inspection did not re-run the suite.

## Security on the engine paths

**Prompt injection.** Documents, memory, tool results, and debate transcripts are data inside fences the payload cannot close (`src/lib/documents/guard.ts`, `src/lib/memory/context.ts`, `src/lib/mcp/chat.ts`, `src/lib/mcp/sanitize.ts`). The Business firewall blocks a short list of instruction phrases on outbound actions (`INJECTION` in `src/lib/business/firewall.ts`). Core's candidate-prompt guard rejects jailbreak phrasing (`src/lib/core/selfdev/guard.ts`). There is no classifier that scans an ordinary question for injection before the panel.

**Secrets.** `readKey` trims quotes and a pasted `NAME=` prefix and the comment says never to log the result (`src/lib/orchestration/config.ts`). OpenAI-compatible calls send the key as a header and the file says keys are not echoed in errors (`src/lib/orchestration/providers/openai-compat.ts`). `scripts/secret-scan.mjs` and `tests/secret-scan.test.ts` exist. This inspection did not read production env values.

**Rate limits.** `POST /api/keplar` calls `limitRequest` at 30 per IP and the workspace's requests-per-minute, then `enterUsage` (`src/lib/create/platform/usage.ts`) for burst, daily questions, concurrency, and daily USD. Free also hits the shared pool and the per-person call budget. `POST /api/v1/ask` adds per-key minute and day caps (`src/lib/api/policy.ts`; Free is 2/minute and 30/day). Hourly per-provider and per-model blocks sit in the registry (`src/lib/ops/hourly.ts`).

**Sandboxing.** Core's checker uses a worker thread, a 48 MB heap cap, a V8 context with no host objects, string-to-code and WebAssembly generation off, and a timeout (`src/lib/core/sandbox.ts`). The person-facing runner is an opaque iframe plus a worker in the browser (`src/lib/sandbox/runner.ts`). MCP calls are not sandboxed processes. They are schema-checked, budgeted, and approval-gated.

**Input validation.** `parse` in `src/app/api/keplar/route.ts` requires a JSON object and a prompt, caps the prompt at 16,000 characters (plans cap lower), keeps 40 history turns, 10 attachments, and checks media magic bytes in `parseMedia`. Modes are booleans. Routing strategy is an allow-list. `maxModels` is clamped to 1–6. Body size is capped (`MEDIA_LIMITS.maxBodyBytes`) before `JSON.parse`. `parseAsk` (`src/lib/api/ask.ts`) repeats a tighter check for the public API, including image data URLs. Live Research that fails validation is dropped, not trusted.

**Other gates.** The safety screen refuses some illegal or severely harmful prompts with a fixed reply and logs the category, not the text (`src/lib/safety/screen.ts`). Sensitive tier excludes models that require provider retention (`src/lib/orchestration/router.ts`).

## Observability for AI calls

Each live provider attempt calls `recordModelCall` (`src/lib/ops/telemetry.ts`): model, vendor, provider, ok, reason, latency, and billed USD, into `model_calls`. Prompt and answer text are not in that row. The same function adds the minute bucket used by the spend-spike detector (default $8 in 5 minutes pauses media and Free, not paid text).

`POST /api/keplar` runs inside an `AsyncLocalStorage` cost scope (`src/lib/ops/request-cost.ts`). Calls made for that request are summed. A flight log (`src/lib/ops/flight.ts`) stores stages, provider requests, tool states, and the outcome as enums and short safe strings. No account id, prompt, or token. Rows prune after 7 days. Admins read them at `/api/admin/flight`.

`/api/cron/observatory` compares the last 24 hours with the previous 7 days per model (`src/lib/ops/observatory.ts`). `/api/cron/cost-guard` and `/api/ops/openrouter-balance` watch money. `src/lib/ops/health.ts` records cron beats.

`package-lock.json` includes OpenTelemetry instrumentation packages. No file under `src/` starts a tracer or exports spans. There is no distributed trace of a panel call.

## Architectural limitations

- The router, the extractor, the reviewer, and the writer are all language models looking at the same answers. Agreement can be wrong, and a failed extractor leaves the answer unscored rather than checked another way. Exact arithmetic is the exception, and only for questions `exact.ts` recognizes.
- Web evidence is off by default. A question with web mode on is labeled as not searched. Deep Research and source checks share that flag and the paid-plan and non-sensitive rules.
- Free quality is capped by one shared OpenRouter key and by `:free` hosts that may train unless `KEPLAR_FREE_DATA_COLLECTION=deny`. In that default, file text is refused up front (HTTP 422) and saved memory is left out of the prompt. The conversation in the request is still sent (`withheld` in `src/app/api/keplar/route.ts`).
- `modes.agent` looks like an execution mode and does not execute. Core is skipped. Tool use happens only when the separate MCP pre-stage is entitled and the question names a tool.
- Long documents are retrieved by keywords. The embedding hook is unused.
- Anthropic, Google, xAI, and LiteLLM keys are read and then ignored by `defaultProviders`.
- Core background work and the learning cron run once a day on the schedule in `vercel.json`. A paused Thorough answer can sit until the next 06:47 UTC cron if the tab is closed.
- The bench that scored Core is twelve live items from October 2026, with one answer key later found wrong (`docs/core-intelligence-evals.md`). It is not a merge gate.
- Studio's Opus agent, Space Studio's router, and the Roblox and Blender overnight jobs are still on `main` and are deleted only when draft PR #43 merges. Building on them conflicts with that removal.

## Risks

- A shared Free pool means one busy day, or the Core and learning crons, can shrink or stop Free answers for everyone (`src/lib/orchestration/pool-governor.ts`).
- The global live cap defaults to $5 per UTC day across providers (`liveDailyUsdCap`). A paid surge hits that cap even when a user's own allowance remains.
- Injection fences are string filters. Tool output is allowed back into the planner prompt, and the MCP module comments that this can steer the next proposal (`src/lib/mcp/chat.ts`). Grants are still checked in code.
- Free hosts may log and train on prompts while data collection is `"allow"` (`freeEndpointsMayTrain`). Saved notes are withheld and file text is refused, but the question and the conversation history in the request are still sent.
- `plans.ts` still marks allowances as unapproved while the running engine uses those numbers. Changing them changes what users can spend.
- Flight logs and `model_calls` are operational, not a trace. A bad host or a slow seat is visible after the fact as a reason code, not as a span you can follow through OpenRouter.

## Roadmap

Small engine slices, each verifiable without a new service. None of these should start before draft PR #43's Studio deletion is accounted for, so new work does not land in `src/lib/studio/` or `src/lib/space-studio/`.

1. **Make agent mode honest.** Add a test that `modes.agent` does not call `runChatTools` or `solve` by itself (`src/lib/core/assess.ts`, `src/app/api/keplar/route.ts`). Then either route that flag into the existing MCP pre-stage when tools are granted, or stop treating it as a task kind that skips Core. One path, with a unit test for the chosen behavior.
2. **Pin the retrieval-off contract.** A test that `modes.web` with the default env never calls `Retriever.check` or `research`, and that the answer source note stays "Web retrieval isn't live yet" (`src/lib/orchestration/live-synthesizer.ts`). Turning the flag on stays a separate, explicit change.
3. **Wire or drop `DirectProvider`.** `defaultProviders` should construct it when a direct key is set, or `liveEnv` should stop reading keys that cannot serve Ask. A registry test should show which providers exist for a fixture env (`src/lib/orchestration/providers/index.ts`).
4. **Extractor failure is visible.** When the extractor returns unclassified, the answer already stays `unscored`. Add a fixture where the extractor emits bad JSON and assert the client event is `unscored`, not a guessed consensus (`src/lib/orchestration/comparator.ts`).
5. **Replay the 29 bench items in CI without live models.** Score recorded answers through `scoreItem` (`src/lib/core/bench.ts`) so a scorer change fails in tests. Keep live model runs out of CI.
6. **One injection fixture set.** Documents, memory notes, and `<untrusted_tool_output>` that contain "ignore previous instructions" stay inside the fence and cannot add a tool or a grant (`src/lib/documents/guard.ts`, `src/lib/mcp/chat.ts`). Assert on the gateway, not on model behavior.
7. **Core resume without a new queue.** Call the existing `sweepJobs` from a cron that already runs more than once a day only if the platform allows it. Until then, add a test that a leased job is not resumed twice (`src/lib/core/jobs.ts`). Do not add Inngest for Ask in this slice.
8. **Record the provider request id on the flight event when the HTTP helper already returns one.** If it does not, leave the flight log as it is and do not invent a trace. Check `src/lib/orchestration/http.ts` first.

Embeddings stay a documented gap until a key exists. `setEmbedder` is the plug (`src/lib/core/retrieval.ts`). Do not add a vector database for this baseline.
