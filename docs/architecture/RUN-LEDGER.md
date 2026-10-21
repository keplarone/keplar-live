# Run ledger and the Tasks view

The Run ledger is one place that shows everything Keplar is doing or has done for a person. It covers deep answers that keep working, agent runs, and actions in connected apps. The person sees it at `/app/tasks` (**Tasks** in the sidebar and in search).

## What it is

It is a read-only projection. It adds no store or table, and it does not run, approve or send anything. Each executor keeps writing its own records, and the ledger maps them onto one shape (`RunView` in `src/lib/runs/types.ts`):

| Source | Records read | Ledger id |
| --- | --- | --- |
| Keplar Core "Keep working" | `core_jobs` (`src/lib/core/jobs.ts`), expired jobs skipped | `core.<job id>` |
| Business agent runs | `biz_agent_runs`, their `biz_approvals`, and `mcp_receipts` for connected-app calls | `agent.<run id>` |
| Connected-app calls Ask proposed in a chat | `biz_approvals` with `agentId: "chat"`, grouped by turn, plus `mcp_receipts` | `tools.<turn id>` |

Roblox and Blender cloud jobs are left out on purpose: draft PR #43 removes Keplar Studio.

## Outcome kinds

Every outcome line says what kind of claim it is (`OutcomeKind`):

| Kind | Shown as | Means |
| --- | --- | --- |
| `done` | Done | An action was carried out, and a record says so: an approval with status `sent`, plus an `ok` receipt for connected-app calls. A receipt that reports an error turns the line into `open`. |
| `proposed` | Waiting for you | Drafted and waiting for approval. Nothing was sent. |
| `verified` | Checked by running it | A Core check of kind `execution`, `syntax` or `grounding` that passed or was fixed. |
| `reviewed` | Reviewed by another model | A `critique` or `cross-model` check. This is an opinion, not proof. |
| `generated` | Written by a model | Model output (a Core answer). Any checks on it are listed as their own lines. |
| `open` | Not done | Failed, refused, inconclusive, a missing connector, or stopped at a limit. |

A run's status comes from the records too. For example, an agent run that once waited for approval counts as done once none of its approvals are pending.

## Endpoints

- `GET /api/runs`: the signed-in person's runs, newest first, at most 60. Signed out gets 401.
- `GET /api/runs/:id`: one run, including a finished Core answer's text. Returns 404 when the run is not the caller's.

Core jobs and chat tool calls are read from the person's own workspace. Agent runs are read from the Business workspace the person acts in, using the same rule as `/api/business/*` (`businessWorkspace`). Accounts without Business see no agent runs.

The view has two actions, and both belong to the executors: **Review in Approvals** (the Approvals tab) and **Keep working** (`POST /api/core/jobs/:id`, which keeps its own spend checks).

Tests: `tests/runs-ledger.test.ts`.

## What comes next

A native "goal" run, where Keplar plans and then takes steps with tools, writes its own records and shows up here as a fourth source. Under `ENGINE-ROADMAP.md` it waits for `authorize()`: a planner that acts without that gate would be an open tool loop.
