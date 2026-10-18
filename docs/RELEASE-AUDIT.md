# Keplar release audit

Date: 2026-10-18, about 05:22–05:32 UTC.

## Fix status (after the redesign merged)

The redesign landed on `main` as `b83079b` (PR #60). The fixes for the high and medium items below are in the release-fixes branch. `/vs/perplexity` is unchanged (owner). After-deploy Lighthouse numbers are recorded with the release report, not in this before table.

Shipped:

- Chat saves strip image and video bytes on the client before the 5 MB body check.
- A follow-up in the same tab still sends the attached file's extracted text.
- Extracted text is keyed by the attachment id, so two files with the same name and size stay separate.
- Hydrating a saved chat keeps messages that were sent while it was loading.
- On the website, Business, Agents, Approvals, and a Stripe, connector, or bank return all leave for `https://business.keplar.one/work`. `/enterprise` and `/agents` still open the storefront. The Keplar One desktop window does not leave keplar.one.
- Unknown `/app/*` is a real 404. `/space-studio` is noindex and out of the sitemap. The scene is unchanged.
- Whop's pixel is off on `/` and `/docs`. It stays on `/pricing` and `/overview`.
- Ask's rate limit uses the shared store. Lite site builds use the Flash chain. Free cannot enqueue a paid image or the legacy codegen route. Free builder calls set `allow_fallbacks: false`.
- One shared `/api/compute` fetch. X and family probes wait until the person is signed in.
- The composer does not import three.js while `THREE_D_ENABLED` is false.
- Forgot password sits after the password field. The 404 line is "This page isn't here." `public/sky` is removed. Product UI no longer names the model provider.

Left on purpose:

- `/vs/perplexity` stays indexable until the owner reviews it.
- Space Studio Free models (Orbit, Nebula) stay on paid Anthropic inside the credit cap.
- `public/fx/kapp-three.1.js` and `.2.js` both stay.
- HTML documents stay `cache-control: max-age=0` (Next's dynamic default).
- Ask's free OpenRouter options still allow host fallbacks. The builder calls do not.
- Legal privacy copy and comparison pages still name providers.
- Desktop and mobile Lighthouse after the deploy is measured on the live site.

Scope: production [https://keplar.one](https://keplar.one) and the tree at `origin/main` `84edbbf` (`Revert the site to c000070, before the Oct 17 agent changes`). Live deploy stamp: `{"sha":"84edbbf3b97b","count":245,"builtAt":"2026-10-18T03:10:55.034Z"}` from `https://keplar.one/deploy-stamp.json`.

This is the **before** measurement. Another agent (`Redo ChatGPT-style redesign on keplar.one (v2)`, run `bc-3fc50bb0`) is re-applying the ChatGPT-style redesign (chat at `/`, landing at `/overview`, solid graphite app surfaces) and had not opened a pull request when this audit was written. Code fixes wait until that redesign is on `main`. Space Studio is exempt from visual changes.

Lighthouse 12, simulated throttling, headless Chrome. Mobile viewport 390×844, desktop 1350×940. Scores are 0–100.

## Baseline Lighthouse

| Page | Form | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | mobile | 87 | 100 | 79 | 100 | 1.7 s | 2.7 s | 360 ms | 0 |
| `/` | desktop | 54 | 100 | 78 | 100 | 1.7 s | 3.2 s | 470 ms | 0 |
| `/overview` | both | — | — | — | — | — | — | — | — |
| `/pricing` | mobile | 93 | 100 | 79 | 100 | 1.5 s | 2.8 s | 190 ms | 0 |
| `/pricing` | desktop | 48 | 100 | 78 | 100 | 1.7 s | 3.2 s | 601 ms | 0 |
| `/docs` | mobile | 92 | 100 | 79 | 100 | 1.8 s | 3.0 s | 140 ms | 0 |
| `/docs` | desktop | 57 | 100 | 78 | 100 | 1.7 s | 3.0 s | 421 ms | 0 |

`/overview` is a real 404 on this deploy, so Lighthouse returned no scores. That URL is the redesign's marketing home and does not exist on the reverted site.

Home desktop opportunities: render-blocking resources ~740 ms, unused CSS ~75 KiB, unused JavaScript ~26 KiB. Main thread ~2.7 s, script bootup ~1.3 s, transfer ~635 KiB. Third-party main-thread time is dominated by `t.whop.tw` (`fingerprint.js` ~508 ms main thread, ~171 ms blocking).

Best-practices failures on `/` (desktop): `third-party-cookies` (1 cookie) and `inspector-issues`. Pricing and docs share the 78–79 score and the same Whop pixel.

## Blocker

None found that stops sign-in, a guest chat, or a checkout handoff on the current production deploy.

Shipping this deploy as the release would still miss the owner's product direction: the live site is the pre-redesign Keplar (sky marketing at `/`, chat at `/app/ask`). That is filed under Old-UI remnants as high, because the redesign agent is already replacing it. Leftovers after that merge are the ones to delete.

A second pass through the model callers did not find an unbounded Free Ask path. Ask's registry refuses anything that is not a `$0` OpenRouter `:free` slug (`src/lib/orchestration/free-guard.ts`). The money gaps below are capped or plan-routing bugs, so they are high, not blockers.

## High

### Old-UI remnants

The owner asked that no remnant of the old Keplar remain. Space Studio stays as it is. Everything below is high and is what Phase B removes if the redesign leaves it.

1. **Chat is not the front door.** `src/app/(marketing)/page.tsx` renders `SkyHome` (sky, product window, pricing). Chat is `/app/ask` (`next.config.ts` redirects `/app` there). `/overview` 404s. Live h1 on `/`: "One question. Multiple intelligences. One answer." Live h1 on `/app/ask`: "Good morning."
2. **Light is the default, not graphite.** Root layout sets `data-theme="light"` and `colorScheme: "light"` (`src/app/layout.tsx`). Tokens start from a white canvas (`--c-canvas: #ffffff`, `color-scheme: light` in `src/styles/tokens.css`).
3. **Violet and pink are sitewide, not only Space Studio.** `--c-focus` and `--c-accent` are `#7d3bc4` in light and `#c39bff` in dark (`src/styles/tokens.css` around lines 27–29 and 204–206). `--space-focus-glow` is a violet glow (`src/styles/space.css` lines 61 and 95) and is used by fields, buttons, pricing, inquire, feedback, and the language picker. `--v-memory: #d4848e` is documented as soft pink (`tokens.css` line 44).
4. **Sky, glass, and WebGL sit on the marketing home and in the root shell.** `SkyHome`, `SkyBackdrop` (also the 404), and `ParticleStory` / `particle-scene.ts` (three.js, "glowing particle cloud"). `HOME_FX_SCRIPT` (`src/lib/home-fx.ts`) probes WebGL 2 on `/` before paint. The root layout mounts, on every page: `GlassCaps`, `GlassDefs`, `TypingFeel`, `InsertMode`, `PageMonolith`, `SpaceMotionFilters`, `ProximityLight`, `ButtonFx`, `FitRuntime`, `SmoothCaret`, `CommandPalette`.
5. **Provider brands on the marketing home.** The live homepage requests `/models/claude.svg`, `chatgpt.svg`, `gemini.svg`, `deepseek.svg`, `mistral.svg`, and `grok.svg` (each more than once). The product rule is to never name the model provider in the UI.
6. **Old sky stills.** `public/sky/` (~548 KB of weather stills: cloudy, snow, thunderstorm, day and night). Cached for a day from `next.config.ts`. These are the old sky, not the graphite app surface.
7. **404 copy and chrome are the old page.** `src/app/not-found.tsx` uses `SkyBackdrop` and the line "This page drifted off."
8. **The same skin is on more than the English home.** Marketing layout mounts `SkyBackdrop`, a floating glass nav, and `AmbientRuntime` (`src/app/(marketing)/layout.tsx`). Auth headlines cycle a purple gradient (`src/components/auth/auth.module.css`, `EntryHeadline.tsx`). Translated homes (`src/app/(i18n)/[locale]/page.tsx`) are an older page: static orb, provider-name list, peach and violet corner wash (`src/styles/aura.css`). The chat shell still has a purple usage meter, a violet user bubble, and a floating composer (`src/components/app-ui/App.module.css` around 541–559 and 1503–1808). Business storefront and `/biz/work` use the same glass and violet hover. `src/styles/space.css` is imported last from `globals.css`, so it overrides the flatter rules in `redesign.css`. Space Studio's own routes (`src/app/(space)/**`, `src/components/space/**`, `src/lib/space-studio/**`) stay.
9. **Dead UI still in the tree.** Nothing routes to `FieldHome`, `OrbHero`, or `HeroField`. `PageMonolith` is mounted from the root layout and returns null because `THREE_D_ENABLED` is false (`src/lib/fx/three-d.ts`). `AmbientRuntime` is mounted and then hidden (`.ambient { display: none }`). These are deletion candidates after the redesign, together with their tests. `public/sky` stays until `WeatherSky` is gone. Do not delete `public/fx` as part of the visual cleanup.

### Efficiency

8. **Desktop Core Web Vitals are weak on the three measured pages.** Performance 48–57. LCP 3.0–3.2 s (needs improvement). TBT 421–601 ms. CLS is 0. Mobile is better (87–93) but LCP is still 2.7–3.0 s.
9. **Whop's ad pixel loads on pages that are not checkout.** `WhopPixel` is in the root `<head>` (`src/app/layout.tsx`). `whopPixelAllowed()` (`src/lib/whop-pixel.ts`) allows it on `/`, `/pricing`, `/docs`, and the rest of marketing. It is excluded from `/app`, auth, account, and checkout. Lighthouse still attributes ~171 ms of blocking time on `/` to `https://t.whop.tw/fingerprint.js`, plus `s.js` and `sc.js`, and that cookie fails best practices. The loader waits for idle or the first interaction, then runs within about 3.5 s, so a lab run still pays for it. Docs do not need an ads pixel.
10. **Identical three.js runtimes are shipped twice.** `public/fx/kapp-three.1.js` and `kapp-three.2.js` are 742,994 bytes each and share sha256 `b667735a04c1938d` (`public/fx/manifest.json`). `kfx-gl.1.js` is another 553 KB three build for generated sites. These are the published-app runtime (`/fx/*.js` is what customer sites load), not the marketing sky. Deleting a URL is only safe if no published HTML still points at it.
11. **Lite site builds use the Pro model, Plus does not.** `modelChain` (`src/lib/site-builder/limits.ts` lines 64–68) sends Free to `:free` models and Plus to Gemini Flash. Every other plan, including Lite, gets Claude Sonnet first (`anthropic/claude-sonnet-5.5`, $2 / $10 per 1M). App builds do not do this: `chainFor` in `src/lib/app-builder/models.ts` keeps Lite on Flash. This spends more on Lite than on Plus. It does not change the prices shown on `/pricing`.
12. **Free image jobs can call a paid image model.** Free entitlements set `images: true` (`src/lib/create/platform/plans.ts` line 37). `createMediaJob` only rejects premium models and video (`src/lib/create/media.ts` lines 59–61). The default model is `openai/gpt-image-2`. The queued worker posts to OpenRouter `/api/v1/images` and the job payload's `plan` is not re-checked before that call. Ask itself does not have this hole.
13. **Legacy site codegen ignores the plan.** `POST /api/create/projects/[id]/generate` calls `generate` in `src/lib/create/codegen.ts`, which always uses `KEPLAR_CODEGEN_MODEL` or `openrouter/auto`, waits for the full JSON body (120 s timeout), and has no `:free` branch. `assertCostGuard` deliberately does not enforce `free_models_only` (`src/lib/cost/guard.ts` line 227). Whether this route is still linked from Create after the redesign needs a check before it is deleted or gated.
14. **Ask's rate limit is per server instance.** `limitRequest` (`src/lib/create/platform/ratelimit.ts` lines 153–155) does not pass `{ shared: true }`. Postgres is used only when `shared` is set and Upstash is absent (lines 86–96). `/api/health` reports `rateLimit: "postgres"` because Neon is configured, which describes the available backend, not the limiter Ask actually uses. Ask allows 30/IP and the plan's `rpm` (Free is 10) in process memory (`src/app/api/keplar/route.ts`). Auth magic links do use `{ shared: true }`. A burst across instances multiplies Free `:free` calls against the shared OpenRouter key.
15. **Space Studio Free calls paid models, inside its own credit cap.** Orbit and Nebula are `minPlan: "free"` (`src/lib/space-studio/core/models.ts`) and are served by `anthropic/claude-haiku-4.5` and `anthropic/claude-sonnet-5.5` (`src/lib/space-studio/providers.ts` lines 12–16). `runSpaceChat` calls OpenRouter directly and does not go through `free-guard.ts`. Spend is capped by Space Studio credits: Free is 30 credits per 5 hours and 120 per week, and one credit is one cent of model cost (`src/lib/space-studio/core/credits.ts`). The look of Space Studio stays. Whether those two models must move to `:free` is an owner decision, listed below.
16. **Signed-in chats that include images or video can fail to save, and a reload drops them.** Signed-in threads are not written to local storage (`src/components/app-ui/state/store.ts` lines 87–92). The sync PUT sends the raw messages, including image and video data (`src/components/app-ui/useChatSync.ts` lines 56–61). The server strips `media` only after `body()` has already read the JSON (`src/app/api/chats/[id]/route.ts` lines 25–33 and 55–58). `body()` refuses anything over 5 MB (`src/lib/create/platform/http.ts` lines 39–44), which is also above Vercel’s own request cap. A failed PUT clears the saved timestamp, so the same body is retried. Text-only chats are unaffected. This was not reproduced in the browser; the guest session used text only.
17. **A follow-up does not see an attached file.** `historyFor` keeps the user’s text and at most 3,000 characters of the previous answer (`src/components/app-ui/KeplarApp.tsx` lines 156–170). Extracted document text lives in a tab `Map` and is sent as `docs` on the message that attached it (`src/components/app-ui/doc-client.ts`, `KeplarApp.tsx` lines 477–494). The ask route applies `req.docs` to the current turn only. After a reload the client refuses to answer without the file. A text follow-up does work: the live guest session remembered the code word “graphite.”
18. **Two files with the same name and size share one extracted text.** The store key is `` `${name}\0${size}` `` (`src/components/app-ui/doc-client.ts` line 10). A second PDF overwrites the first, and the first question can be sent with the wrong text.
19. **Provider names are still in the product UI**, beyond the homepage logos. Translated homes print OpenAI, Anthropic, Google, Meta, DeepSeek, Mistral (`src/components/home/MonolithHome.tsx`). `/models` and landing FAQ copy name OpenRouter, OpenAI, NVIDIA, and Anthropic (`src/lib/content/models-page.ts`, `src/lib/content/landing.ts`). `/developers` says "OpenRouter :free" in the meta description and the page (`src/app/(marketing)/developers/page.tsx`). `/features` says "on Claude Opus 5.5" (`src/lib/features.ts`). Answer details show `m.provider` (`src/components/app-ui/KeplarTurn.tsx`). Account embed and data-controls copy name OpenRouter and OpenAI (`EmbedPanel.tsx`, `src/lib/privacy/training-statement.ts`). Chat does not print the word OpenRouter in the thread.

## Medium

11. **Unknown `/app/*` URLs return HTTP 200 with the marketing 404.** `GET /app/settings` is `200`, `x-matched-path: /app/[...rest]`, `noindex`, and the body is "This page drifted off." There is no `src/app/app/settings` page. Settings for a signed-in person is `/account`, which opens the dialog over the app (`KeplarApp` pushes `/account`; signed-out `/account` 307s to `/signin`). The soft 404 is wrong for a missing route.
12. **Ask loads identity and feature probes more than once.** On a signed-out `/app/ask` load, Chrome recorded two `GET /api/compute` 200s before send and another after send. `usePlan()` (`src/components/billing/usePlan.ts`) and `KeplarApp.syncMeter` (`src/components/app-ui/KeplarApp.tsx`) each call `/api/compute` and do not share a promise. The same load also calls `GET /api/x/search` and `GET /api/family`, both **401** when signed out (`XPosts.tsx`, `family-client.ts`). Console stayed clean; the calls are still wasted.
13. **`/space-studio` is indexable again.** `src/app/sitemap.ts` lists `/space-studio` (1 hit in the live sitemap). The live HTML had no `noindex`. Pull request #51 had noindexed it and dropped it from the sitemap; the revert put that back. Visual exemption does not require it to be in the sitemap.
14. **Mobile LCP is in the "needs improvement" band** (2.7 s home, 2.8 s pricing, 3.0 s docs) even though the Lighthouse performance score is 87–93. Unused CSS on the home is about 75–76 KiB.
15. **Sign-in tab order.** On a fresh `/signin`, the first Tab stop was the "Forgot password?" link. Email, password, and the checkbox are labelled. Lighthouse accessibility on the measured pages is 100, so this is a keyboard-order issue, not a missing-name issue.
16. **HTML documents are `cache-control: public, max-age=0, must-revalidate`.** Vercel still HITs them (`age` was ~7550 s on `/` at the start of the audit). Hashed `/_next/static` is immutable for a year in production. Sky images are one day. This is fine for correctness and weak for repeat HTML views.
17. **Chat still downloads three.js after a typing pause.** `THREE_D_ENABLED` is false, so the scene does not start, but `SendFieldLazy` imports `stage.ts`, which imports `three` at the top (`src/components/spatial/stage.ts` line 2). The module is fetched even though `detectCaps` then reports no WebGL.
19. **Opening a saved chat can drop a message sent before it loads.** Remote threads are inserted with `messages: []` (`store.ts` line 274). `hydrate` then replaces `messages` with the server copy (`store.ts` lines 280–282) and does not keep anything typed locally in that gap.
20. **“Open in Business” and a Stripe return do not match the redirects.** Chat cards call `goView("business" | "agents" | "approvals")`, which leaves for `https://business.keplar.one` (`KeplarApp.tsx` around 842–843). After Stripe, the client `replaceState`s to `/app/business` and shows an embedded screen; a reload hits `next.config.ts` and leaves for the storefront, not `/work`. The page files for those routes are still in the tree and never render.
21. **`/vs/perplexity` is a public page while its hold note says not to index it yet.** `approved: false` keeps it out of the sitemap (`src/lib/kb/vs.ts` lines 185–189), but the page is still generated and `pageMeta` does not set `noindex`. `holdReason` says the owner should review it before it is indexed.
22. **`:free` builder calls set `allow_fallbacks: true`.** Site and app builders do this (`src/lib/site-builder/generate.ts` line 221, `src/lib/app-builder/llm.ts` line 67). The cost meter treats a call as free from the slug in the request, not from the `model` field that comes back. Space Studio discards a mismatched model (`src/lib/space-studio/chat.ts` lines 157–160). Ask records `res.model` and does not. A host fallback to a paid model would be metered as free.

## Low

17. **`/docs/getting-started` 404s.** The real quickstart is `/docs/get-started/quickstart` (200). The docs index links the real path. The short URL is an easy miss, not a broken in-page link.
18. **Aborted RSC prefetches.** Chrome logged `net::ERR_ABORTED` for `/signin?_rsc=…` while loading `/pricing`, `/signup`, and `/app/ask`. No console error on those pages. Treated as cancelled prefetches.
19. **`/api/chat` 404s.** The app and the public API use `/api/keplar` and `/api/v1/ask`. Nothing in the UI linked `/api/chat`.
20. **Cookie banner** is present and readable ("Analytics stay off unless you allow them"). It sits above the fold until dismissed. Expected.

## What held up

- **Guest chat, streaming, and text context.** On `/app/ask`, "Say hi in one word." returned "Say one word" in 1.9 s (`POST /api/keplar` 200, "Answered with one model"). A follow-up, "What code word did I just give you?", after "Remember the code word: graphite.", answered `graphite` (`POST /api/keplar` 200 again, "Reasoned with 2 intelligences", 5.9 s, "2 of 2 models agreed"). Attachment follow-ups are a separate high finding. The composer tells Free users that media and links go to free model hosts.
- **Attachment control exists.** Button label "Attach files, photos or a link", plus composer help for images, video, audio, and documents. A real file upload was not sent.
- **Auth pages.** `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` return 200. `/login` 308s to `/signin`. `/two-factor` and `/account` 307 to `/signin` when signed out. Sign-in fields have labels.
- **Checkout links, no purchase.** Homepage and pricing link `/checkout?plan=lite|plus|pro`. Those 307 to `/signin?next=%2Fcheckout%3Fplan%3D…`. Bare `/checkout` 307s to `/pricing` (`src/app/(marketing)/checkout/page.tsx` rejects an unknown plan). Amounts and Whop configuration were not changed.
- **Create.** `/create` 308s to `/app/create`. The page renders h1 "Create" at 1440 and 390, with sign-in and sign-up links. No horizontal overflow.
- **Mobile 390.** `/`, `/pricing`, `/docs`, `/signin`, `/app/ask`, `/app/create`: `scrollWidth` did not exceed the viewport.
- **Errors.** `src/app/error.tsx`, `global-error.tsx`, and `not-found.tsx` exist. `GET /this-page-does-not-exist-audit` is a real **404**.
- **Security headers on `/`.** CSP (default-src self, Whop hosts, object-src none, frame-ancestors none), HSTS preload (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, COOP same-origin, CORP same-origin, referrer `strict-origin-when-cross-origin`, Permissions-Policy locking camera, geolocation, payment. `/app/*` additionally allows Stripe.js, which matches `APP_PAGE_HEADERS`. `productionBrowserSourceMaps` is false. No live secret was found in the audited client paths. `/api/health` returned `{"ok":true,"store":"postgres","durable":true,"security":{"authSecret":true,"rateLimit":"postgres"}}`.
- **Robots and sitemap respond.** `robots.txt` allows `/`, disallows `/api/` and `/dev/`, and lists four sitemaps. `sitemap.xml` and `answers-sitemap.xml` return 200.
- **OpenRouter guardrails in code.** `src/lib/orchestration/free-guard.ts` refuses Free-plan calls unless the model is an OpenRouter slug ending in `:free` with a $0 price. `postChatStream` (`src/lib/orchestration/http.ts`) streams, retries 429/5xx only before the first byte, and aborts at 45 s (`RETRY.timeoutMs` in `src/lib/orchestration/config.ts`).
- **Creator credit and claims.** `src/lib/identity.ts` credits "Hassen and Hussain Keder" and strips age or birthdate sentences. The blog index says it does not invent statistics or testimonials. No ages on the public pages checked.
- **Redirects that should work.** `/blog` → `/blogs`, `/enterprise` and `/agents` → `https://business.keplar.one`, `/app` → `/app/ask`.

## Route spot check

| Path | Result |
| --- | --- |
| `/`, `/pricing`, `/docs`, `/docs/get-started/quickstart` | 200 |
| `/overview`, `/docs/getting-started`, `/settings`, `/account/settings`, unknown path | 404 |
| `/app/settings` | 200 soft 404 (see medium) |
| `/signin`, `/signup`, `/app/ask`, `/app/create`, `/space-studio` | 200 |
| `/checkout?plan=lite\|plus\|pro` | 307 to sign-in, `next` preserved |
| `/api/health` | 200 `ok: true` |
| `/robots.txt`, `/sitemap.xml` | 200 |

## Phase B (after the redesign merges)

Do not open these until `origin/main` contains the redesign (chat at `/`, landing at `/overview`). Then rebase and:

1. Re-walk the routes and delete whatever old UI is still rendered: violet and pink tokens outside Space Studio, sky and glass on app surfaces, the floating composer treatment, provider names and logos, translated-home orbs, `public/sky` once `WeatherSky` is gone, the "drifted off" sky 404. Leave `src/app/(space)/**`, `src/components/space/**`, and `src/lib/space-studio/**` alone.
2. Delete dead UI that nothing routes to (`FieldHome`, `OrbHero`, `HeroField`, the idle `PageMonolith` / `AmbientRuntime` mounts) and stop the chat composer from importing `three` while `THREE_D_ENABLED` is false.
3. Put Lite site builds on the Lite model chain. Gate legacy `openrouter/auto` codegen and Free image jobs so a Free workspace cannot call a paid model. Pass `{ shared: true }` on Ask's rate limit so it uses the Postgres backend health already reports.
4. Strip image and video bytes on the client before the chat PUT, or raise the parse-then-strip order so a signed-in chat with media still saves. Send extracted document text with later turns in the same tab, and key extracted text by more than name and size. `noindex` `/vs/perplexity` until the owner approves it.
5. Stop the Whop pixel on pages that are not part of checkout or pricing, if the owner agrees (see below). Docs should not load it.
6. Share one `/api/compute` fetch. Do not call `/api/x/search` or `/api/family` until there is a session that can succeed.
7. Make unknown `/app/*` a real 404.
8. Restore `/space-studio` noindex and drop it from the sitemap, matching #51, without touching Space Studio's scene.
9. Re-run the same Lighthouse set and record after numbers next to the table above.

## Owner action (not guessed)

- **Whop pixel.** It is ad measurement (`biz_z2gxvcmr06XrpI` in `src/lib/whop-pixel.ts`). Removing it from `/` or `/pricing` changes attribution. Confirm whether it may remain on pricing only, or must stay on every marketing URL. Docs should drop it either way unless you say otherwise.
- **`kapp-three.1.js` vs `.2.js`.** The bytes match. Deleting one URL is safe only if no published app HTML still points at that path.
- **Space Studio indexing.** #51 noindexed `/space-studio`. The revert undid that. Confirm it should stay out of the sitemap.
- **Space Studio Free models.** Orbit and Nebula are offered on the Free Space Studio plan and call paid Anthropic models, capped at 30 credits / 5 hours and 120 / week. Moving them to `:free` changes that product's cost and quality. The scene stays either way. Say if they should move.
- **`/vs/perplexity`.** The page is live and indexable. Its source says to review it before indexing, because the comparison rests on search excerpts and overlaps Keplar's multi-model pitch. Say if it should be noindexed or approved.
- **Lite checkout in production is configured.** `GET /checkout?plan=lite` on keplar.one 307s to sign-in with the plan preserved, so `WHOP_PLAN_LITE` is set in production. The source default still has no Lite plan id and would send that URL to `/pricing` if the env var were missing. Do not change the id.
- **Signed-in passes not run here.** No account was used, so checkout never opened Whop, a file was not uploaded, and Settings (`/account`) was not exercised past the sign-in redirect. The image-save failure is from reading the PUT path, not from a signed-in browser session. No pricing amounts or Whop plan ids were changed.
