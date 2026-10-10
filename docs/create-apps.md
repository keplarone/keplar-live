# Keplar Create: one-prompt app builder

Status and design notes for the overhaul of Create from a site generator into a one-prompt app builder.
Times are ET. "Deployed" = a Vercel production deploy aliased to keplar.one after the commit.

## 1. Audit of the Create pipeline before this work (Oct 6, 2026, commit 4c778b7)

**Where it lives.** UI `src/components/create/SiteBuilder.tsx` (+ `workspace/*`, Style/Sections/Features panes), API
`src/app/api/sites/**`, engine `src/lib/site-builder/**`, serving `src/app/s/[slug]/[[...path]]` (published, path based) and
`src/app/sites/draft/[siteId]/[version]/[[...path]]` (preview, HMAC token in `?t=`). The older disk-based
`src/lib/create/*` + `/api/create/*` project/deploy code needs a persistent disk and is off on Vercel.

**Pipeline.** Prompt -> deterministic discovery questions -> editable brief (`brief.ts`) -> one streaming OpenRouter call
(`generate.ts`, `<file path>` blocks) -> `normalizeFiles` (only `*.html` + `*.css` are kept) -> design-system CSS
prepended (`design.ts`, 8 curated directions, contrast-checked palettes) -> deterministic lint + one model repair pass
(`lint.ts`) -> sameness check against recent builds -> version saved in Neon (`keplar_rows`: `sb_sites`, `sb_versions`).
Optional browser QA (`qa/*`: real headless Chromium via @sparticuz/chromium, 3 viewports, nav clicks, 404, form, plus an
advisory vision critique) runs from the Screen Library tab.

**Models per plan** (`limits.ts`). Free: `qwen/qwen3.8-27b:free` -> `nvidia/nemotron-3-super-120b-a12b:free` ->
`google/gemma-4-31b-it:free` (the first one is no longer in OpenRouter's catalog on Oct 6, so every Free build paid a failed
first attempt). Lite/Plus: `google/gemini-3.8-flash` -> DeepSeek V4.1 Flash -> free. Pro/Business: `anthropic/claude-sonnet-5.5`
-> Gemini 3.8 Flash -> DeepSeek. Max output 14k (Free) .. 32k (Pro) tokens, one call, 215 s budget.

**Storage.** Everything in Neon: sites, versions (all files inline in JSONB), leads, feature records (`sb_records`),
images as `bytea` (`keplar_images`), public at `/i/<id>`. No Blob store.

**Publish.** `/s/<slug>` on keplar.one (path based) and custom domains (Plus+) through the proxy rewrite.
`*.keplar.site` is NOT live: the domain `keplar.site` does not resolve (NXDOMAIN on Oct 6, 2026: not registered or no DNS).

**What it could do.** Polished static marketing sites (up to 4..25 pages), forms -> leads/CRM, newsletter, bookings,
data tables, blog, member login (BETA), Stripe checkout (BETA), search, analytics, link-card embeds; all expanded
server-side from placeholders, because **no user JavaScript ever runs** (allow-list sanitizer, CSP sandbox, opaque origin).

**What it could not do.** Anything interactive: no app logic, no client-side state, no games, no SPA, no data models chosen
by the prompt, no end-user generated content (posts, likes, follows, comments), no file uploads, no realtime, no AI
features inside the generated site, no server functions. No planner/spec step (the brief is a fixed marketing schema with
fixed site kinds), no multi-file project beyond HTML/CSS, no build/type-check, the browser QA is manual and only checks
layout, palette choice limited to 8 directions + one accent, no typography/shape/density/motion choice, no "surprise me",
no imagery generated for the site.

## 2. New architecture (Keplar Apps)
Code: builder `src/lib/app-builder/**`, runtime `src/lib/app-runtime/**`, API `src/app/api/apps/**`, studio UI
`src/components/create/apps/**` (Create -> "App" tab), chat card `src/components/app-ui/create/**`.

**Pipeline** (`pipeline.ts`, streamed as NDJSON events, resumable in steps so each serverless call stays under its time budget;
the client follows `continue` events with the same `buildId`):
1. *Design.* The user picks a direction in the design picker (12 art-directed presets + palette/font/shape/density/motion, a
   custom palette, light/dark) or "Keplar picks" (`design/surprise.ts` art-directs a look for the idea). Tokens are compiled
   to CSS variables and contrast-checked (`design/tokens.ts`). `rubric.ts` is the anti-generic rubric the planner, coder
   and reviewer all see (no default blue, no centered-hero-plus-3-cards, real imagery, etc.).
2. *Plan.* `plan.ts` writes an `AppSpec` (`spec.ts`): screens/routes, collections with fields and access rules, auth,
   uploads, AI actions, realtime, seed data, image slots, and "not built on this plan" (Free plans front-end only).
3. *Generate.* `generate.ts` writes the files in batches (`<file path>` blocks): `index.html`, `app.js`, `pages/*.js`,
   `lib/*.js`, styles. Apps use Preact+htm through `window.kui` and the `keplar` SDK (`sdk/kapp.src.js`, built into
   `public/fx`): `collection().list/add/update/remove/watch`, `auth`, `files`, `ai.run(action)`. No npm, no bundler.
   `images.ts` generates the real imagery for image slots (`keplar-image:<slot>` refs, resolved on serve).
