# Coordination with other workstreams

Several executors work in the same repository. Rule used here: commit only my own files with explicit paths; for the few shared files, stage only my hunk against HEAD; build and test in a `/tmp` copy of HEAD; deploy from a worktree of HEAD (which includes everyone's committed work).

## What is mine (committed)
`src/lib/growth/*`, `src/app/api/{growth/event,feedback,share}`, `/feedback`, `/r/[token]` (+ not-found), `/admin/growth`, `/for-developers`, KeplarTurn consensus badge wording, onboarding model starters, tests `tests/growth-*.test.ts`, tiny additions to `tests/authz.test.ts` and `src/lib/privacy/account-data.ts`, and everything under `docs/growth/`.

## SEO executor (`sand-subagent-cee11955-...`, docs/seo)
- Their `seo_events` funnel is read by `/admin/growth`; I did not change their schema.
- **Show HN / Product Hunt / DEV drafts exist in both plans.** Post **one** Show HN for Keplar, not two. Recommended angle: the decision-demo with the honest failures (HN rewards "try it" and candor); the SI explainer can be a separate DEV post. The founders decide.
- Their drafts say "the agreement figure"/"Consensus figure"; the product no longer shows a percentage. Please update the wording to "N of M models agree".
- `/for-developers` was added to the sitemap by them (verified live); thank you.
- Guides: see [SEARCH.md](SEARCH.md) section 3 for how to add the decision guides without both of us editing `guides.ts` at once.

## Design / site builder / backend-accounts
Files with uncommitted edits by others when this was written (not touched): `KeplarApp.tsx`, `store.ts`, `stream.ts`, `types.ts`, `api/keplar/route.ts`, account page and menus, `signin/signup`, `package.json`, `docs/revamp/CHECKPOINTS.md`.
Requests (each small):
1. **Account page:** add an optional "Tell us why" link to `/feedback?kind=cancel` next to cancel. Never required or blocking.
2. **Free-limit message:** name Lite ($20) as the next plan (currently "Upgrade to Plus").
3. **Home / pricing copy:** use the chosen positioning ([POSITIONING.md](POSITIONING.md)); show the developer example prompts; link `/for-developers` in the footer.
4. **Privacy page:** mention feedback messages, consented product events (180 days, no prompt text) and shared answer links (revocable, 90-day expiry, noindex). Terms page: acceptable use for shared links. Done Oct 3, 2026 (Privacy: feedback and shared links; Terms: shared answer links).
5. **First-run:** a one-line "what happens next" under the composer for new users and a retry button after `no_response`.
6. **Admin:** a tool to remove a shared link on a user's behalf (reports arrive through `/feedback`).

## Deploy note
Deploys are made from a worktree of HEAD, so they include everyone's committed work and exclude uncommitted work. After "Aliased" appeared, requests were still served by the previous deployment for about a minute (observed: `/about` 404 and a 27-URL sitemap, then correct: 200 and 34 URLs). Wait a minute and re-verify before concluding a deploy failed. If another executor deploys an older tree, the last deploy wins; keep HEAD the single source.
