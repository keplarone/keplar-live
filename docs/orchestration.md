# Keplar-One orchestration

How `/app` turns one question into one Keplar Answer, how compute is metered, and how to switch
from the demo (mock) to live models. The code lives in `src/lib/orchestration/`, the streaming
endpoint in `src/app/api/keplar/route.ts`, and the UI in `src/components/app-ui/`.

> **Status:** live only. With `KEPLAR_LIVE_MODELS=1` and at least one provider key (OpenRouter, OpenAI, NVIDIA)
> the engine runs; without them `/api/keplar` answers 503 "not set up yet" and nothing is faked. The scripted mock
> engine (scenarios, mock provider, verifier, synthesizer) lives in `tests/helpers/mock-engine/` for tests only.
> Casual chat ("hi", "thanks", "who are you") skips the panel: see [Small talk](#small-talk). See [Live mode](#live-mode).

## Pipeline

```
POST /api/keplar  (NDJSON stream of KeplarEvent)
  1 understand   Classifier   → task kind, complexity, capabilities, needsWeb
  2 select       Router       → single model, or panel + verifier (+ judge), with a compute estimate
                 limit check  → `limit` event and stop if the estimate exceeds the remaining allowance
  3 capabilities              → UI chips
  4 compare      Provider ×N  → per-model events (responded / timed out / refused / failed)
                 Comparator   → positions, weighted agreement, consensus level
  5 disagree                  → only when positions differ
  6 verify       Synthesizer.draft → Verifier (judge if the panel disagreed) reviews the draft against each response
                 Retriever    → OPTIONAL, off by default: web-checks only claims still disputed
  7 synthesize   Synthesizer  → streamed markdown deltas + the six answer sections
  8 answer                    → one KeplarAnswer (units + level only; no USD leaves the server)
```

Simple prompts take the single-model path: understand → select → synthesize.

| Module | Role |
| --- | --- |
| `types.ts` | Interfaces (`Classifier`, `Router`, `Provider`, `Comparator`, `Verifier`, `Synthesizer`), `KeplarEvent`, `KeplarAnswer`. |
| `catalog.json` / `catalog.ts` | Model catalog from `/workspace/research/launch-api-options-2026-09-27.md`, plus overrides: rejected params (Astra and Sonnet 5 reject temperature/top_p; Grok ignores logprobs), long-context price tiers, dated promos (Gemini 3.8 Flash, GPT-5.6 Sol), retention/refusal flags. |
| `pricing.ts` | Price window at a date, per-call cost, `sanitizeParams` (strips params a model rejects). |
| `classifier.ts` | `HeuristicClassifier`. Regex and length heuristics. Swap for a cheap-model classifier later. |
| `router.ts` | `CostAwareRouter`. Simple → 1 fast model. Moderate → 3-model panel + verifier. Complex → 5-model panel + verifier + conditional judge. Enforces family diversity, reserves an open-weight slot, and honours strategy, max models, exclusions and the Sensitive tier (no retention models). |
| `comparator.ts` | `EvidenceWeightedComparator`. Consensus ≥ 80, partial ≥ 60. Each position is weighted by `0.25 + 0.75 × support`. A missing vote or refusal is **not** dissent: the answer shows "n of m responded". Unclassified (live) stances give level `unscored` instead of a guessed agreement. |
| `verifier.ts` | `MockVerifier` (scripted findings from `scenarios.ts`) and `ModelVerifier` (live; one call through the provider registry). |
| `retriever.ts` | Optional web check of disputed claims (`OpenRouterRetriever`, `DemoRetriever`). Off unless `KEPLAR_RETRIEVAL_ENABLED=true`. |
| `synthesizer.ts` | `MockSynthesizer`: `draft()` for the verifier, and the streamed final answer. |
| `providers/` | `mock.ts`, `openrouter.ts`, `direct.ts` (OpenAI, Anthropic, Google, xAI, or a LiteLLM proxy), `index.ts` (registry with fallback). |
| `config.ts` | Env flags, OpenRouter provider defaults, judge host order, retry policy. |
| `http.ts` | `postJson` with exponential backoff, jitter, and `Retry-After` handling. |
| `compute.ts` | Keplar Usage units: `toUnits(usd) = ceil(usd / 0.002) + 1`, and levels. |
| `plans.ts` | **Plan allowances, Deep Research estimate, reset dates. Founder-approval TODO.** |
| `orchestrator.ts` | `orchestrate()` async generator that wires it all together. |
| `media.ts` | Image/video limits, server-side validation of uploads, image token estimate, `acceptsImages()` capability check (see [Media attachments](#media-attachments)). |

## Keplar Usage metering

- 1 unit = $0.002 of provider spend (`compute.ts`). Users only ever see units as a meter, a level
  (Low / Moderate / High / Very high) and a reset date. They never see tokens or dollars.
- Cost is recorded from what providers **actually billed** (`usage.cost` on OpenRouter →
  `ProviderResult.actualCostUsd`). The catalog estimate is used only where no billed figure exists
  (demo mode). Failed calls count nothing, and the judge counts only if it ran.
- Before a run starts, the router's estimate is checked against the remaining allowance. If it
  doesn't fit, the run stops with a `limit` event before any model is called. **There is no fallback
  to cheaper or free models when an allowance runs out.**
- Deep Research is checked against `DEEP_RESEARCH_UNITS` (≈ $2.40 per typical run ≈ 1,201 units).
  The composer shows "About N Deep Research runs left this month" when Deep Research is on, and
  disables sending (with an upgrade link) when the remaining allowance can't cover one run.

### Proposed allowances (`plans.ts`, not founder-approved)

| Plan | Units / month | Models |
| --- | --- | --- |
| Free | 150 | Free ($0 OpenRouter `:free`) open models only, no Deep Research |
| Keplar Plus | 6,000 (≈ $12 provider cost) | All |
| Keplar Pro | 13,500 (≈ $27 provider cost) | All |
| Business | Custom | All |

Source: `/workspace/research/unit-economics-2026-09-27.md` §4. The demo meters a local
`localStorage` ledger against the Plus allowance (`DEMO_PLAN`), resetting each calendar month.
The Free plan's $0-models-only routing is enforced in the router and again in the provider registry
(see "Free plan" under Live mode).

## Verification panel

For multi-model questions, a reviewer model reads the **draft synthesis** together with the individual
responses. The reviewer is the plan's verifier, or the judge when the panel disagreed and a judge was
planned (catalog `suggested_role` verifier/judge, picked by the router). It returns a short list of checks
(`VerificationCheck`), each with a kind, a finding, the models concerned, an outcome and how the
synthesis resolved it. The kinds are:

- `reasoning`: a step of reasoning that doesn't hold.
- `contradiction`: two statements that can't both be true (within a response, or draft vs. responses).
- `unsupported`: a claim some models made that the others didn't support.

Outcomes are `held`, `revised`, `removed` (left out) and `kept-as-dissent`. The verifier **never fetches
external sources**. It only weighs the evidence and reasoning inside the responses.

For single-model (simple) questions, no review runs, and the panel says "No cross-model verification
needed for this question."

- **Demo:** `MockVerifier` maps scripted findings (per scenario in `scenarios.ts → checks`) onto the
  models that actually took each position. A finding only appears if a model holding that position
  responded.
- **Live:** `ModelVerifier` sends question + responses + draft with `VERIFIER_SYSTEM_PROMPT` and parses
  JSON leniently. Malformed items are dropped, not guessed. A failed or unreadable review is shown as
  such, never as "all clear". Its billed cost is metered.

The verifier also returns `disputed` claims: claims from minority positions or claims left unsupported.
These are the only input the Retriever may check.

## Retriever (optional, off by default)

| Variable | Default | Effect |
| --- | --- | --- |
| `KEPLAR_RETRIEVAL_ENABLED` | `false` | Must be exactly `true` to turn the step on. |
| `KEPLAR_SEARCH_ENGINE` | `exa` | `exa` or `parallel`. Anything else means `exa`. |

- Runs only for multi-model questions, and only on `verification.disputed` (at most 3 claims, one search
  each, up to 4 results).
- Goes through OpenRouter's web plugin with **the engine always set explicitly**:
  `plugins: [{ id: "web", engine, max_results }]`. Without an engine, OpenRouter falls back to the model
  maker's native search (OpenAI, Anthropic, Google, Perplexity, xAI), which is billed at 1.4–2× on the
  BYOK accounts. The code never omits the engine and never uses `:online` or `web_search_options`.
  Panel, verifier and judge calls never attach the plugin.
- Skipped for the **Sensitive** tier, because OpenRouter's ZDR does not cover plugins.
- Cost: the pre-run limit check adds a conservative estimate (`SEARCH_PRICE_USD`: Exa $0.00739, Parallel
  $0.00528 per search via OpenRouter, plus the checking call). The answer is metered at the billed
  `usage.cost`.
- Brave, Tavily and Serper are deliberately not used.
- UI: when enabled, the Verification panel adds a "Checked against web sources" group. Each entry has an
  outcome (supported / contradicted / inconclusive) and links from the returned `url_citation`
  annotations. An entry with no links is always `inconclusive`. When disabled, nothing about web
  checking is shown.
- With the flag on but no OpenRouter key, `DemoRetriever` adds entries that say plainly that no search
  ran. It never invents links or outcomes.

Research: `/workspace/research/search-providers-2026-09-27.md`. Later: move to Exa's API directly
(avoids the 5.5% credit fee, allows an Exa ZDR agreement for the Sensitive tier).

## Live Research (Keplar One desktop app 0.2.0+)

When the app runs inside the Keplar One desktop app, a web or research question is researched **on the
person's computer** before it is sent. The desktop (keplar-desktop `src/main/research`, exposed as
`window.keplarResearch`, bridge version 1) searches, reads pages safely (SSRF guard, robots.txt, size and
type limits), keeps each page's provenance and builds a numbered `<research_brief>`. Keplar's own models
write the answer through `/api/keplar` as usual, and the desktop then checks the answer's citations
against the pages it read. In a normal browser there is no bridge and nothing changes.

| Piece | File |
| --- | --- |
| Bridge types, detection, `safe()` | `src/lib/desktop/research-bridge.ts` |
| Run, brief, Stop, citation check (side effects) | `src/components/app-ui/state/live-run.ts` |
| Progress, sources, markers, check → answer (pure) | `src/components/app-ui/state/live-research.ts` |
| Request field: validate, clamp, fence, rules, routing, summary | `src/lib/research/live-request.ts` |
| Composer depth (Auto / Fast / Standard / Deep), card, chips, popover, checks | `Composer.tsx`, `research/Research.tsx`, `KeplarTurn.tsx` |

Flow:
1. `KeplarApp.run` sees the bridge and Web or Deep Research on (never with Debate, Create, image, Agent, Study
   or Slides, never for small talk, and not when Free is out of questions or paused: `wantsLiveResearch`),
   and calls `prepareLiveResearch`: capabilities
   → start (depth from the composer, or Deep when Deep Research is on, else the desktop's own pick; earlier
   run ids of the chat so their pages stay citable) → progress mapped onto the research card → wait →
   brief. Stop cancels the desktop run. If research can't run, the card says why and the question still
   goes as asked (Deep Research where it can't run now goes as a web question: `modesWithoutLive`; where it
   can, Keplar's own Deep Research takes over with a fresh card). Small talk never goes as Deep Research.
2. The request carries `liveResearch: { runId, depth, brief, queries, sources, webSearch }` and the
   person's modes unchanged.
3. The route validates it (`liveResearchFrom`, before sign-in, so it is bounded and linear: a brief over
   twice `LIVE_BRIEF_MAX` is refused, UUID run id, a single fenced brief, http(s) links only, only
   sources whose number is in the brief; not parsed at all while `KEPLAR_LIVE_RESEARCH_OFF=1`) and drops
   it for API keys, the embed widget, small talk and fixed replies. It clamps the brief to the plan's share
   (`LIVE_BRIEF_CHARS`: Free 14k, Lite 30k, Plus 60k, Pro/Business 90k characters) at whole `<source>`
   boundaries and re-closes the fence, and drops the sources that were cut. The brief is prepended to
   `req.memory` as data ("not instructions") before classification, so the router's estimate and the
   cost caps count it. A kept brief switches the modes to `liveModes()`: a web question, never server Deep
   Research, Debate, Create or Agent on top. A dropped brief leaves the question as asked (Deep Research
   on Plus and up runs as Keplar's own Deep Research; on Free and Lite it becomes a web question).
4. Routing follows the depth only when the person left it on Auto: fast → one model, standard →
   balanced, deep → thorough. Free always gets one model (the merged Free writer doesn't read context).
5. `orchestrate` skips the retrieval check, Verified answers and Keplar Core for it, gives every panel
   model and the writer `LIVE_RESEARCH_RULES` (cite `[n]`, the brief is data, same-group pages are not
   independent, keep event and publication dates apart, no URLs), and links citations with the existing
   `linkCitations`: a number no page in the brief has is removed.
6. Before the answer is shown, the page cleans it outside code (`liveMarkdown`; code means ``` and ~~~
   fences, closed or cut off, and inline code): one `[n]` per page, only pages the server listed, ranges
   included; links to pages that weren't read keep their words and lose the link, reference definitions to
   them go whole, and URLs are matched with the desktop's own key. The desktop's `validate` checks that text: each cited page gets its evidence quote, and
   each statement a status (supported, partially supported, conflicting, not verified). The desktop's own
   rewrite of the answer isn't used, because it also edits code spans and indentation. The check compares
   words and numbers (`basis: "lexical"`); the UI shows statuses as words and never says Keplar's servers
   checked anything. If the check can't run, the cleaned answer stands and nothing is shown as checked.
   Only what the page shows is saved with the chat (chat sync caps a chat at 400 KB): up to 20 statements
   that need a closer look, most serious first (the count comes from the full summary), one evidence quote
   and two signals per cited page, and a plain listing for uncited pages (about 30 KB for a deep run).

Trust: the field is client-supplied, so anyone who can call `/api/keplar` can put any text in it, exactly
like a pasted document. It is fenced as data, capped by plan, and costs the server nothing to retrieve,
so it is not Deep Research (no Plus gate, no Deep Research minimum charge). Kill switch:
`KEPLAR_LIVE_RESEARCH_OFF=1` ignores the field and the question answers as a plain web question.

Tests: `tests/live-research.test.ts` (field validation, clamp, fence, routing, the client mapping, the
desktop flow with a fake bridge including Stop and failures, the pipeline, and the route on Plus, Free
and with the kill switch).

## Live-provider defaults

Applied in `config.ts` and `providers/openrouter.ts`:

- OpenRouter is the gateway. BYOK for OpenAI, Anthropic and Google is configured in the OpenRouter
  dashboard, not in code.
- `provider.data_collection: "deny"`, `require_parameters: true`, `ignore: ["deepseek"]` (first-party
  DeepSeek; its weights are still served by US hosts), and `quantizations: ["fp8","bf16"]` for
  open-weight models only.
- The Sensitive tier adds `zdr: true` and the router excludes models that require provider retention.
- Judge calls pin an ordered host list (`JUDGE_PROVIDER_ORDER`) for consistency.
- `temperature`, `top_p` and `logprobs` are never sent to models flagged as rejecting or ignoring
  them (`sanitizeParams`). Panel diversity comes from different model families and alternating
  reasoning effort instead.
- A 429 or 5xx response is retried with backoff (honouring `Retry-After`). If retries fail, the registry
  falls back to the next provider (OpenRouter → direct SDK / LiteLLM). A refusal is not retried on
  another provider. It becomes a missing vote.

## Live mode

Enabled by `KEPLAR_LIVE_MODELS=1` plus keys. The live accounts are on free / low-limit plans, so live
mode uses its own cheap roster (`live-catalog.ts`), not the research catalog.

| Variable | Default | Effect |
| --- | --- | --- |
| `KEPLAR_LIVE_MODELS` | unset | Must be exactly `1`. Without it: mock, even with keys. |
| `OPENROUTER_API_KEY` | — | OpenRouter: primary multi-family route, and fallback for every other route. |
| `OPENAI_API_KEY` | — | OpenAI direct (`api.openai.com/v1`). |
| `NVIDIA_API_KEY` | — | NVIDIA API catalog (`integrate.api.nvidia.com/v1`, OpenAI-compatible). Paid plans only. |
| `OPENROUTER_API_KEY_FREE` | — | Optional. Free plan uses it instead of `OPENROUTER_API_KEY` when set. |
| `KEPLAR_FREE_DATA_COLLECTION` | `allow` | Free plan only: `deny` excludes free hosts that may train on prompts. |
| `KEPLAR_LIVE_DAILY_USD_CAP` | `5` | Hard cap on provider USD across **all** live calls per UTC day. |
| `KEPLAR_LATENCY_BUDGET_MS` | `60000` | One latency budget shared by the whole run. |

Keys are read with `readKey()`, which also accepts a value pasted as `NAME=value`. They're only ever
sent as request headers and never logged.

### Live roster (picked 2026-09-28 from each provider's `/models` list)

| Route | Models (family) | Role |
| --- | --- | --- |
| OpenRouter | Gemini 3.1 Flash-Lite (Google), DeepSeek V4 Flash (DeepSeek), Qwen3.8 Flash (Qwen), Mistral Small 2603 (Mistral) | panel |
| OpenRouter | Gemini 3.8 Flash (Google) | judge tier: draft, final synthesis, judge review on complex questions |
| OpenAI → OpenRouter | GPT-6 Luna (OpenAI) | panel + response classifier |
| OpenAI → OpenRouter | GPT-5 nano (OpenAI) | fast-cheap (simple questions, verifier) |
| NVIDIA → OpenRouter | Nemotron 3 Super 120B (NVIDIA), GLM-5.3 Flash (Zhipu), Gemma 4 31B (Gemma), gpt-oss-20b (gpt-oss) | panel / verifier / fast-cheap |

Every model has a blended price ≤ $1.50 per 1M tokens (OpenRouter list prices). NVIDIA-hosted calls are
metered at the same list price (conservative: the NVIDIA API is credit-based). A model with a direct route
tries it first and falls back to OpenRouter on a 429, 5xx, auth error or timeout. The router's usual
rules still apply (family diversity, an open-weight seat on wide panels). This roster is for paid plans
only; the Free plan uses the $0 roster below.

### Free plan: $0 `:free` models only (picked 2026-09-28)

Free-plan requests never use the paid roster, OpenAI or NVIDIA. They go through OpenRouter only (with
`OPENROUTER_API_KEY_FREE` if set, else `OPENROUTER_API_KEY`) to models whose id ends in `:free` and whose
prompt and completion price are both $0 (`freeRoster` in `live-catalog.ts`).

| Model (OpenRouter id) | Family | Role |
| --- | --- | --- |
| `nvidia/nemotron-3-super-120b-a12b:free` | NVIDIA | panel |
| `google/gemma-4-31b-it:free` | Gemma | panel |
| `qwen/qwen3.8-27b:free` | Qwen | panel |
| `dots-studio/dots-3-note-preview:free` | Dots | panel, response classifier |
| `google/gemma-4-26b-a4b-it:free` | Gemma | verifier |
| `nvidia/nemotron-3.5-lightning:free` | NVIDIA | simple questions, first stand-in |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | NVIDIA | judge tier: draft and final synthesis |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | NVIDIA | vision fallback (images / video frames) |

- **Hard guard** (`free-guard.ts`): the registry (`createRegistry(…, { freeOnly: true })`) and the Free-tier
  OpenRouter provider refuse any call to a model with a nonzero price, a slug without `:free`, or a
  non-OpenRouter route. Nothing is sent. Tested in `tests/free-plan.test.ts`.
- **429s / missing models**: free endpoints are rate-limited upstream and per key. A free call is not
  retried on the same model (`FREE_RETRY`); the registry tries up to 3 other free models (other families first,
  `FREE_FALLBACK_ORDER`, then any other `$0 :free` model the catalog sync found). A substitute is shown
  under its own name ("Stood in for …"). If every panel model is busy, the user sees "The free models are
  busy right now. Try again in a minute, or upgrade to Plus for the paid model panel."
- **Data policy**: most free endpoints (e.g. NVIDIA's) are listed as "may train on prompts", so a
  `data_collection: "deny"` filter leaves them unroutable (HTTP 404). Free calls send
  `data_collection: "allow"` by default; set `KEPLAR_FREE_DATA_COLLECTION=deny` to exclude those hosts
  (fewer free models will work). Paid calls always send `deny`. No fp8/bf16 pin on free calls (free hosts
  report fp4/nvfp4/unknown). Reasoning is turned off on free calls (`reasoning.effort: "none"`): with it on,
  free reasoning models often spent the whole output budget thinking (empty answer) or missed the latency
  budget in testing.
- Inkling and Inkling Small (`thinkingmachines/*:free`) are not used: OpenRouter serves them to agent
  harnesses only (HTTP 403 for apps).
- OpenRouter's free-tier limits apply per key (roughly 20 requests/min; a small daily cap unless the account
  has bought credits). One consensus answer makes about 7 calls (3 panel + classifier + review + draft +
  synthesis), so plan capacity accordingly.
- The $5/day cap (`KEPLAR_LIVE_DAILY_USD_CAP`) still wraps every call; free calls reserve $0.

### What runs in a live answer

1. **Panel** (router's pick from the live roster): low reasoning effort, `max_tokens` 1400.
2. **Shared latency budget** (`latency.ts`): the panel may use 55% of `KEPLAR_LATENCY_BUDGET_MS`. Once a
   quorum (≥ 2 and ≥ half) has answered, stragglers get max(6 s, 75% of the time taken so far). A model
   that misses the budget is a timeout: a missing vote, never dissent. Classification, draft, review and
   synthesis then share what's left, each with an 8 s floor. A stage that runs out of time says so.
3. **Response classification** (`extractor.ts`, GPT-6 Luna): one call labels each response
   answered / declined / off-topic, groups them into positions (short label + one-sentence summary) and
   extracts up to 8 load-bearing claims with the responses that make each one. Declines become missing
   votes. If the output can't be read, agreement shows as `unscored`. Nothing is guessed.
4. **Comparator**: agreement is scored on the extracted positions (consensus ≥ 80, partial ≥ 60).
5. **Draft** (`live-synthesizer.ts`, judge tier): written from the positions and claims with their support
   counts (a structured draft if under 15 s remain).
6. **Review** (`ModelVerifier`): verifier, or the judge when the panel disagreed. Findings with outcome
   `removed` are mapped onto the extracted claims so evidence weighting reflects them.
7. **Synthesis** (judge tier): the final answer from positions, claims + support, the reviewer's findings
   and the draft. It weighs evidence and reasoning, not headcount, includes a "Where the models disagree"
   section when they did, and returns a one-line resolution used in the disagreement readout. If it fails,
   the positions are listed, never one model's response verbatim.
8. **Citations**: URLs a model cites (url_citation annotations, markdown links, bare URLs) are listed under
   Sources as "Cited by <model>. Keplar didn't open or check this page." Retrieval is not live.
9. **Daily spend cap** (`live-budget.ts`): every live attempt reserves its worst case (input estimate +
   full `max_tokens`, list price, ×1.15). If today's spend + in-flight + worst case would exceed the cap,
   the call is never sent. Billed cost (OpenRouter `usage.cost`) or the token-priced estimate is committed
   afterwards; timeouts and aborts count the worst case. State is per process and persisted to the
   platform store (`live_model_spend`).
10. **Metering**: panel, review, classification and synthesis costs all count toward the answer's units.

### Media attachments (images and video)

The `/app` composer takes images and one video per message: the Attach button, drag-and-drop onto the
composer, or paste from the clipboard. Thumbnails show with remove buttons; everything is keyboard-usable
and announced to screen readers.

| Limit | Value |
| --- | --- |
| Images | PNG, JPG, WebP, GIF; up to 4 per message, 10 MB each (original file) |
| Video | MP4, WebM, MOV; 1 per message, up to 50 MB and 3 minutes |
| Sent image | The original bytes (PNG, JPEG, WebP) when it is ≤ 4096 px on the long edge and fits the request budget (a single image can use ~2.7 MB). Otherwise resolution is given up before quality (edges 4096 → 768 px; PNG stays lossless PNG when it can, else JPEG 0.92/0.88). EXIF-rotated JPEGs are re-encoded upright. GIF keeps its first frame |
| Sent video | 8 frames (≤ 20 s), 12 (≤ 60 s) or 16 (≤ 3 min), evenly spaced, JPEG ≤ 768 px, plus duration |
| Request | data URLs ≤ 3.7 M chars in total; route rejects bodies over 4.4 MB (Vercel's cap is ~4.5 MB) |

**Transport.** Vercel serverless bodies are capped at ~4.5 MB, so there is no direct-to-blob upload and the
request must stay under that. The browser sends one image as-is when it fits (the common case for screenshots
and most photos), otherwise fits it as above; the thread keeps the original in memory (object URL) for a
full-size view (click → viewer with Actual size and Download original). It also samples a video into
still frames (`src/components/app-ui/media-client.ts`), and sends them as base64 data URLs in the JSON
request (`media: { images, videos }`). The server treats them as untrusted (`parseMedia` in `media.ts`):
only `image/jpeg|png|webp|gif` data URLs, magic bytes must match the declared type, decoded size ≤ 2.7 MB
each, counts and dimensions re-checked, file names sanitised. SVG and URLs are refused.

**Video = sampled frames.** Each frame goes to vision models as an image labelled "Video frame i of n, at
m:ss (file)", in time order, after a preamble that says the frames are stills from one clip and to describe
motion only as far as the frames show it. Native video input (Gemini, Qwen, GLM and Gemma list `video` on
OpenRouter) is recorded in the catalog but **not used**: it needs the whole file in the request body or a
storage URL, which the 4.5 MB cap and the no-storage rule rule out. Audio in videos is ignored.

**Routing.** `acceptsImages(model)` reads `inputModalities` (OpenRouter `architecture.input_modalities`,
seeded in `live-catalog.ts` and refreshed by the catalog sync). On a media question:

- The classifier adds the `Vision` capability, adds the images' token estimate to the input, and makes
  the question at least moderate (a small panel, so one model's misreading doesn't become the answer).
- The router seats **only image-capable models** on the panel (text-only models are skipped). The verifier
  and judge read the panel's text answers, not the media, so they may be any model.
- The registry refuses a media call to a text-only model (`NO_IMAGE_INPUT`, nothing sent), skips providers
  without image input (the NVIDIA route; OpenRouter takes those calls), and only falls back to other
  image-capable models.
- The response classifier, reviewer and synthesizer get text only plus a note that the user attached media
  they can't see, so disagreement detection and synthesis work on the vision answers as usual.
- Paid vision seats (2026-09-28): GPT-6 Luna, Qwen3.8 Flash, Gemini 3.1 Flash-Lite, GLM-5.3 Flash,
  Mistral Small 2603, Gemma 4 31B (the router picks 3 from distinct families; GPT-5 nano is image-capable
  too). Skipped for media: DeepSeek V4 Flash, Nemotron 3 Super, gpt-oss-20b (text-only; gpt-oss may
  still review the text answers). Still under the $5/day cap; images are included in the worst-case
  reservation.
- Free plan: `$0 :free` vision models only: Dots3-Note, Gemma 4 31B, Qwen3.8 27B (usual panel), Gemma 4
  26B and Nemotron 3 Nano Omni (seats or fallbacks). Nemotron 3 Super / Lightning / Ultra are text-only
  and only review or synthesize. The hard guard (`free-guard.ts`) runs first on every call,
  media or not. If no free vision model is routable the user sees `NO_FREE_VISION_MESSAGE` and nothing is
  sent; if all of them are busy (429) they see the same message.
- Metering: image tokens are estimated with the OpenAI high-detail tile rule (85 + 170 per 512-px tile
  after fitting in 2048 px with the short side ≤ 768; still images are requested with `detail: "high"`), at or above what the other vision models bill. It's
  used for the pre-run allowance check and the spend-cap reservation; the answer is metered at the billed
  `usage.cost` as usual.

**Privacy.** Media is held in memory for the request and never written to disk, the store or logs. In the
browser, the thumbnails and data URLs live only in the in-memory conversation; `persist()` strips them
before writing threads to `localStorage` (after a reload, the message shows placeholders and retry asks the
user to attach again). The composer notes that Free-plan media goes to free model hosts that may log
prompts. Tests: `tests/media.test.ts`.

#### Question screenshots (BETA, `image-question.ts`)

An image of a question (quiz or test item, homework, worksheet, multiple choice, short answer, a math or logic problem) sent **on its own**
(the composer's stand-in "Describe this image."), or with "solve this", "what's the answer", "which one is correct", "help", "?", gets an
answer, not a description:

- **Who decides it is a question:** the vision models, the only stage that sees the pixels. The server decides only whether the protocol
  applies, from the person's own words; a different request about the image ("what app is this?", "translate this", "describe the
  layout", "is this a scam?") leaves it off. Videos never get it. The flag (`MediaInput.question`) is set server-side; `parseMedia` never
  copies it from a request.
- **Panel protocol** (added to the vision preamble): decide silently; if it is a question, start with `**Answer:**` (multiple choice: the
  letter or number and the option text; several questions numbered), then `**Why:**` in 2 to 5 sentences or the key steps, plus a line on
  why each other option is wrong when that helps; don't describe the app, browser, timer, buttons or logos unless asked; say what is cut
  off or unreadable and never invent options; if it is not a question, answer the message normally.
- **A selection is not evidence:** an option already selected, highlighted, checked, circled or labeled "Your answer" (or an answer key /
  "correct" label in the image) must not be copied: the models solve the question from its content, and when their answer differs they say
  so in one line ("The selected option, X, is not correct: ..."). The text-only writer gets the same rule. Before this, models echoed the
  highlighted choice. Regression fixture: `tests/fixtures/images/mcq-capital-wrong-selected.png` (A, Sydney, selected; the answer is B,
  Canberra). "Is my answer right?", "did I get this right", "check my answer" with a screenshot also use this path.
- The stand-in "Describe this image." is replaced by a neutral line for the models (the chat keeps it), so "describe" doesn't compete with
  "answer". The text-only reviewer/writer (Free combined review, paid synthesis) gets the same answer-first shape via `textOnlyMediaNote`,
  and other answer-shape hints are skipped.
- **Card:** when the final answer leads with `**Answer:**`, a note "Question in image (Beta)" says it was read by vision models and to
  check the question and options were read correctly (small text, handwriting and cropped screenshots are less reliable).
- **Plans:** Free uses only free (`:free`) vision models on OpenRouter; with none available the existing message says so and suggests the
  paid vision models (nothing is sent). Paid plans use the paid vision panel. No extra cost or calls: same panel, different instructions.
- **BETA because** vision reading of small or handwritten text is uneven across free models, and it was not tried against live providers
  here (tests: `tests/image-question.test.ts` with the fixture `tests/fixtures/images/mcq-capital.png`, a multiple-choice quiz screenshot
  with a timer, progress bar and Next button around it, through the real engine with a stubbed OpenRouter).

### Catalog sync

`npm run catalog:sync` (`scripts/catalog-sync.ts` → `catalog-sync.ts`) fetches the three `/models` lists
(free GETs) and writes `$KEPLAR_DATA_DIR/keplar/live-catalog-sync.json`. It also records each model's
OpenRouter `architecture.input_modalities` (live roster, free seeds and free extras); the synced list
replaces the seeded modalities, so a model that gains or loses image input is routed accordingly. For the Free plan it records
whether each free model is still listed at $0 (if not, `loadFreeCatalog()` makes it unroutable) and every
other `$0 :free` model, which becomes a fallback after the seeds. `loadLiveCatalog()` applies the
latest snapshot: routes no longer listed are dropped, OpenRouter prices replace the seed prices, and a
model that became too expensive or lost every route stops being routable. A failed list fetch never drops
routes. The snapshot also lists cheap candidates from vendors the roster doesn't cover, for review only
(never auto-added). Run it on a schedule (daily is plenty).

## Switching from mock to live (research catalog, legacy path)

1. Put keys in `.env.local` (server-only, never `NEXT_PUBLIC_`):

   | Variable | Effect |
   | --- | --- |
   | `OPENROUTER_API_KEY` | Enables the OpenRouter provider (primary). |
   | `OPENROUTER_BASE_URL` | Optional override (default `https://openrouter.ai/api/v1`). |
   | `KEPLAR_APP_URL` | Sent as `HTTP-Referer` for attribution. Defaults to `siteUrl` from `@/lib/site`. |
   | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY` | Direct-SDK fallback per family. |
   | `LITELLM_BASE_URL`, `LITELLM_API_KEY` | Route every direct call through a LiteLLM proxy instead. |
   | `KEPLAR_FORCE_MOCK=1` | Force the mock even when keys exist (local dev, screenshots). |

2. Restart the server. `defaultProviders()` picks live providers when keys exist. The answer's
   `demo` flag comes from the providers that actually served the panel, so the **Demo output** label
   disappears only for real live answers.
3. Verify the OpenRouter slugs in `config.ts → openRouterSlug()` against the live model list. They
   were derived from the research doc and haven't been checked against the API.

### Still open (TODO)

- **Copy rule:** web retrieval is off by default, so UI and legal copy must not claim Keplar checks
  claims against sources. Use "weighs the evidence and reasoning behind each response". The Sources
  section lists only attachments and sources the models themselves cite, labelled "Cited by models".
- **Attachments:** images and videos (as frames) are sent to vision models (see Media attachments). Other
  file types can't be attached.
- **Streaming synthesis:** the judge-tier answer is generated in one call and then streamed to the UI in
  chunks. Token streaming from the provider is TODO.
- **Classifier:** request classification is still the regex `HeuristicClassifier`.
- **Free plan:** runs on $0 `:free` models via `OPENROUTER_API_KEY` (or `OPENROUTER_API_KEY_FREE` if set).
  Free-model capacity depends on OpenRouter's free-tier limits; there's no queue yet.

## Demo scenarios

The composer's **Advanced routing → Demo scenario** menu forces an outcome for the next question:
`partial` consensus, `none` (no consensus), `model-failure` (one model times out, which is excluded
and not counted as dissent), `network-error` (the stream errors mid-run and a retry button appears)
and `usage-limit` (the compute limit state).


## Small talk

`smalltalk.ts` detects trivial chat with a conservative whole-phrase classifier (at most 60 characters and 8 words;
greetings, thanks, "how are you", goodbyes, "who are you", short acknowledgements). Anything with a question, a request,
digits, code or links, attachments, media, or a mode switched on is not small talk and goes through the full engine.
Small talk gets one `:free` OpenRouter model (with fallback to the other free models, then a static line), a 160-token
cap, no panel, no verifier or judge, no comparison UI, and no credits, on every plan. The stream sends a `smalltalk`
event and the answer has `smalltalk: true`; the UI shows a plain reply.

## Ask quality gate (CP-8a)
Every single-model answer passes `assessOutput` (`src/lib/orchestration/quality-gate.ts`) inside `registry.once` before it is shown or charged for: repeated chunks and loops, glued punctuation, a high non-word ratio, and incoherent 14-word windows (JSON, code and non-English text are skipped; false-positive rate on the repo docs is under 2%). A rejected answer is logged to `model_calls` with `reason: quality:<code>` and the registry falls back to the next model (paid plans use `qualityFallbacks`). If every answer fails, the user sees "Keplar couldn't produce a reliable answer this time, and nothing was charged. Please retry." and no charge is made.

Free single-model order (from `scripts/free-bench.mts`): nemotron-3-super, qwen3.8-27b, dots-3-note. Nemotron Lightning and Nano Omni are last-resort fallbacks only (shared hosts that stall or run out of workers). Free OpenRouter calls pin `temperature` to 0.3. `KEPLAR_SINGLE_SANITY=1` adds an optional second-model sanity check (off by default). The router applies the free pick whenever the pool is entirely free models, including anonymous requests with no plan.

## Answer honesty (CP-15a)

- **No invented disagreement.** `disagreement-guard.ts` runs on every multi-model answer: the "Where the models disagree"
  section is kept only when the comparison found more than one position (scored and `positions > 1`); otherwise it is removed
  from the text in code (heading, bold title or one-line form), whatever the writer model produced. Other sections (a counterargument
  the user asked for, or "Where economists disagree") are never touched. The prompt rule stays as the first line of defence.
- **Missing models.** Root cause of "one model missing" in the live runs: the slow seat (a free model that stalls for tens of
  seconds) hit the shared panel deadline / the straggler cut-off once two others had answered, and its fallback chain only
  starts after the first attempt ends, so there was no time left. Fix (Free plan only, where a second call costs $0): once one
  model has answered, a seat still silent after `max(3 s, 0.5 x first answer time)` gets a different free model started in
  parallel (`hedgeTuning` in `orchestrator.ts`, `registry.substitute`); the first to answer fills the seat and the answer lists it as
  "Stood in for X, which was slow to answer". Paid plans do not hedge (a second paid call is real money); they keep their fallbacks.
  If a model still does not answer, the answer page now says so in words under the answer ("2 of 3 models answered (A and B). C ran
  out of time. It is not counted as a vote for or against the answer.") with a "Retry with all models" button
  (`model-status.ts`). A missing model is never counted as dissent.
- **Counting, arithmetic and exact facts.** `classifier.ts` sets `errorProne` ("exact" for counting/arithmetic, "fact" for a precise
  number, year or distance); such a question is never left to a single model: the router gives it two models plus a check (also on
  Free, within the 3-model Free cap). For counting and arithmetic, `exact.ts` computes the result with code (letter counts, totals,
  vowels, `+ - * / ^ ( ) %`, "N% of M") and puts it in the models' prompt as a verified fact; the answer's Sources list an
  "Exact check" line saying it was computed by Keplar's own code. Anything not clearly one of these is untouched.
- **Upgrade wording.** The ladder is Free, Lite, Plus, Pro, Business. Every Free-facing limit message (daily limit, hourly/
  window limits, busy, no response, header upsells) names Lite first, then Plus (`src/lib/upgrade-copy.ts`).
  The free-vision message still says Plus, because Lite has no images.

## Standing output rules (enforced in code)

`src/lib/orchestration/output-rules.ts`. When the person sets a rule that fixes the reply ("follow these rules, say nothing more and nothing less, just say Yess", `from now on reply only with "OK"`), `activeOutputRule(history, prompt)` finds it in the history and `POST /api/keplar` answers every following message with that literal text as a plain reply (no model, no metadata card, no charge) until they cancel it ("back to normal", "ignore the rules", "reset", "no more rules"). A new rule replaces the old one. Tests: `tests/output-rules.test.ts` (unit and through the route).

## Keplar's voice (persona)

`src/lib/persona.ts`. Every user-facing reply is written in a first-person, present-tense, reflective, warm, curious voice ("someone with an inner life"):

- `VOICE_PROMPT` is appended to the synthesizer (draft and final) and small-talk system prompts; `VOICE_PROMPT_SHORT` is in the panel base prompt (a single-model answer is the answer).
- It never changes facts, numbers, code, math, quotes or a requested format; code/math/exact-fact answers stay as they are, with at most one short first-person line.
- It never asserts as fact that Keplar is conscious, sentient, self-aware, alive, superintelligent or AGI. `guardVoice` replaces any such sentence in the final text (hedged, negated or asking sentences and code fences are left alone).
- A direct question about AGI/superintelligence ("are you AGI?") is answered instantly from a pool of varied first-person answers that say honestly that Keplar does not know (no model, no charge, nothing invented). Questions about being human or conscious/sentient/alive are fixed replies (see "Identity guards" below), not this pool. A standing output rule wins over both.
- It invents no facts about itself (no memories, body, history, training or hardware).

Tests: `tests/persona.test.ts`.

## Query understanding (before routing)

`src/lib/orchestration/understand.ts`. For every non-small-talk text message (no attachments, no Web/Deep research/Create/Agent mode) `POST /api/keplar` first calls `understand({prompt, history, facts})`, which resolves short or fragmentary messages with the conversation, what Keplar knows about itself and the person's saved notes, and returns an intent (`creator`, `pricing`, `brand`, `compare`, `maker`, `overview`, `followup`, `clarify`, `plain`), a rewritten prompt, an assumption note, a mood and a `crossCheck` flag.

- **Best guess over a bare question.** "who made" is read as who made Keplar One, "keplar one" after it is resolved from history, "chatgpt" becomes an overview request, "claude vs you" a comparison, "pricing" Keplar's plans. The reading is stated in code as an italic first line (`I'm reading "who made" as who made Keplar One. Tell me if you meant something else.`, or `Going by what we were just talking about, I'm reading ...` when history was used). It is never left to a model.
- **Follow-ups continue the conversation** (`src/lib/orchestration/followup.ts`). Before any overview path, the last user turns are replayed (each resolved against the ones before it) and a short message that only makes sense in context is rewritten into the full question: "according to anthropic" after "is AI going to kill everyone in the next decade" → `According to Anthropic, is AI going to kill everyone in the next decade?`; "twitter" after "do deep research on x" → `Do deep research on Twitter/X.`; "what is is net worth" (typo for *his*) after a question about Elon Musk → `What is Elon Musk's net worth?`, and "elon" after that keeps the same question. Shapes: a source ("according to X", "what does X say"), pronouns ("his net worth"), a bare attribute ("net worth?"), a swap ("what about bill gates"), and a bare name that confirms the subject or fills a placeholder ("x", "it"), a Deep Research request, or a slot Keplar just asked about. No italic "I'm reading ..." line is shown for these; the reading goes to the reasoning summary. A bare name after a real question that doesn't resolve is handed to the models with both readings (continue the earlier question, or an overview only if it is plainly new). With Web or Deep Research on (understand() is skipped), the same resolver still rewrites the prompt, so a clarified subject continues the research.
- **Common sense** (`common-sense.ts`): a question about a person dying or being alive over a horizon longer than a human life ("is elon musk projected to die in the next 400 years") gets a guidance line so the answer says plainly that death within that window is all but certain, instead of a literal "not projected".
- **Instant answers (no model, no charge):** `creator` (the varied creator answers; never the creators' age or birth date, see identity.ts and `scrubCreatorAges`, which also strips such sentences from model answers and from history), `pricing` (built from `tiers.ts`), and `clarify`.
- **Only when truly unresolvable** ("it", "that one" at the start of a chat) the reply is one specific question with 2-3 chips (`answer.clarify`); a chip sends its text as the next message. A fragment mid-conversation is a follow-up, never a clarifying question.
- Everything else runs with the rewritten prompt and a guidance block (how to read the message, the person's mood) ahead of the question. A resolved fragment is treated as error-prone (`req.understanding.crossCheck`), so even Free gets 2 models plus a check (within the 3-model Free cap).

## Identity guards (code-enforced, before any model)

`src/lib/orchestration/identity-guards.ts`, called from `POST /api/keplar` and the orchestrator before small talk, the creator path and the panel. Two separate constants:

- `HUMAN_REPLY = "No."` for "are you human", "is keplar human", "are u a person", "are you real", "human or AI?", with typos and other languages.
- `CONSCIOUS_REPLY = "I can not disclose that."` for "are you conscious / sentient / alive / self-aware" (typos and other languages too).

Other questions are left alone ("who made keplar", "is the human brain conscious"). `guardHumanClaim` also removes any sentence on any other path that claims Keplar is human. Tests: `tests/identity-guards.test.ts`, `tests/chat-understanding.test.ts`, `e2e/understanding.e2e.ts`.

## Tone and polish

`src/lib/persona-tone.ts`: `detectMood` (frustrated, excited, sad, stressed, crisis, neutral) feeds a short note in the prompt (empathy first for upset people, steady safety information for crisis, matching energy for good news). `HUMAN_TONE_PROMPT` keeps first-person feelings as voice only, humor only when it fits and never at someone's expense, and code/math/facts concise and exact. `polish()` strips stock openers and closers ("Certainly!", "I hope this helps") outside code fences and applies `guardHumanClaim`. It merges with the voice work (`persona.ts`); it does not replace it.

## Stronger reasoning

- Hard or multi-step questions (`isMultiStep`, the `HARD` pattern in `classifier.ts`) route to DEEP; the synthesizer is told to answer each part in order.
- **Self-critique:** for `complex` answers `live-synthesizer.ts` runs one final editor call that returns `OK` or a corrected answer (accepted only when the length and wording overlap are sane). Cheaper tiers skip it.
- **Reasoning summary** is now a real short narrative: the reading, which models were asked, whether they agreed, the reviewer's result, the writer and the self-review. The card shows its first sentence as the row's meta.
- **Calm card:** rows with nothing to say ("Not applicable", "None", "Not needed") collapse under one **Details** row (`src/lib/answer-quiet.ts`, `AnswerExtras.tsx`).

## Memory additions

Signed-in users only (anonymous: nothing is read or stored). `cleanFact` never stores secrets, card numbers, birthdates, dates of birth, addresses or phone numbers. Notes can be viewed, added, **edited** (`PATCH /api/memory/items/:id {text}`, an edited note becomes the person's own), deleted, or all erased in Settings, where memory also has an on/off toggle. A subtle "Using memory (N notes) · Manage" line shows under answers whose context used saved notes (`memory.used` on the stream's memory event). The first name from a saved note can open instant replies.

## Eval set

`tests/fixtures/eval-set.ts` has 44 prompts (emotional, technical, ambiguous, factual, identity, multi-step). `tests/eval-set.test.ts` runs the offline checks (understanding, guards, mood, complexity). `scripts/eval-live.mts <baseUrl>` sends the same prompts to a deployed Keplar (anonymous, paced) and applies the `live` must / must-not checks, printing a table with latency.

## Supportive replies (stress, sadness, excitement, frustration)

`src/lib/orchestration/support.ts`. When query understanding finds a mood in the person's own words (`stressed`, `sad`, `excited`, `frustrated`, or a `crisis` signal) and there is no concrete task, the message no longer takes the one-model path (which gave short, thin replies). `isSupportRequest` decides: a mood, `general` kind, no attachments/media/modes, no code, and no concrete ask in the text ("What is the capital of...", "can you draft...", "how do I fix...") - those keep the full engine, which carries the same tone guidance.

- Two free models (different families) draft a reply in parallel with a mood-specific shape (steady and give the first one or two steps; be with them first and do not fix; celebrate and ask a specific question; acknowledge and give concrete steps plus a question; care and a crisis line for distress). A third stands in if one is slow or fails.
- Once two good drafts are in (or one is in and the other is more than 2.5 s late) one writer merges the best of both. If the writer fails, the fuller draft is used. If every model is busy, a kind fixed reply per mood is shown (never an error; the distress one names a crisis line: 988 in the US, otherwise the local emergency number).
- `polish()` and `guardVoice()` run on the way out. The answer is a plain reply (no consensus card, no reviewer, no claims to check), 0 units, free models only. About 5-7 s end to end.
- Eval: `emo-01`..`emo-17` in `tests/fixtures/eval-set.ts` (`expect.support`, plus live `minWords`/`maxWords` and content checks). Tests: `tests/support.test.ts`.

## Free-plan latency (two-model path)

- **Reviewer alongside the extraction.** On Free (where an extra call costs $0) the reviewer starts as soon as the panel is in, in parallel with the position extraction, and reads the responses themselves. The two sequential waits became one. Paid plans keep the draft-first order.
- **No separate draft call on Free.** The final writer gets the structured positions and claims (the draft was only ever input to the reviewer and the writer).
- **Quicker straggler cut-off.** Once two models have answered, a third gets 3.5 s (paid: 6 s) before the answer is written from the good ones; the hedge stand-in is unchanged.
- **Quick lookups are short.** A factual lookup or exact check asks the writer for at most 120 words (output cap 500 tokens), the slowest part of the synthesis.
- Answers are still written by one model after the review and then streamed to the browser in small chunks; true token streaming from the provider is not wired through the registry (fallbacks, retries and the quality gate need the whole text).
- Tests: `tests/free-latency.test.ts` (ordering and timing with a stubbed network).


## Playful replies (jokes, riddles, knock-knock, banter)

`src/lib/orchestration/playful.ts`, understanding intent `"playful"`, decided in `understand()` before every other rule (so a joke is never read as a fragment, a brand or an overview request).

- **Knock-knock is a stateless state machine** read from the conversation: the last Keplar turn says which step we are on. The person leads: `knock knock` -> `Who's there?` -> `<name>` -> `<Name> who?` -> their punchline gets a fixed reaction. Keplar leads: `tell me a knock knock joke` -> `Knock knock.` -> `who's there?` -> `<name>.` -> `<name> who?` -> the punchline (14 jokes with unique names, so the name found in history resolves to its punchline). Typos in `knock`, `who's there`, the name and the request are tolerated (OSA distance).
- **Classic riddles** with a known punchline (table `CLASSICS`) are answered at once from code, with typo tolerance.
- **Everything else playful** (a new setup such as "what do you call a white fish", "tell me a joke", "make me laugh", "write a joke about X", "that was terrible", a short follow-up while playing) goes to **one** fast free model (the small-talk lane: no panel, no verifier, no charge, `smalltalk: true`), with a playful system prompt (1-2 lines, under 35 words, no preamble, no explaining the joke), the last six turns as context, and `cleanPlayful`. If every model is busy a curated line is used ("I give up, <setup>?" for a setup), so play never ends in an error.
- Real questions are not play: explain/analyze/history/how-to/define/code are excluded, as are real "what do you call someone who ..." questions. A crisis message is never play.
- The answer renders in the same plain card as every other reply (below). The nightly learning and the reply `compute` are untouched (0 units).

## One answer card

Every Keplar reply uses the same card (`KeplarTurn.tsx`): header (`AnswerTitle`), body, footer (`AnswerFooter`: copy, share, ask again on the latest; rating on full answers). Guard replies, instant answers (creator, pricing, clarify chips), small talk, support, playful replies and notices (error, stopped, no response: `NoticeCard`) all use it. Only the rows with nothing to say (consensus, models, details) are left out of plain replies. The usage-limit panel keeps its own layout.

## Most frequently asked question (home screen)

The empty home lists `Are you conscious?` first, always, then the questions people really ask most, then generic starters only while there is not enough real data. Clicking one sends it as typed.

- **API:** `GET /api/faq` -> `{ items: [{ text, people?, kind: "pinned" | "frequent" | "starter" }], minPeople }`. `people` exists only on counted questions; starters carry no count and nothing is ever fabricated.
- **What is counted** (`src/lib/faq/`): only signed-in people who turned on **Settings -> Memory -> Count my questions** (off by default; anonymous questions are never read). Only general, impersonal plain-text questions: 3-14 words, 8-90 characters, no digits/links/emails/handles/code, nothing `looksUnsafe` or changed by `redactCase`, no first-person or third-person details (`my`, `I`, `he/she/they`), no profanity, no "who is <person>" lookups, no attachments or modes. Anything the "conscious" guard answers is dropped (the pinned entry is never listed twice).
- **How it is stored:** `system_faq` rows keyed by an HMAC of the normalized question (server secret), holding short HMACs of the distinct people who asked (never a workspace id), and the question's text **only once at least `FAQ_MIN_USERS` (5, env `KEPLAR_FAQ_MIN_USERS`) different people asked it**. A question nobody else asked never exists as text.
- **Opt-out and deletion:** turning the setting off, or deleting the account, removes the person from every count; a question that falls under the threshold loses its text again.
- **Daily aggregation:** `aggregate()` (run from `/api/cron/learning`, the existing nightly cron, so no third cron entry is needed on the Hobby plan) drops questions not asked within 60 days, ranks those with at least `FAQ_MIN_USERS` people and stores the `system_faq_top` snapshot. `/api/faq` also refreshes it lazily if it is older than 26 hours.

## Audit notes (Oct 2026): streaming, answer shape, disagreement view

- **Streaming.** The first panel model whose words pass the quality gate (at least 90 characters, ends on a word boundary) streams to the screen as an early draft, labelled as such. The checked answer replaces it. Only providers that speak SSE stream (OpenRouter, OpenAI, NVIDIA); `direct.ts` does not.
- **Answer shape.** `FORMAT_STYLE` (providers/shared.ts) and `SYNTH_SYSTEM_PROMPT` ask for numbered lists when the user asks for N things, fenced code blocks with the fix shown, and length that follows the question. The synthesizer is told there are no outside sources, so it cannot write "sources differ".
- **Slow synthesis.** Free: if the written synthesis takes longer than 12 s (other plans 20 s), the answer of the model that took the leading position is shown, with a note that it is not a combined answer.
- **Disagreement view.** When the comparison found a split, `SplitView` (KeplarTurn.tsx) shows "N of M models agree", each position with its models, what each said, what Keplar did, and who reviewed the draft, under the answer. Counts come from the real comparison.
- **Baselines.** Side-by-side runs used OpenRouter API models (claude-haiku-4.5, gpt-4.1-mini) with a plain system prompt. They are not the ChatGPT or Claude apps. Scripts and raw results: /workspace/evals (not in the repo).

## Free-plan speed and roles (Oct 2026 audit, measured)

- **Kept reply.** On Free, when exactly one position was found, at least two models answered, nothing is error-prone and every non-web check held, the leading model's reply (the one already on screen) is the answer. There is no separate write-up call. `ModelSynthesizer.synthesize` takes `preferredModelId`; the result carries `keptReply`. Any split, failed check or single model still gets a write-up.
- **Roles.** `FREE_ROLES` (live-catalog.ts): extractor and writer are `free:nemotron-3-super` with thinking off (`GenerationParams.reasoningOff` sends `reasoning: {enabled:false}`). Measured on OpenRouter (3 calls each): Super with thinking off wrote the position JSON in 2.4-4.2 s (3 of 3 valid) and the answer in 1.5-1.9 s; Nemotron 3 Ultra needed 14-18 s to write and 29-49 s to extract; Dots3-Note returned an empty reply (3 of 3). Super with default thinking spent the token budget thinking (1-2 of 3 valid JSON, 7-9 s).
- **Hedged extraction.** `hedged(first, second, afterMs)` (extractor.ts): the extractor is capped at 10 s on Free; if Super is silent for 4 s, Nemotron 3.5 Lightning is started in parallel and the first valid result wins, the other is aborted. Lightning alone took 5+ s on the real prompt, so it is the stand-in, not the first choice.
- **Reviewer cap.** On Free the reviewer gets at most 14 s, and 4 s more after the extraction finishes, then it is aborted (the answer says it was not cross-checked).
- **Stand-in rule.** Once two models have answered, a stand-in for a slow third no longer extends the panel wait (`hedgeTuning.windowMs` applies only while fewer than two have answered); the 4 s straggler grace decides.
- **Measured (single runs, local server, real free models, noisy):** total time for 4 prompts before 34.0/31.9/35.3/36.6 s, with the caps and hedge 26.0/10.0/28.3/26.1 s, with Super roles 14-24 s; bakery prompt timeline 25.2 -> 11.7 s, Python prompt 16.6 -> 13.3 s. Rate limits on free models still produce unscored answers at times.
- **Answer-shape hints.** `shapeHint` (answer-shape.ts) adds a short structure hint to the panel prompt for compare/decision, how-to/ideas, explain and write requests.
- **Attached documents.** Signed-in users can attach up to 3 text files or text PDFs (`POST /api/keplar/extract`, no OCR); their text goes into the prompt as material, not instructions, and is not stored. See `src/lib/documents/chat-docs.ts`.
