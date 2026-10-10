# Feature surfaces mega scan — 2026-10-06 (EDT)

After Marketing deploy (`dpl_DpNk6MqKKZF6ADLXu1hkdA2YCngm`).

## Method
- Debate (`DebateView` + orchestration), Study (`/app/study` + `/api/study`), Slides (`/app/slides` + `/api/slides`), Deep Research (orchestration + Research UI), docs/blogs (marketing + site-features-blog), admin (`requireAdmin` → 404), `/api/health`.
- Tests: debate + study + slides + deep-research + health (42/42), site-features-blog (9), blog-post-mobile + chat-docs (5).

## Findings

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| F1 | — | Slides gated server-side (`slidesWorkspace` → 401/403 plan_required); Study any signed-in | **ok** |
| F2 | — | Debate transcript fenced as data; Research drops `javascript:` / credential URLs | **ok** |
| F3 | — | Study Free: free models only, never charged; prompt-injection fences; SRS/mastery contracts | **ok** |
| F4 | — | Admin APIs use `requireAdmin` (non-admin → 404); health leaks no connection strings | **ok** |
| F5 | — | Blogs isolated per site; members-only posts not on public URL | **ok** |
| F6 | P2 | Debate / Study / Slides / Admin CSS boxed focus outlines | **fixed** |
| F7 | — | No P0/P1 found | — |

## Counts
- Found: 0 P0, 0 P1, 1 P2 fixed
- Open: none blocking

## Deploy
- Commit `74f392f'; production `dpl_E682H4gMqsneAXqiYfrHEnh5oaKm` → https://keplar-jf5faamav-team-6667.vercel.app aliased to https://keplar.one.

## Next
Queue complete for Auth → Marketing → feature surfaces unless a follow-up pass finds new P0/P1.