4. *Verify.* `verify/static.ts` (imports/exports, undefined globals, SDK misuse, collection/AI names vs the spec, plus
   deterministic repairs of the commonest wiring slips), `verify/smoke.ts` (headless Chromium: every route, console errors,
   blank screens, 390px phone layout, cramped text columns, sign up, CRUD for each collection through the real API, "saved
   data shows up", AI actions), `verify/review.ts` (requested vs built verdicts per feature + visual design score from
   screenshots). Failures go to `fix.ts` (up to 3 rounds), then re-verify.
5. *Save.* A version (files in Neon) and an HMAC-signed draft preview URL; Publish serves it at `/s/<slug>/`.

**Runtime for generated apps** (`app-runtime/`, served by `serve.ts` + `router.ts` under the app's own path): data
(`data.ts`: per-app, per-environment collections in Neon with owner/public/admin rules from the spec, filters, sort, paging),
end-user auth (`auth.ts`: email+password and magic link, per-app user tables, sessions scoped to the app), uploads
(`files.ts`), AI actions (`ai.ts`: declared prompts only, metered against the creator's plan), realtime (`watch` = polling).
Draft, QA and live data are separate environments; every app is isolated by app id. Limits by the creator's plan
(`limits.ts`): Free front-end only; Lite 5k records / 300 users / 50 MB; Plus 50k / 5k / 200 MB + 600 AI calls a day;
Pro 250k / 50k / 1 GB + 3,000 AI calls; plus request and write rate limits per visitor.

**Models** (`models.ts`): Free = only `:free` models (Nemotron 3 Ultra/Super, Laguna, Gemma 4; vision Gemma 4 / Nemotron
Omni). Paid plans: Claude Opus 5.5 (Pro) / Sonnet 5.5 (Plus) / Gemini 3.8 Flash (Lite) for code, with Flash and a free
model as fallbacks; a spend breaker steps down a tier.

**Chat Create card** (composer Create chip in /app): instead of a text answer the message runs the same pipeline inline:
a "Building the app" checklist (plan -> each file -> tests -> requested vs built -> design review) on the left, and on the
right a Preview/Code pane with desktop/phone toggle, a progress bar while building, Publish -> "Published" pill + toast,
"Open in Create studio" (hands the app to the App tab) and "Open live app". Free builds start at once with a Keplar-picked
look; paid plans confirm the credit estimate and can pick a look first. A reload mid-build resumes from the saved build id.

**App studio (Create -> App tab, Oct 6 redesign).** A drafting table, not a chat box: the left column is three numbered
steps (01 Describe, 02 Shape, 03 Ship) and the right is a live blueprint canvas. As you type, `blueprint.ts` sketches the
app's screens as wireframes (layout guessed per screen, data and traits from your words); after Build the planner's real
screens replace the guess and each frame inks in as its file is written, gets a check or a mark from the browser test, and
the canvas finally develops into the running preview. Pieces: `PromptField.tsx` (uncontrolled textarea + tiny store, so a
keystroke never re-renders React; Cmd/Ctrl+Enter builds; draft kept per tab), `LookTiles.tsx` (tactile look tiles in each
style's own fonts and colors; the full picker opens as a "Fine-tune" sheet), `starters.ts` (11 app-type starters),
`AppShelf.tsx` ("Your apps": thumbnail or a poster in the app's look, Open / Refine / Duplicate / Publish / Visit),
`resume.ts` (a build in flight survives a reload; a held build slot is polled, then rejoined), `ChangesPane.tsx` +
`lib/app-builder/diff.ts` (per-version changelog with a line diff and Restore), `CodePane.tsx` + `highlight.ts` (read-only
code view with a 1 KB tinter instead of an editor). Heavy parts are code-split: the other Create tabs, the design picker
and the Code/Changes/Data/Settings panes load on first use. The look previews use self-hosted Latin subsets
(`public/fonts/previews/`, built by `scripts/build-preview-fonts.py`); only `/app/*` pages also allow Google Fonts in the CSP
(`APP_PAGE_CSP`) for families without a local cut. Screenshots: `screenshots/create-studio/{before,after}/`.

## 3. Status (Oct 6, 2026)
See the final report in the task thread for commits and deploy ids. E2E screenshots: `screenshots/apps/<prompt>/`.

| Prompt | Plan / look | Result |
|---|---|---|
| Browser puzzle game ("Prismwick") | Plus, retro dark | Done, all checks pass, visual 9/10 |
| Marketing site, user palette ("Ferment & Field") | Plus, organic, #F4EFE6 / #C2552D / #2F5D50 | Done, visual 10/10, generated imagery |
| Film-photographer social ("Grainroll") | Pro, editorial dark | Built, seeded feed works; layout still cramps text (a `grid-column-start` cancels a span); 3 free-model fix rounds did not fix it (OpenRouter credits ran out, so no paid model) |
| AI study buddy ("Quizzy Buddy") | Plus, playful | Built; every screen opens, AI quiz + flashcards pass; "saved notes show up" check still fails |
| Hair salon booking + admin ("Maison Aurelle") | Pro, luxury | Built; import slip repaired deterministically, re-verified: all checks pass |
| Chat Create card (local prod build) | Free | "BikeFix" built inline in ~4 min on free models: plan -> files -> tests, preview, Publish -> pill + toast, Code tab, phone toggle |

**Known limits / pending.** `*.keplar.site` needs the domain registered + wildcard DNS on Vercel + a Public Suffix List
entry (until then apps are served at `keplar.one/s/<slug>/`). Server functions are declarative (AI actions, rules), not
arbitrary code (that needs Vercel Sandbox or QuickJS). Files and images are Neon `bytea` (move to Blob/R2 at scale).
Realtime is polling. End-user magic links depend on Resend sending from keplar.one.
