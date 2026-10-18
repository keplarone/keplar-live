# Search Intent Domination Engine — Progress

**Updated:** 2026-10-18
**Repo:** keplar-live (`/workspace`)
**Author of commits:** `Keplar <team@keplar.one>`
**Owner approved merge and auto-deploy on 2026-10-17.** Do not run `vercel` or `vercel --prod`. Merging to `main` is the deploy. #22 `8be1ce5`. #23 `953630b`. #24 `e2ebe63`.

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
- [x] Phase 4 free tools at `/tools` (10 tools). Citation formatter and the comparison explorer do not call a model. The other eight call one OpenRouter `:free` slug, 8 runs an hour per IP, discard a reply if the host reports a cost, and return 503 when no key is set. Branch `cursor/seo-free-tools-4cb9`.
- [x] Phase 5 AI-search: product facts, FAQ, and glossary match the product (H1, H3, H4). `/llms.txt` lists `/tools` and each tool. No schema was added for content the page does not show.
- [x] Phase 9 SEO unit checks run via existing `npm test` (`tests/*.test.ts`), which is the CI gate. Live crawl, Lighthouse, and axe stay manual because they need a running server.
- [x] Phase 10 Search Console client (`src/lib/seo/search-console.ts`) returns a reason and no rows when `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, or `GSC_SITE_URL` is missing, or when the token or query call fails. `/admin/seo` renders that reason or the API rows. It does not invent metrics.
- [x] Phase 6 report gate (`src/lib/seo/reports.ts`) requires methodology, data, limitations, and how to reproduce, each at least 80 characters, plus a repo source path. `CORE_EVAL_NOTE` is unpublished and does not repeat scores. `publishedReports()` is empty. `/reports` is not in the sitemap.
- [x] Phase 7 public sharing stays private by default. `PATCH /api/share` still requires `consent: true` and a verified email. `publishShare` stores `consentAt`. A row with `publicAt` and no `consentAt` is not opened, listed, or sitemapped. Unpublish and takedown clear `consentAt`.
- [x] Phase 8 tool pages already link to the matching product with `TrackedLink` and reuse the existing marketing styles. No new visual language and no site-wide restyle.
- [x] Phase 11 stack: #22 `8be1ce5`, #23 `953630b`, #24 `e2ebe63`, #25 `240521c` are on main. Production stamp `240521c7c8dc` served `/sitemap-index.xml`, `/tools`, `/tools/citation-formatter`, `/llms.txt`, `/robots.txt`, and `/` with status 200.
- [x] Programmatic pages: `/guides/citation-styles` and `/guides/free-tool-limits` are built from `formatCitation`, `TOOLS`, and `TOOL_LIMITS`. Both pass `decidePublish` and are in the sitemap.
- [x] Marketing fixes (2026-10-18): pricing meta names Lite $20 (English, OG card, all 25 locales). Auth, `/app`, the Business app, the embed shell, `/status`, `/welcome`, the 404, and an empty `/answers` or `/topics` index are noindex, follow. The Whop pixel loads only on `/checkout`, `/account`, and `/biz/account`. `robots.txt` lists `/sitemap-index.xml` only.
- [x] Owner decision (2026-10-18): `keplar.one/space-studio` is noindex, follow and out of the sitemap. It is not redirected or removed. `space.keplar.one` stays indexable, canonical to itself. The page body is unchanged.

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
- Audit milestone, full `npm test`: 3034 tests, 3032 pass, 0 fail, 2 skipped. CI then failed once in `tests/presence.test.ts` because an empty flush purged rows against the wall clock. That flush now skips the purge unless it has a logical clock. Merged as `8be1ce5`.
- Cluster milestone, full `npm test`: 3038 tests, 3036 pass, 0 fail, 2 skipped.
- Free-tool milestone, full `npm test`: 3041 tests, 3039 pass, 0 fail, 2 skipped. `npx tsc --noEmit` pass.
- Measurement milestone: `npx eslint` on the touched files and `npx tsc --noEmit` — pass. Full `npm test`: 3045 tests, 3043 pass, 0 fail, 2 skipped.

## This milestone (measurement, reports, consent)

Verified on 2026-10-17, branch `cursor/seo-measure-reports-4cb9` (stacked on `cursor/seo-free-tools-4cb9`):

- `/admin/seo` calls `fetchSearchAnalytics`. Missing credentials, a refused token, a failed query, or a thrown request produce a sentence and no numbers. A successful response shows the API's query rows for the last 28 days.
- The 6 October 2026 Core eval stays an unpublished note. Its writeup says one answer key was wrong and multi-step was not a Thorough measurement, so the note does not quote scores and is not indexable.
- Public answer pages require a stored `consentAt`. Pages that were public before this field existed drop out of `/answers` and `/answers-sitemap.xml` until the owner publishes them again (the dialog still requires consent).
- `/llms.txt` lists the free tools from `TOOLS`.

Not in this milestone: no public `/reports` page, no fabricated research, no Bing API client, no live crawl in CI, no deploy.

## Blockers for the owner

- Search Console: a service account on the `keplar.one` property, plus `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`, and `GSC_SITE_URL`. Until those exist the admin page must say the integration is not configured.
- Bing verification token (`BING_SITE_VERIFICATION` or `NEXT_PUBLIC_BING_SITE_VERIFICATION`) if the meta tag should render. Same for Google (`GOOGLE_SITE_VERIFICATION`).
- Owner review before `/vs/perplexity` can be indexed (`approved: true` in `src/lib/kb/vs.ts`).
- OpenRouter key on the server for any free tool that calls a model. Tools must keep working as "unavailable" when the key is absent.
- Do not publish a research report until a real run file is chosen and `assessReport` passes with `published: true`. `docs/core-eval-results.json` is not a benchmark: the writeup says item s2 had a wrong answer key and the multi-step items were not a Thorough measurement. Leave `CORE_EVAL_NOTE.published` false.
- Any public answer created before `consentAt` existed needs the owner to publish it again if it should stay in the sitemap.

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

## Files touched in the measurement milestone

- `docs/seo-engine/PROGRESS.md`
- `src/lib/seo/search-console.ts`
- `src/lib/seo/reports.ts`
- `src/app/admin/seo/page.tsx`
- `src/app/llms.txt/route.ts`
- `src/lib/growth/share.ts`
- `src/lib/growth/share-public.ts`
- `tests/seo-measure.test.ts`
- `tests/share-public.test.ts`
- `tests/seo-indexable.test.ts`

## Marketing fixes (2026-10-18)

Checked against current source on `main` (`f921e6f`). `FIXES.md` and the marketing `AUDIT.md` were not in the workspace, the repo, or GitHub, so paste-ready titles, descriptions, JSON-LD, redirects, sitemap removals, and performance steps from that sheet were not applied.

Applied:

- `/pricing` title, description, and the pricing share card name Lite at $20, next to Plus $45 and Pro $99. The same price is in `meta.pricing` for all 25 locales, which is what localized `og:title` and `og:description` copy. `softwareApp()` already offers Lite from `tiers.ts` (price 20). No `aggregateRating`.
- noindex, follow on auth (`/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/two-factor`, `/secure-account`, `/signin/verify`, `/desktop/connect`, and localized sign-in and sign-up), `/app` (layout and tabs), the Business app, the embed shell, `/welcome`, `/status`, the 404, and `/answers` or `/topics` when the list is empty.
- Whop pixel scripts load only on `/checkout`, `/account`, and `/biz/account` (the Business account page that embeds checkout). `forms:false` stays. The checkout Elements script was already limited to checkout and account setup.
- `robots.txt` sitemap field is `/sitemap-index.xml` only. The index still lists the four urlset files.

Skipped:

- Space Studio, in the first pass: not redirected, not noindexed, not removed. The owner later chose noindex, follow for `keplar.one/space-studio` only. `space.keplar.one` stays without that robots meta. The existing noindex on `/space-studio/app` was already there and was left as-is.
- Paste-ready English titles, descriptions, and JSON-LD for the other pages: the sheet was not attached.
- Redirects and extra sitemap removals from that sheet: not visible, so no URLs were redirected or dropped.
- Performance steps from that sheet: not visible. The home-page scene was not edited.
- Account and checkout stay indexable. They were not in the noindex list.
