# Search Intent Domination Engine — Progress

**Updated:** 2026-10-17
**Repo:** keplar-live (`/workspace`)
**Author of commits:** `Keplar <team@keplar.one>`
**Do not deploy.** Do not run `vercel --prod`. Do not merge these PRs from the agent.

## How to resume

1. `git fetch origin main` and confirm the branch you are on. Milestone branches are `cursor/<name>-4cb9`. Later milestones stack on the previous branch because the PRs are not merged.
2. Read `docs/seo-engine/AUDIT.md` (verified findings) and this file. Do not redo the audit.
3. `npm ci --no-audit --no-fund` if `node_modules` is missing.
4. Finish the first unchecked phase below. After it: `node --import tsx --test tests/seo-engine.test.ts` plus the other SEO tests you touched, then `npx tsc --noEmit` and `npx eslint` on the files you changed.
5. Commit as `Keplar <team@keplar.one>`, push with `git push -u origin <branch>`, open or update the PR with `ManagePullRequest`. Update this file in the same commit as the work, or in a follow-up commit on that branch before the next phase.
6. Do not edit the landing-page background (`src/field`, star scene, clouds) or the Create safety filter. Do not touch payment code. Do not put founders' ages or birthdates anywhere. Do not name a model provider as Keplar's own model. "Solar 5.8" is branding only.

## Checklist

- [x] Phase 1 audit verified against this repo (checkpoint findings re-checked). Written to `docs/seo-engine/AUDIT.md`.
- [x] Phase 1 milestone: audit + H1–H4, M1, M4. Branch `cursor/seo-audit-critical-4cb9`.
- [x] Phase 2–3 cluster registry (`src/lib/seo/clusters.ts`), quality gate and publish decision (`src/lib/seo/quality.ts`, `src/lib/seo/programmatic.ts`). No new public URLs. `/compare` and `/vs` cross-link inside the comparisons cluster. Branch `cursor/seo-clusters-quality-4cb9` (stacked on the audit branch).
- [ ] Phase 4 free tools. Deterministic tools need no model. Model tools use only OpenRouter `:free` slugs and a rate limit. Missing key returns unavailable, never a fake answer.
- [ ] Phase 5 AI-search: facts test stays green (done with H1, H3, H4). No extra schema that the page does not show.
- [ ] Phase 9 SEO unit checks run via existing `npm test` / CI. Live crawl stays manual.
- [ ] Phase 10 Search Console client degrades when `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, or `GSC_SITE_URL` is missing. Admin shows that sentence, not sample metrics.
- [ ] Phase 6 report publisher requires Methodology, Data, Limitations, Reproduce. No fabricated results.
- [ ] Phase 7 public sharing stays private by default; indexing requires a stored consent flag.
- [ ] Phase 8 conversion copy on new hubs/tools only, reusing `LandingTemplate` / `kb.module.css`. No new visual language.
- [ ] Phase 11 left to the owner: merge, then production deploy per `CLAUDE.md`.

## This milestone (audit + critical fixes)

Verified on 2026-10-17:

- Glossary API line matches the beta public API. Growth-plan note updated.
- Consensus copy on product facts, FAQ, and `/how-it-works` matches the count readout.
- Web lookups fact uses feature `live-research`.
- `/vs/perplexity` (`approved: false`) is `noindex` and stays out of the sitemap.
- `/sitemap-index.xml` lists `/sitemap.xml`, `/answers-sitemap.xml`, `/templates-sitemap.xml`, `/topics-sitemap.xml`. `robots.ts` advertises the index and those four URLs.
- `shardNames` / `shardLocs` cap a file at 45,000 URLs. No second file is generated until a collection crosses the cap.
- `/for-developers` meta title renders at 47 characters; description is 154.
- `tests/seo-engine.test.ts` covers the above.

Not in this milestone, on purpose: no new landing pages, no Search Console calls, no tool routes, no change to topics auto-publish, no git-derived `lastmod`, no edit to the home-page scene.

## Test results

2026-10-17, after `npm ci`:

- `npx tsc --noEmit` — pass (exit 0).
- `npx eslint` on the files in this milestone — pass (exit 0).
- `node --import tsx --test` on the SEO files listed above — 66 pass, 0 fail.
- Audit milestone, full `npm test`: 3034 tests, 3032 pass, 0 fail, 2 skipped.
- Cluster milestone, full `npm test`: 3038 tests, 3036 pass, 0 fail, 2 skipped. `npx tsc --noEmit` pass.

## Blockers for the owner

- Search Console: a service account on the `keplar.one` property, plus `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, and `GSC_SITE_URL`. Until those exist the admin page must say the integration is not configured.
- Bing verification token (`BING_SITE_VERIFICATION` or `NEXT_PUBLIC_BING_SITE_VERIFICATION`) if the meta tag should render. Same for Google (`GOOGLE_SITE_VERIFICATION`).
- Owner review before `/vs/perplexity` can be indexed (`approved: true` in `src/lib/kb/vs.ts`).
- OpenRouter key on the server for any free tool that calls a model. Tools must keep working as "unavailable" when the key is absent.
- Do not publish a research report until a real run file is chosen. `docs/core-eval-results.json` may be used only if its fields are quoted with the file's own limitations.

## Files touched in the audit milestone

- `docs/seo-engine/AUDIT.md`
- `docs/seo-engine/PROGRESS.md`
- `src/lib/seo/sitemaps.ts`
- `src/app/sitemap-index.xml/route.ts`
- `src/app/robots.ts`
- `src/lib/kb/glossary.ts`
- `src/lib/kb/paths.ts`
- `src/lib/kb/vs.ts`
- `src/app/(marketing)/vs/[slug]/page.tsx`
- `src/lib/content/product-facts.ts`
- `src/lib/faq.ts`
- `src/app/(marketing)/how-it-works/page.tsx`
- `src/lib/content/lastmod.ts`
- `src/lib/growth/developers-page.ts`
- `docs/seo-growth-plan.md`
- `tests/seo-engine.test.ts`
- `tests/robots.test.ts`
- `tests/share-public.test.ts`
- `tests/templates.test.ts`
