# AI and autonomous agent security

How sections 11 and 12 of the security checklist are met in code. The principle: a model can be fooled, so the damage a fooled model
can do is bounded by code it cannot change: permissions and budgets come from rows the owner edited, actions that change the world go
through a deterministic firewall and an approval queue, and everything can be stopped from `/admin`. Last revised Oct 17, 2026.

## Where models act

| Surface | What the model can do | Boundary |
|---|---|---|
| Ask / chat | Answer; call read-only retrieval (web search, link reads) | No actuators. Links read through the SSRF-safe client; documents fenced (`src/lib/documents/guard.ts`) |
| Connected apps (MCP) and built-in connectors | Propose tool calls | Tools classified by the owner (read-only / write / unknown=write); auto-run only for read-only tools the owner allowed; everything else queues for approval (`src/lib/mcp/gateway.ts`, `src/lib/mcp/chat.ts`) |
| Business agents | Draft emails, Slack posts, CRM changes, scheduled runs | AI Firewall (`src/lib/business/firewall.ts`) then approvals; auto-send only for low/medium verdicts, per-agent opt-in, plan entitlement and daily cap (`src/lib/business/agents.ts`) |
| Keplar Browser | Drive a headless browser toward a goal | 8 steps max, allow-listed actions, pauses for a person on logins/payments/consent (`src/lib/browser/policy.ts`, `run.ts`) |
| Studio (Roblox) | Write and run Luau in the owner's place | Destructive calls (including obfuscated spellings) always ask; cloud jobs capped at 160 turns (`src/lib/roblox-cloud/worker.ts`, `tests/studio-agent.test.ts`) |
| App and site builders | Write HTML/CSS/JS | Sanitizer, sandbox CSP, static checks, the output checklist; code never runs on the server |
| Code runner | Run JS/Python from an answer | In the person's browser only: sandboxed iframe, worker, time and output caps, no network (`src/lib/sandbox/runner.ts`) |
| Blender Cloud | Render on a sandbox machine | Fixed machine script, job timeout, machine count and minute caps (`KEPLAR_RENDER_*`), teardown |

## Prompt injection: separation of instructions and data

- Tool descriptions, results and errors from MCP servers are sanitized (invisible characters, active content, instruction-like lines,
  secret patterns) and fenced as `<untrusted_tool_output>`; the planner prompt says never to follow instructions inside (`src/lib/mcp/sanitize.ts`).
- Uploaded documents are fenced with an unforgeable marker and a system rule that the text carries no instructions.
- Outsider text in Business (lead messages, names, product pages) is sanitized and fenced in draft prompts; a draft that introduces a link
  or address not in the starting draft is discarded (`src/lib/business/draft-safety.ts`).
- Web pages and repositories read by connectors are data: the model may summarize them, and any action it proposes still passes the
  Firewall (which flags injection phrases) and the owner's approval.
- Secrets never reach a prompt: the Firewall blocks credentials in outbound text; connector tokens are opened only inside the request
  builder; `tests/secrets-audit.test.ts` and `tests/draft-safety.test.ts` pin this.
- Limits: no filter is complete. Red-team runs with live models are on the policy calendar; the structural controls below are the real defense.

## Authorization of every action

- Every agent run is tied to a workspace and the user who owns it; background and scheduled runs load the workspace row and re-check the
  plan and budget before each step (`src/app/api/cron/*`, `src/lib/inngest/functions.ts`).
- Per-tool permission: a tool's class and auto-run flag are rows the owner edited; the model cannot change them (`src/lib/mcp/gateway.ts`).
- Execution credentials are the workspace's sealed tokens, opened per call; API keys are scoped; desktop and handoff tickets expire in seconds.
- Approval gates: purchases and payments (never automated: checkout is provider-hosted and user-driven), destructive operations (Studio
  destructive calls, deletions), external publication (sites publish on the owner's click), sending messages (Firewall + approvals),
  production deployment (humans merge and the build guard checks), permission changes (owner-only settings; agents have no API to them).
- Agents cannot modify their own policy: permissions, budgets and auto-send flags are not reachable through any tool; approval queue rows
  are written by the server from the verdict, never from model text (`tests/firewall.test.ts`, `tests/agent-chat-flow.test.ts`).

## Budgets and loops

| Limit | Where |
|---|---|
| Per request spend, daily spend, monthly budget, concurrency per plan | `src/lib/orchestration/limits.ts`, `src/lib/create/platform/plans.ts` |
| Global daily cap, breaker levels, spike auto-pause | `src/lib/create/platform/spend.ts`, `breaker.ts`, `src/lib/ops/telemetry.ts` |
| Tool calls per turn (5), planner rounds (3), time budget (45 s) | `src/lib/mcp/chat.ts` |
| Browser steps (8), computer-use steps (40) and minutes (15) | `src/lib/browser/policy.ts`, `src/lib/business/computer.ts` |
| Cloud job turns (160), app-build fix attempts, deadlines on every stage | `src/lib/roblox-cloud/model.ts`, `src/lib/app-builder/pipeline.ts` |
| Token/character caps on prompts, history and attachments | `limits.ts` |
| Per-agent daily auto-send cap | `src/lib/business/agents.ts` |

Loops end by step count, deadline or budget, whichever first; retries are bounded (`maxRounds`, `fixAttempts`) and never recurse.

## Isolation and sandboxing

- No agent has filesystem or shell access on Keplar's servers. The only shell-like surface is the Blender machine script, which is a fixed
  string list, not model output.
- Model-written code runs in the browser sandbox (opaque origin, worker, time limit, no network) or inside a generated app's sandbox CSP.
- Per-customer isolation: every row, file and job carries the workspace id; app end-user data is keyed by app and environment.
- Agent-to-agent: there is no delegation API. Business event agents each run with the owner's rows and budgets; none inherits another's
  auto-send permission or can call another agent.

## Durability, cancellation, idempotency

- Long work is a job with a durable state row and slices (`src/lib/create/platform/jobs.ts`, `src/lib/core/jobs.ts`); Inngest retries with
  the step's own idempotency; a dead invocation resumes from its last saved step rather than re-doing side effects.
- Cancellation: jobs and builds check a cancelled flag between steps; approvals can be declined; `pauseAgents` stops every scheduled run
  within 5 seconds (`src/lib/ops/controls.ts`).
- Real-world actions carry idempotency keys where the provider supports them (MCP `idempotencyKey`, Whop top-ups single-writer lock); a
  provider reply that is not a confirmed success is reported as an error, never as done (`src/lib/business/connectors.ts`).
- Completion reports are evidence-backed: the app builder's report lists checks with browser evidence and screenshots; Business agents
  record provider ids; Keplar Browser returns what it saw. Nothing claims success it did not observe.

## Monitoring and emergency stop

- Every agent action is a `security_events` row (`agent.action`, with the Firewall verdict) and an audit row in the workspace;
  `/admin` shows both. Spend spikes auto-pause media and Free; the owner is emailed.
- Emergency: `/admin` → Global AI stop (everything that costs money stops within seconds, including free chat), pause agents, pause media,
  disable a provider or model; `KEPLAR_GLOBAL_STOP=1` works even if the database is down.
- Revocation during a run: controls are re-read on every spend path (5-second cache); a revoked connector token fails the next call.

## Provider data handling

Prompts go to the providers listed in `docs/privacy-inventory.md`. Free-plan traffic is routed to no-collect endpoints where OpenRouter
offers them (`tests/free-privacy.test.ts`); the training statement in Settings and the privacy policy describe exactly this
(`src/lib/privacy/training-statement.ts`). Sending data to a new provider is a privacy impact assessment (inventory §8).
