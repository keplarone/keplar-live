# Audit progress (answers, speed, mobile, documents)

Notes kept after each step. Measurements are single runs, labelled; baselines are OpenRouter API models (claude-haiku-4.5, gpt-4.1-mini, plain system prompt), not the ChatGPT or Claude apps. Raw results live in /workspace/evals (outside the repo).

## Done and deployed
- Free multi-model speed (aac83d5, 2eda16b): kept leader reply when models agree; Super extracts with thinking off, Lightning stands in after 4 s; 10 s extraction cap; reviewer cap; stand-in no longer extends the wait when two answers are in. Local timeline, bakery prompt 25.2 -> 11.7 s, Python prompt 16.6 -> 13.3 s.
- Docs: orchestration.md section "Free-plan speed and roles" (922c141).
- Mobile: Copy button on code blocks 36 px on touch (65cb72c); composer tool row fades at the right edge on phones (eb6e627). At 320 px the tool row is a horizontal scroller (7 tools, ~3 visible), not a page overflow (scrollWidth = clientWidth = 320).
- WebGL crash fix (837c96e): when the browser could not create a WebGL context, asking a question showed "Something went wrong" (ActivationScene threw in an effect). Scenes now skip themselves (`tryCreateStage`).

## Deployed at merged HEAD (verify 1408/1408, Oct 4 ~4:50 am ET)
- fd32d77 Answer shape: how-to questions classed "factual" and "how should I decide" now get a structure hint; synthesis may not say "the material"; an appended "OK" verdict from the edit pass is stripped.

## Tested (local server, real free models unless noted)
- Attached document: signed-in, .txt with a unique code; answer contained the code and the open time (3 models, 9.4 s). Anonymous: "Sign in to attach documents. Images and video work without an account."
- Delete all chats (Account): typed DELETE, API list empty afterwards, Recents empty. Account deletion has a grace period (security executor).
- Starter cards (5): Ask focuses the composer; Research and Hand off set a mode; Create and Projects open those views; no page errors at 390 and 1280 px.

## Open
- Answer thickness vs baselines (after3, local): research 115 -> 197 words with a list (Haiku 248, gpt-4.1-mini 600); everyday still one paragraph before the factual how-to fix (98 words vs 188/192); advice answer leaked "the material" and a stray "OK" (both fixed in fd32d77, not yet re-run live).
- The OpenRouter account's free-model daily quota (1000/day) was used up by local testing today (resets 00:00 UTC); live re-runs wait for the reset.
- Prod anonymous cap and the OpenRouter free-model quota are both exhausted until 00:00 UTC (8 pm ET Oct 4); nothing live can be run before that.
- Prod re-measure after 8 pm ET with probe.py paced 16-18 s.
