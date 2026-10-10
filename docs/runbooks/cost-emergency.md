# Cost emergency (spend spike, retry storm, loop)

Signals: owner alert "Spend spike: media and Free auto-paused" or "Daily spend cap reached"; `/admin` Spend today near the cap; requests/min chart climbing; one account at the top of "Top spenders".

1. **Stop the bleeding (1 min).** `/admin` -> *Global AI stop* with a reason. This blocks every model call, media job and agent step on all instances within ~5 seconds. If `/admin` is unreachable: set `KEPLAR_GLOBAL_STOP=1` in Vercel env and redeploy (or promote the last good deployment after setting it).
2. **Narrow it.** If one provider/model is the cost: resume globally, then *Disabled providers or vendors* / *Disabled model ids* (e.g. `openrouter`, `anthropic`, a model id). Media only: *Pause image + video*. Agents: *Pause agents*.
3. **Find the source.** `/admin`: spend by feature (site.build, answer, image...), by model, top spenders (masked). Per-user: the Usage cooldown already pauses a paid user who burns > $2/h (Plus) / $4/h (Pro).
4. **Contain an account.** Abuse by one user: ask them to stop via email; for a hard stop revoke sessions (Account -> sign out everywhere is user-side; operator: Neon `keplar_sessions` set `revoked_at`). Do not delete data.
5. **Fix and resume.** Clear *Spike auto-pause* if it is still on, turn the global stop off (audit log records who and why).
6. **After.** Lower `KEPLAR_GLOBAL_DAILY_USD_CAP` / `KEPLAR_SPIKE_USD` if limits were too loose. Note it in `docs/revamp/CHECKPOINTS.md`.

Built-in automatic protections (no action needed): per-request cost caps, 5-hour + weekly windows, per-user hourly cooldown, daily global cap with the breaker (70% lighter models, 85% media off, 100% Free off), spike detector (media + Free pause 15 min), live daily budget guard on every provider call.
Env knobs: `KEPLAR_GLOBAL_DAILY_USD_CAP`, `KEPLAR_FREE_DAILY_USD_CAP`, `KEPLAR_SPIKE_USD`, `KEPLAR_SPIKE_WINDOW_MIN`, `KEPLAR_SPIKE_PAUSE_MIN`, `KEPLAR_COOLDOWN_*`.

**Hourly provider/model limits** (a model or provider over its hourly spend or call count is refused as rate-limited and the router falls back to another model; counters are per hour, UTC, fail open if the store is down): `KEPLAR_PROVIDER_HOURLY_USD` (default 15), `KEPLAR_MODEL_HOURLY_USD` (8), `KEPLAR_MODEL_HOURLY_CALLS` (3000), and `KEPLAR_HOURLY_LIMITS` JSON overrides per model id, e.g. `{"<model-id>":{"usd":2,"calls":200}}`. `/admin` shows "This hour vs hourly limits". Limits are per serverless instance read from env, counters shared through the store.
