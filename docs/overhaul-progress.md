# Keplar One overhaul: progress

Owner of this file: the overhaul (lead developer) workstream. Started 2026-10-06. Creator credit: Hassen and Hussain Keder (two co-founders, two different people).
Rules followed: dark stays the default (marketing and app), no certification claims, no invented proof, honest feature status.

## Status by stage

| Stage | Implemented | Tested | Deployed | Pending |
|---|---|---|---|---|
| 1 Performance | Three.js deferred until after first paint (`src/lib/perf/after-paint.ts`, `MonolithHome` and `PageMonolith`; landed in d86cec4 / 0c4530c with the scene workstream). Landing chapters are server-rendered; the only new client code on `/` is the live demo form (no Three.js, no extra fonts). Showcase index uses CSS posters, not iframes. `scripts/perf-measure.mjs` (Playwright, Pixel 7, 4x CPU) added. | perf script runs; before/after numbers NOT captured yet (baseline run was interrupted) | yes (with the landing deploy) | Run `node scripts/perf-measure.mjs https://keplar.one --runs=3 --json=...` against the previous and the new deploy and record the numbers here. |
| 2 SEO | New public pages `/features`, `/showcase`, `/showcase/<slug>` (8), `/roadmap` use `pageMeta` (title, description, canonical, OG/Twitter), BreadcrumbList / CollectionPage JSON-LD, one h1 each, in `sitemap.ts` with real lastmod. Showcase demo HTML is `noindex`. | `tests/overhaul-landing.test.ts`, `tests/changelog.test.ts`, kb sitemap tests | yes | Site-wide heading/metadata audit script beyond these pages. |
| 3 Layout, clarity, color, de-vibe | Landing rebuilt as seven chapters (below). Hero pill and four feature chips removed; one bold CTA "Ask Keplar anything" in the composer; plain proof line. Editorial, asymmetric 4/8 grid, hairline rules, one row per feature. | lint, unit tests | yes | Remaining tells elsewhere on the site (see tell list). |
| 4 Create | Voice Live Create (editor + terminal + preview at once), Surprise me, branch-from-version, community likes, Create showcase on the Create start page. | unit tests (voice revision, theater frames, surprise brief, showcase HTML) | yes | Real-mic test on devices (no microphone on the build box). |
| 5 Marketing | Live demo on `/` (no account), `/features`, `/roadmap`, nav and footer reorganised, changelog entry 2026-10-06. | unit tests | yes | Social proof beyond "built by" (needs real numbers or quotes from the founders). |
| 6 Differentiators | Disagreement map, debate mode already exist (other workstreams). Not started here: kind-to-ruthless dial, /lawyer /founder /skeptic roles. | n/a | n/a | See "User decisions". |

## Landing structure (chapters)

`src/app/(marketing)/page.tsx`: hero story (`MonolithHome`) then `Chapters` (data in `src/lib/features.ts`, the single source of truth for status):

1. Ask: live demo (`#demo`), proof line, multi-model, disagreement map, debate (beta), voice (beta)
2. Understand: images, video, documents/code/data (live); Office/audio and links (coming soon until the multimodal workstream ships them)
3. Create: Voice Live Create (beta) with a static three-pane drawing, showcase strip, Surprise me, version history, community gallery, anti-generic rules
4. Build together: real-time collaboration, AI critic (coming soon: in progress in another workstream)
5. Ship: publish, previews, rollback (live); custom domains, automatic HTTPS (beta)
6. Platform: public API, embed widget, Teams (beta), referral program (live)
7. Trust: security, changelog, roadmap
Then pricing and one closing CTA. Every feature row is one line and links to its real route; "Coming soon" rows are not links.

**Flip a status:** edit `src/lib/features.ts` only; the landing, `/features` and `/roadmap` follow.

### Chapter hook (for the space scene)
Sections carry `data-chapter="<id>"` with exactly the ids in `src/field/monolith/CHAPTERS.md` (ask, understand, create, together, ship, platform, trust). The scene's own `watchChapters` reads them (centre-line crossing, scroll progress). `ChapterSync` only mirrors the active id to `<html data-chapter>`, `window.__keplarChapter` and a `keplar:chapter-view` event; it never dispatches `keplar:chapter`, which would override the scene's scroll progress.

## Live demo
`src/components/landing/LiveDemo.tsx` streams the normal `/api/keplar` pipeline as an anonymous Free visitor: free models only and the server's own anonymous limits (the real guard). On top, a client allowance of 5 a day, 3 a minute, 400 characters (`src/lib/demo-limits.ts`). Shows stages, models answering, the disagreement line, the streamed answer and the agreement summary; then "See the full answer card" (`/app/ask#q=…`) and sign up.

## Create
- Voice Live Create: `src/lib/create/voice-live.ts`, `VoiceLiveTheater.tsx`. Web Speech API (Keplar never records audio), debounced 700 ms, a pause (2.8 s) holds the last frame, "actually / instead / scratch that / make it…" replaces the abandoned brief. Editor (typed, highlighted), terminal and sandboxed preview are visible together (split panes; stacked under 900 px). Preview labelled "not the final build"; "Build this" runs the real build.
- Surprise me: `src/lib/create/surprise-brief.ts` (12 specific industries x 8 styles x 3 depths).
- Version history: Restore (existing) plus Branch from any version (`POST /api/sites/:id/branch`, rate limited, `branchFromVersion`).
- Community gallery: likes (`/api/templates/:slug/like`, signed in, same origin, rate limited, one per workspace); "Community gallery" naming; link to the showcase.
- Showcase: `src/lib/create/showcase/*`, `/showcase`, `/showcase/<slug>`, preview HTML at `/sites/showcase/<slug>` (static, no scripts, site CSP). Every page and every demo says: "Showcase demos made by the Keplar team to show what Create aims for. Not customer sites." `showcase` is a reserved site slug.

## Design rationale and tell list
Dark graphite stays the default. Trust comes from structure: a strict 12-column grid used asymmetrically (4/8), hairline rules instead of boxes, one row per item instead of card grids, numbered kickers, mono only for numbers, color used as signal (green = live, amber = beta, warm accent = creation, disagreement hue for the disagreement line).
Tells removed in this pass: centered hero badge pill, four icon chips under the hero, "Ask anything..." placeholder, competing CTAs on the landing (FinalCta secondary button, multiple section CTAs), look-alike card sections (Everyday, Paths, Creation artifacts). Showcase demos are checked by test for no gradients, no backdrop blur, no violet AI-glow hues and no scripts.
Still to review: `/product`, `/how-it-works`, `/for-*` pages keep older section components; the scramble headline in the hero remains (owned with the scene).

## Trust items that need the founders
- Registered legal entity name (`site.legalEntity` is null; footer shows it only when set).
- A real security contact mailbox if not team@keplar.one (security.txt and /security use team@keplar.one).
- A DPA template if business customers ask for one.
- Any real usage numbers or quotes for social proof (none are shown until supplied).

## User decisions
- Kind-to-ruthless dial: default proposed medium-hard behind a flag (not built yet).
- Stacked roles (/lawyer + /founder…): billing per role or flat.
- Lawyer role disclaimer text needs approval before the role ships.

## Pending
- Perf before/after numbers (stage 1).
- Real-time collaboration and AI critic status flips when that workstream deploys.
- Multimodal links/Office/audio flip when that workstream deploys.
