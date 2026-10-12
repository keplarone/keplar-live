# Roblox Cloud (overnight Roblox jobs)

Hand Keplar a Roblox game to work on while you are away. It works on the game's scripts on Keplar's servers, checks every
edit with Luau's own analyzer, and leaves reviewable changes that you apply in Studio when you are back.

## What it is, honestly

- **Scripts only.** Roblox Studio does not run on Keplar's servers (it is a Windows/macOS desktop app), so a job works on a
  snapshot of the game's Script, LocalScript and ModuleScript sources plus a summary of the instance tree. It can read,
  search, edit, create and propose deleting scripts. It cannot play-test, take screenshots, insert assets or change parts,
  models, UI objects or properties; the report lists anything that needs Studio.
- **Checked, not play-tested.** Every edit is checked with the official Luau analyzer (release 0.742, WebAssembly, in
  `vendor/luau`): syntax, unknown globals and type errors in the script's own mode. Roblox API types are not checked (Roblox's
  globals are declared as `any`), and scripts over 28 KB are not checked in the cloud. A job never claims a play test.
- **Nothing reaches the game until you apply it.** In the morning you review a diff per script and pick what to apply. Each
  change is one Undo step in Studio, and a script you edited since the snapshot is skipped, never overwritten. Deletions are
  only applied when you tick them.
- **Claude Opus 5.5 only**, through OpenRouter, with the same lock as Studio mode (`KEPLAR_ROBLOX_MODEL_ID`, no substitution).

## How a job runs

1. **Snapshot** (Studio page, desktop app): fixed read-only Luau (`src/lib/roblox-cloud/studio-luau.ts`) reads every script
   in batches through the desktop bridge. The page uploads them (`POST /api/roblox-cloud/jobs`, `/jobs/:id/scripts`).
2. **Start** (`POST /jobs/:id/start`): the baseline check runs on every script, the opening message is written, the job is
   queued and its first slice starts.
3. **Slices** (`src/lib/roblox-cloud/worker.ts`): a slice takes the job's lease, runs Opus 5.5 turns against the snapshot
   tools (`tools.ts`) for up to 200 seconds, and saves a checkpoint after every turn (conversation, edited scripts, plan, log,
   usage). Then it hands over: it calls `POST /api/roblox-cloud/worker` with `Authorization: Bearer $CRON_SECRET`, which
   answers 202 and runs the next slice in the background of a fresh invocation.
4. **Recovery**: a slice that dies leaves a lease that expires after 6 minutes. The job is restarted by the next status poll
   (`GET /jobs/:id`) or by the daily cron (`/api/cron/roblox-cloud`). On the Vercel Hobby plan crons run once a day, so a job
   whose slice died while nobody was watching can wait until that run.
5. **Stops on its own** when the goal is done (the model calls `finish`), at the person's credit budget or time limit, at 160
   turns, after 3 failed model calls in a row, after 12 turns with no edit or plan progress, when the account runs out of
   credits, or when Opus 5.5 can't be used (never another model). Pause, resume and stop take effect at the next turn.
6. **Report**: the model's summary, done, unresolved and play-test lists, plus a file list and before/after problem counts
   computed from the snapshot (not from the model).

## Cost

Every turn is charged at its real OpenRouter cost with the normal margin (`chargeUnits`), counted against the job's budget
(300 to 20,000 credits) and attributed to the owner in the cost meter (feature `agents`). The system prompt is cached and the
conversation carries a cache breakpoint, so most input is read from the cache; long conversations are compacted (old tool
results shortened, old reasoning dropped). Tools return line ranges and capped results instead of whole files.

## Data

`roblox_cloud_jobs` and `roblox_cloud_files` (per workspace): goal, plan, log, report, the conversation checkpoint and the
script snapshot with edits. Kept 30 days, at most 8 jobs per account, exported and deleted with the account.

## Needs

- `CRON_SECRET` (set in production) for hand-overs between slices. Without it a job only advances on status polls.
- `OPENROUTER_API_KEY` (set) and optionally `KEPLAR_ROBLOX_MODEL_ID` (defaults to `anthropic/claude-opus-5.5`).
- Optional, more durable: Inngest keys (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) are not used by Roblox Cloud yet; the
  self-chaining worker does not depend on them.
