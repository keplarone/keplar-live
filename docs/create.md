# Create: build, publish, domains, media

Status: Create runs when `OPENROUTER_API_KEY` is set and the server has a persistent disk. Otherwise it says "not set up yet" (generation, images and video). Published sites are served from `/sites/<slug>/` (disk build) or `/s/<slug>` (Vercel site builder); wildcard hosting on keplar.site is not wired yet. Nothing is simulated. **Image generation (stage 2) is live on Vercel** through `OPENAI_API_KEY` and Neon, see section 9. **Custom domains are live on Vercel** for Plus, Pro and Business, see `docs/custom-domains.md`. **Video (Beta) and images now default to Higgsfield**, see `docs/video-higgsfield.md`; without `HIGGSFIELD_API` the video studio says "Not configured" and nothing is generated.

The `<CreateStudio />` is the Create view in `/app` (needs a signed-in account).

## 1. Provider picks

| Job | Pick | Why | Cost (Sep 2026) | Alternative |
|---|---|---|---|---|
| Code generation | OpenRouter chat completions (`KEPLAR_CODEGEN_MODEL`, default `openrouter/auto`) → JSON file manifest | One key for every model family, reports `usage.cost` per call so Usage is metered on real spend | Estimate $0.25 per first build, $0.08 per iteration (~30k in / 15k out tokens, mid-tier model) | Direct Anthropic/OpenAI keys |
| Preview sandbox | **Vercel Sandbox** | GA since Jan 30 2026, same vendor as hosting, per-active-CPU billing | $0.128 / active vCPU-hour + $0.0212 / GB-hour; a 2-minute preview with ~30 s CPU ≈ $0.005 | E2B: $0.0504 / vCPU-h + $0.0162 / GiB-h, but Pro is $150/mo |
| User-site hosting | **Vercel for Platforms** (one multi-tenant project, wildcard `*.keplar.site`) | Unlimited custom domains on Pro (soft limit 100k/project), no per-domain fee, automatic SSL | Included in Pro ($20/seat/mo) + usage | Cloudflare for SaaS: 100 hostnames free, then $0.10/hostname (max 50k); Workers for Platforms $25/mo |
| Custom domains | **Vercel Domains API** (add → `verified:false` + TXT challenge → verify → remove) | Same project as hosting; rate limits 100 adds/h, 50 verifications/h | $0 per domain | Cloudflare for SaaS custom hostnames |
| Images | **OpenRouter** `POST /api/v1/images` (sync) | One API for all image models, cost returned in `usage.cost` | gpt-image-2 $0.006–$0.0135 (≈$0.21 at `quality:high`); FLUX.2 [klein 4B] $0.014; FLUX.2 [pro] $0.03; Recraft V4.1 vector $0.08 (SVG); Riverflow v2.5 Pro $0.064; Gemini 3 Pro Image $0.134 | fal.ai |
| Video | **OpenRouter** `POST /api/v1/videos` → poll `polling_url` → `GET` content (webhooks supported) | Same key and metering as images | Reference per-second prices (fal.ai): Wan 2.5 $0.05/s; Kling 2.5 Turbo Pro $0.07/s; Veo 3.1 Fast $0.10/s silent, $0.15/s with audio; Veo 3.1 $0.20/s silent, $0.40/s with audio | fal.ai directly |
| Moderation | OpenAI `omni-moderation` (text + image) | Free endpoint, covers sexual/minors, violence, self-harm, harassment | $0 | Keyword rules (current mock) |
| URL / malware scan | Google Web Risk + local heuristics | Industry-standard phishing lists | Web Risk: free tier, then per-1k lookups (confirm on the console) | — |

Video model slugs in `src/lib/create/media.ts` (`alibaba/wan-2.7`, `kling/kling-2.5-turbo-pro`,
`google/veo-3.1-fast`, `google/veo-3.1`) **must be confirmed with `GET /api/v1/videos/models`** before
going live; OpenRouter's catalog changes often (Seedance 2.5 was added in Aug 2026).

Sources: openrouter.ai/docs/guides/overview/multimodal/image-generation and …/video-generation;
OpenRouter blog "Image Generation Models Compared" (Sep 18 2026, measured Sep 11); fal.ai/pricing;
fal.ai/models/fal-ai/veo3.1; vercel.com/kb/guide/vercel-sandbox-vs-e2b; fly.io/learn/ai-sandbox-pricing;
vercel.com/docs/platforms/multi-tenant-platforms/limits and quickstart; developers.cloudflare.com (SaaS/WfP pricing).

## 2. Domains and isolation

- **User content lives on a separate registrable domain: `keplar.site`** (`KEPLAR_USER_CONTENT_DOMAIN`).
  Never serve user HTML from `keplar.one`: a separate site means user code can't read Keplar cookies,
  and a phishing report against one user site can't get `keplar.one` blocklisted.
  Add `keplar.site` to the Public Suffix List once live so browsers isolate `a.keplar.site` from `b.keplar.site`.
- Free address: `https://<slug>.keplar.site` via a wildcard domain on the platform project
  (**wildcards require Vercel nameservers** on `keplar.site`).
- Custom domains (Plus and up): apex → `A @ 76.76.21.21` + `CNAME www cname.vercel-dns.com`;
  subdomain → `CNAME cname.vercel-dns.com`; ownership → `TXT _vercel vc-domain-verify=…`. The UI shows these
  with copy buttons and polls status: Pending → Verifying → Active (SSL issued) or Error.
- Local equivalent: sites are served at `/sites/<slug>/` and `/sites/<custom-domain>/` with
  `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-modals` (opaque origin),
  `nosniff`, and `X-Robots-Tag: noindex`.

## 3. Usage costing (1 unit = $0.002 of provider spend)

| Action | Estimate | Units |
|---|---|---|
| First build | $0.25 + $0.005 preview | 128 |
| Iteration | $0.08 + $0.005 preview | 43 |
| Publish (build + scan) | $0.01 | 5 |
| Custom domain | $0 | 0 |
| Image, gpt-image-2 | $0.0135 | 7 |
| Image, FLUX.2 [pro] | $0.03 | 15 |
| Image, Gemini 3 Pro Image | $0.134 | 67 |
| Video, Wan 5 s | $0.25 | 125 |
| Video, Kling 5 s | $0.35 | 175 |
| Video, Veo 3.1 Fast 8 s with audio | $1.20 | 600 |
| Video, Veo 3.1 8 s with audio | $3.20 | 1,600 |

Live mode charges the provider-reported `usage.cost`; mock mode charges the estimate. Every request is
checked against the monthly allowance **before** it starts (`assertCanSpend`) and fails with a clear
message instead of silently downgrading. Proposed allowances (`src/lib/orchestration/plans.ts`,
founder approval pending): Free 150, Plus 6,000, Pro 13,500, Business custom. **Video is Pro and Business
only**: one Veo 3.1 clip would be over 10% of a Plus allowance.

Entitlements (`src/lib/create/platform/plans.ts`): Free 1 project, free subdomain, no custom domain,
standard images; Plus 5 projects, 1 custom domain, premium images, commerce; Pro 20 projects, 3 domains,
video up to 8 s; Business 100 projects, 10 domains, video up to 10 s (domain limits: `src/lib/domains/limits.ts`).

## 4. Safety

- **Prompt moderation** before any generation (site, image, video); blocked media jobs are recorded, not run.
- **Output moderation** on generated media before it's shown.
- **Publish scan** (`src/lib/create/safety.ts`): password fields next to well-known brand names, card and
  seed-phrase fields, obfuscated `eval`, crypto miners, hidden iframes, meta refresh, external form
  actions, and text moderation. Verdict pass / review / block; block returns 422 and the site isn't published.
- **Abuse reports**: "Report abuse" link in every site footer → `/api/create/abuse`. CSAM and NCII
  reports take the site down immediately (451) pending review; admins act via
  `POST /api/create/abuse/<id>` with `KEPLAR_ADMIN_TOKEN`.
- **Rate limits** per workspace (10/30/60/120 rpm by plan; Upstash in production), **Usage gating**,
  **verified email** required to publish, **custom domains on paid plans only**, **user content on a separate domain**.

## 5. What works end to end

Create project → describe it (NDJSON stream of steps and files) → live preview (desktop/mobile) → iterate
("make it dark", "add pricing") → publish to `/sites/<slug>/` (scan runs) → add a custom domain → watch it go
Pending → Verifying → Active (~20 s simulated) → open it at `/sites/<domain>/` → generate images (placeholder
SVG) and video (placeholder MP4, Pro+) with unit estimates and plan locks → blocked prompts are refused →
contact forms land in the Business OS CRM/inbox → shop "Buy" buttons say the store isn't accepting payments until Connect is wired.

## 6. Env vars

`OPENROUTER_API_KEY`, `KEPLAR_CODEGEN_MODEL`, `VERCEL_SANDBOX_TOKEN`, `VERCEL_TEAM_ID`,
`VERCEL_PLATFORM_TOKEN`, `VERCEL_PLATFORM_PROJECT_ID`, `KEPLAR_USER_CONTENT_DOMAIN`,
`OPENAI_MODERATION_API_KEY`, `GOOGLE_WEB_RISK_API_KEY`, `KEPLAR_ADMIN_TOKEN`, `KEPLAR_DEMO_PLAN`
(mock only), plus the platform vars in `docs/architecture-cloud.md`. See `.env.example`.

## 7. Suggested marketing copy (for the Marketer; not on any page yet)

No Create claims are on marketing pages. Drafts, to approve or rewrite:

- "Describe a site or app. Keplar builds it, shows you a live preview, and publishes it to a free address."
- "Bring your own domain on Plus and up. Keplar shows you the DNS records and sets up SSL."
- "Generate images on every plan, and video on Pro and Business, with the credit cost shown before you start."
- Don't say "unlimited sites/domains", "instant", or promise a particular video model.

## 8. Site builder on Vercel (current Create)

The disk-based project/deploy code above (`src/lib/create/*`, `/api/create/*`) needs a persistent disk, so it stays off on Vercel. Create on Vercel is the **site builder** in `src/lib/site-builder/`, everything in Neon (JSONB `keplar_rows` collections `sb_sites`, `sb_versions`, `sb_leads`). `BLOB_READ_WRITE_TOKEN` is not required: sites are small text files stored inside each version.

- **Flow:** template or prompt → multi-page static site (HTML + CSS) → live preview → chat edits → versions/undo → publish at `/s/<slug>`.
- **AI:** OpenRouter streaming (`generate.ts`), file-block output (`<file path>`), model fallback chain per plan, idle timeout, `maxDuration` 300 s on the generate route. Free: free models, text only. Plus/Pro: stronger models. Costs: see `docs/cost-model.md`.
- **No user scripts, ever.** Output goes through an allow-list sanitizer (`sanitize.ts`): no `<script>`, event handlers, iframes, `<base>`, `javascript:`/`data:` URLs; CSS `@import`/`expression` removed; forms are rebuilt to POST only to our lead endpoint; password and file inputs removed. The sanitizer is idempotent and runs on every save and again when rendering. The only `data-*` attributes that survive are Keplar's own effect hooks (`data-kfx`, `data-kfx-effect`, `data-kfx-shape`, `data-reveal`, `data-reveal-delay`, `data-parallax`), each value-checked.
- **Isolation:** every page is served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https:; sandbox allow-forms allow-popups ...; frame-ancestors`, so it runs in an opaque origin with no script. The preview iframe also carries `sandbox="allow-forms allow-popups"` (no same-origin, no scripts). **Exception, opt-in per site:** when the owner enables effects (Style tab) and a page has effect hooks, that page alone is served with `script-src 'self'` and `allow-scripts` added to the sandbox (still no `allow-same-origin`, no inline script, no user script); the one script tag is Keplar's own `/fx/kfx.1.js`. Default sites, legacy template sites, pages without hooks, thumbnails and intensity 0 stay script-free (`fxActive()` in `render.ts`, tested in `tests/site-quality.test.ts`). Also and loads `/sites/draft/<id>/<version>/<page>?t=<token>` with a short-lived HMAC token (the iframe has no cookies). Mobile menus therefore use CSS only.
- **Published URL:** `/s/<slug>` (path-based; reserved words and look-alikes are refused). Search indexing is off unless the owner turns it on in SEO. `robots.txt` and `sitemap.xml` are served per site.
- **SEO:** site title, description, link-preview image and per-page overrides, injected into `<head>` with canonical and Open Graph tags.
- **Leads:** forms post to `/s/<slug>/_lead` (outside `/api` because sandboxed pages send `Origin: null`, which the proxy's origin check would reject). Honeypot field, per-IP and per-site rate limits, stored in Neon, listed in the Leads tab and exported as CSV (formula-injection safe).
- **Publishing rules:** verified email required; a scan (`safety.ts`) blocks card/ID/seed-phrase/password collection, look-alike sign-in pages for known brands, malware file links, URL shorteners, raw-IP links and scam wording; "review" verdicts publish and queue for a human look. Free can publish 1 site.
- **Abuse:** every published page has a "Report abuse" link to `/s/<slug>/_report`; reports are stored in `create_abuse_reports`; CSAM/NCII reports take the site down immediately and alert the owner.
- **Export:** `/api/sites/:id/export` returns a ZIP of the current version; the Code tab shows each file.
- **Env vars:** `OPENROUTER_API_KEY` (required for AI builds), `DATABASE_URL`, optional `KEPLAR_OPENROUTER_BASE` (tests/mocks), `KEPLAR_SITE_CONFIRM_UNITS`. Preview tokens are signed with a key derived from the auth secret (`BETTER_AUTH_SECRET`).
- **Custom domains** (Plus/Pro/Business): see `docs/custom-domains.md`. Proxy rewrite from the customer's Host to `/s/<slug>`, DNS records from Vercel's API, ownership TXT, Verify button and a background re-check.
- **Discovery -> brief -> build.** The Create start screen asks 3 to 6 specific questions (tappable chips + free text, each skippable, "Just build it" skips all), then shows an editable **brief** (`brief.ts`: name, goal, audience, tone, pages, real content, style direction, motion) with the credit estimate; "Approve and build" sends the brief to `/api/sites/:id/generate` and the model works from it. Discovery (`POST /api/sites/discover`) is deterministic and free (no model call), rate limited, and the idea passes the same prompt safety check. The brief is stored on the site; the build goes through the normal estimate / confirm / cooldown / credits path.
- **Design system.** `design.ts` has 8 style directions (Google font pairings, contrast-verified palettes: ink 12:1, muted 4.5:1+, accent text 4.5:1, all tested for light, dark and custom accents), `design-css.ts` is the primitive layer (fluid type scale, spacing scale, `.k-*` layout primitives with variety, reduced-motion, focus rings) written into `styles.css` between sentinel rules and re-applied without a model when the style changes (`POST /api/sites/:id/design`, new version, no credits). The generator prompt (`generate.ts`) forbids purple gradients, emoji icons, card-grid clichés, lorem and invented testimonials/stats/claims; with no real facts it writes marked `k-todo` placeholders.
- **Quality pass.** After generation `lint.ts` checks lorem, emoji, cliché copy, invented proof, purple gradients, card grids, missing alt/labels/landmarks/headings, fixed widths and overflow risks, and the contrast of the tokens; `fixSite` repairs what is mechanical, **one** model repair pass (charged, shown in the estimate's high end) handles the rest, then a deterministic final pass removes unverified quotes. The result (`LintSummary`) is stored on the version and shown in History and the Style tab. Legacy sites (no `design`) are never restyled or repaired unless the owner picks a style.
- **Effects (three.js).** `public/fx/kfx.1.js` (3.5 KB) reads hooks and runs reveals, parallax and lazily starts scenes; `public/fx/kfx-gl.1.js` (three.js, tree-shaken, 553 KB / 140 KB gzip) loads only when a visitor scrolls near the hero, via `IntersectionObserver` + idle callback. Four scenes (particles, lattice, wire form, contours) with hard-edged points (no haze/bloom), DPR cap, frame-time governor that downgrades then freezes, pause when hidden, context-loss handling, reduced-motion and Save-Data/slow-connection/weak-device stills, fewer points on phones, at most 2 canvases, no layout shift (canvas is absolutely positioned). Per-site toggle, intensity 0 to 100 and effect in the Style tab; off by default unless the brief asks for motion. Rebuild with `npm run fx:build` (esbuild).
- **Projects.** Projects page lists the account's sites (thumbnail = sandboxed script-free render, status Live/Draft/Needs update, versions, messages, last change), search and filters, Resume in Create, Rename, Duplicate (`POST /api/sites/:id/duplicate`), Archive/Restore (`PATCH archived`, not allowed while published) and a per-site drawer: artifacts (live URL, ZIP, leads CSV), versions with their quality result, and real activity (`GET /api/sites/:id/activity`: created, versions, publish, leads).
- **Video** is Beta through Higgsfield (`docs/video-higgsfield.md`): the studio shows "Not configured" until `HIGGSFIELD_API` is set; nothing fake is shown.

## 9. Images (stage 2, live on Vercel)

Prompt -> a real generated image, stored in Neon, served from authenticated routes, kept as versioned history, and insertable into a site. Code: `src/lib/images/`, routes `src/app/api/images/**` and `src/app/i/[token]`, UI `src/components/create/ImageStudio.tsx` (the **Images** tab in Create).

**Provider and model.** OpenAI Image API, `POST /v1/images/generations`, model **`gpt-image-1-mini`** (the cheapest GPT-image model that is good enough for site art), `quality: high` and `1536x1024` by default (its largest size), `output_format: png` (lossless: stored and served byte for byte, never re-encoded), `moderation: auto`, `n: 1`. Needs only `OPENAI_API_KEY` (already in Vercel production). The earlier OpenRouter/disk media code (`src/lib/create/media.ts`) stays off on Vercel and is not used. Kill switch: `KEPLAR_IMAGES_OFF=1`.

| | High (`high`, default) | Standard (`medium`) | Draft (`low`) |
|---|---|---|---|
| Square 1024x1024 | $0.036 = 20 credits (est.) | $0.011 = 7 | $0.005 = 3 |
| Wide 1536x1024 (default) / Tall 1024x1536 | $0.052 = 29 | $0.015 = 9 | $0.006 = 4 |

The estimate is the published price x 1.1 margin; the charge is the real cost computed from the `usage` tokens the API returns (output image $8/1M, text input $2/1M), at most 3x the table price, so it is normally a little below the estimate (a High wide image is about 28 credits, a Standard square about 5). High is about 3.5x Standard per image; the default moved from Standard Square to High Wide on 2026-10-03 (about 4.7x the table price). Full numbers in `docs/cost-model.md`.

**Plans.** Free: not available (clear upgrade message, HTTP 402 `entitlement`, nothing is called). Plus: 15 images/day (at most 6 High), 1 at a time, 3/min, 600-char prompts, 80 saved images / 250 MB. Pro: 40/day (16 High), 2 at a time, 4/min, 1,000 chars, 200 / 600 MB. Business: 80/day (32 High), 3 at a time, 6/min, 400 / 1.2 GB. Admin (`team@keplar.one`): treated as Business but exempt from the daily image count; still bound by the $25/day admin cap, the cooldown exemption rules in `docs/cost-model.md`, the breaker and the ops switches. Limits live in `src/lib/images/config.ts`.

**Job flow (all states come from the backend).**
1. `POST /api/images/estimate` -> credits for the chosen shape/quality and what is left today.
2. `POST /api/images` with `confirmUnits` equal to the estimate (else 409 `confirm` with the current estimate) and an `idempotencyKey`. Refusals are plain JSON errors: 402 plan/credits/breaker, 429 cooldown / rate / daily cap / concurrency / retry storm, 413 prompt or library size, 422 local safety rules, 503 ops pause. Success: 202 with the job, status `understanding`.
3. In the background (`after`): **UNDERSTANDING** (prompt moderation, spend gates re-checked) -> **GENERATING** (provider call, 140 s timeout; High takes about 40 s) -> output moderation, store, charge, **READY**; or **FAILED** with a friendly message. The client polls `GET /api/images/:id` every 1.5 s; no percentages are shown, only the real state and elapsed time. Reloading the page resumes any running job. A job with no heartbeat for 170 s is failed on read ("took too long, nothing was charged").
4. Credits are charged **only when the image is READY**. Refused, blocked, failed or timed-out jobs cost the user nothing (a provider cost incurred anyway is recorded in the global daily spend, not charged to the user).

**Idempotency / retry storms.** The job id is `sha256(workspace, idempotencyKey)`, inserted with `insertIfAbsent`, so a repeated request returns the same job and never generates or charges twice. Four failed jobs in 10 minutes pause the account for the rest of the window (`failing`, 429). Per-minute limits use the shared rate limiter. Concurrency uses numbered job slots (`img0..`, separate from site-build slots) with a 3-minute expiry.

**Cooldown / breaker / caps.** Every job goes through `assertCanSpend(..., {paidMedia: true, kind: "media"})` at request time and again before the provider call: ops kill switches and provider/model disable (`openai`, `gpt-image-1-mini`), the Keplar usage cooldown, 5-hour/weekly windows, monthly credits and the admin $25/day cap. The global daily budget does not pause image generation. Charges go through `charge()` so they count in the ledger, windows, global spend and the cooldown velocity.

**Safety.** (1) Local rules before anything is called: sexual content, minors, deepfake/face-swap, graphic violence, real-person likeness (named people after "photo/portrait/... of", "looks like <Name>", public roles such as president or celebrity, "lookalike", "fake photo") -> 422 with a clear message. This is a heuristic (it can refuse a Title Case phrase such as "photo of Summer Sale"); the message tells the user to describe a fictional person or scene. (2) OpenAI `omni-moderation-latest` on the prompt, **fail closed** (if it cannot be reached the job fails with "try again", nothing charged). (3) The image API's own `moderation: auto`. (4) `omni-moderation` on the finished image (text+image); a flagged image is dropped and not stored or charged. (5) Output bytes are identified by magic number (png/webp/jpeg only), max 4.3 MB. (6) The `user` field sent to OpenAI is a salted hash of the workspace id. Prompts, keys and provider error bodies are never logged or returned; the key is only sent to `api.openai.com` (the base URL cannot be overridden in production).

**Storage and serving.** Bytes in Neon table `keplar_images` (`bytea`, created on first use; local dev/tests use files in the data dir); metadata and history in `keplar_rows` collection `img_jobs`. `GET /api/images/:id/file` is owner-only (`private, max-age=31536000, immutable`, ETag/304, `nosniff`, sandbox CSP, `?download=1` for the original file; the Images tab has a **Download original** button and click-to-view full size). Regenerating makes a new version in the same history (`rootId`); every version can be downloaded, used or deleted.

**Use in my site.** `POST /api/images/:id/use {siteId, page, placement}` inserts a sanitized `<figure><img>` under the first heading or at the end of `<main>` as a new site version (kind `edit`, so it is in History and undoable) and makes that one image public at `/i/<128-bit id>` (`public, immutable`, `Cross-Origin-Resource-Policy: cross-origin` because published pages are sandboxed, cookie-less documents). Deleting an image used in a site needs `?force=1`.

**Tests.** `tests/images.test.ts`: cost/limits/gating/safety units; integration through the route handlers with a mocked OpenAI (end to end, confirm, idempotency, moderation fail-closed, output moderation, provider failures and retry storm, concurrency, daily cap, storage quota, breaker levels, ops pause, cooldown, admin cap, regenerate/history, stale jobs, site insertion + public route, log hygiene) and the bytea store against PGlite. **Not tested here:** a real OpenAI call (no key on the build box); the first production image is the live check.


## 10. Product import (link or photo)

Start Create from a real product instead of a description. On the first step, **Start from a product** takes a **product link**, or a **photo** (choose, paste or drag one in). The result is an editable **Imported product** card; the discovery questions and the brief are then built around it. Code: `src/lib/site-builder/product/`, routes `src/app/api/sites/import/{link,image,analyze}` and `src/app/api/sites/assets/[id]`, UI `src/components/create/ProductImport.tsx` (+ `Discovery.tsx`), docs for site owners at `/bot`.

**Link import (`POST /api/sites/import/link {url}`).** The server fetches the page and nothing else sees the network: `fetch.ts` uses the shared SSRF-safe `safeFetch` (public IPs only, name resolved on every hop and the socket pinned to the validated address, redirects re-validated, https only in production), **robots.txt for `KeplarBot`** (RFC 9309: longest match, `Allow` beats `Disallow` on a tie, 404 = allowed, 5xx or unreachable = not allowed; checked for the page, again before following any redirect, and for each image host), `noai` (meta or `X-Robots-Tag`) refuses the page and `noimageai` keeps its images out, no cookies / Authorization / Referer ever, 12 s page timeout, 1.8 MB read cap, HTML only (`text/html`, `application/xhtml+xml`), at most 4 redirects, an identifying User-Agent (`KeplarBot/1.0 (+https://keplar.one/bot; …)`). `extract.ts` is a defensive hand-written scanner (nothing executes, every string bounded, every URL resolved and http(s) only): JSON-LD (`Product`, `ProductGroup`, `Book`, `@graph`, offers arrays, `priceSpecification`, variants), Open Graph and `product:*` meta, microdata, then plain markup (`<h1>`, option `<select>`s, feature lists, `<img>`). It returns name, brand, description, price, currency, availability, options, features, images and a short **excerpt** of the page text. The excerpt is shown to the owner and **never sent to a model**; only what the owner leaves in the card goes into the prompt. Listed thumbnail addresses (`?width=100`, `_100x100`) are retried at a larger size. Failures return a plain-language reason (`error`, `code`, `manual: true`): blocked by robots, needs login or blocks bots (401/403), not found, slow, too large, not a web page, private address, nothing readable.

**Photos from the page** (up to 4 on Free … 10 on Pro, `PRODUCT_LIMITS`) are downloaded server-side and copied into Keplar's storage as **private** images owned by the workspace (the same `keplar_images` table as generated images); the card shows them from `/api/sites/assets/<id>` (owner only). They are never hotlinked. The same image is not downloaded twice (hash, and by source address when the page is imported again).

**Photo import (`POST /api/sites/import/image`, raw bytes).** PNG, JPEG, WebP, GIF, AVIF are accepted by their magic bytes (never the header or file name); SVG, HTML, PDF and anything else are refused, as are decompression bombs (80 MP) and thumbnails (< 32 px). Quality: a PNG/JPEG/WebP that is at most 4096 px and 4.3 MB is stored **byte for byte** (and is what `?download=1` returns). Only these change: GIF/AVIF become PNG (lossless), a side above 4096 px is scaled once, a file above 4.3 MB loses resolution before quality (never below q88, 4:4:4), and a **JPEG carrying GPS location is re-encoded without metadata** (q98, 4:4:4; the card says "Location data was removed"). The browser sends the original file when it fits the 4.5 MB request limit, otherwise fits it first (the same pipeline as chat attachments).

**Reading the photo (`POST /api/sites/import/analyze {assetId}`), optional.** One vision call suggests name, description, features and alt text (JSON only, "describe only what is visible", text inside the photo is data). The model sees a 1280 px copy; the stored photo is untouched. Free plan: free vision models only ($0, not charged). Paid plans: Gemini 3.8 Flash (about $0.003, 1 to 2 credits), charged through `charge("photo.read")` with the real `usage.cost`; failed calls that were billed are charged, others cost nothing; `assertCanSpend` (cooldown, breaker, credits) runs first. The answer only fills **empty** fields, and says it can be wrong.

**The card.** Everything is editable: name, brand, description, features (one per line), price + currency, read-only options (a variant picker does not work on a generated page), the Buy setting, the selected photos, the hero, per-photo alt text. Photos open in the full-size viewer. **Buy button:** *link* (default: the original product page; or paste a Stripe / Whop / any payment link, because Keplar sites have no built-in checkout), *inquiry* (leads to the contact page) or *checkout link later* (a marked `k-todo` placeholder). **Price:** only a price found on the page or typed by the owner is used, shown as `$24.00`, with "as listed on <host> on <date>" in the prompt and "Prices change; check before publishing" in the card; with none, the page shows a marked placeholder and the generator is told not to invent one. **Rights:** the card says to import only images you hold the rights to, that photos are copied to Keplar storage (not hotlinked) and become public at `/i/<id>` once a site uses them, and requires the **"I own these photos or have permission"** box before Continue. The **server enforces it too**: a build whose product has `rightsConfirmed !== true` drops every image.

**Discovery and brief.** With a product, `planQuestions` asks five page-level questions (goal, audience, tone, pages, how the photos are used) instead of purpose / content; the Buy question's first choice follows the Buy setting; `buildBrief` sets kind to shop and pre-fills name, "what it is" and goal; the product rides on `brief.product` (stored per site), and the card stays editable in the review step. `briefToPrompt` appends a `<product-data>` block (angle brackets stripped, labelled as data, not instructions), the exact hosted image URLs with alt text and hero, a required `#product` section and the Buy button rules ("no cart, no payment form").

**Build.** `prepareJob` runs `verifyProduct`: images must be this workspace's own stored assets (others' ids are dropped), at most the plan's per-site cap, then each is attached to the site and made public. After generation `ensureProduct` (no model) guarantees the `#product` section, the hero `<img src="https://keplar.one/i/<id>">` and the Buy link are present, and removes any `<img>` pointing at another website (stock photos). The product's own facts count as "given" for the invented-facts lint. Deleting a site deletes its product images unless a duplicate still shows them. Unselected or abandoned imports are deleted by the browser, and after 24 h by the server.

**Limits per plan** (`product/limits.ts`; Free / Lite / Plus / Pro / Business): page imports a day 5 / 15 / 40 / 100 / 200; photo readings a day 5 / 15 / 40 / 100 / 200; photos on one site 3 / 6 / 10 / 16 / 24; photos pulled from one page 4 / 6 / 8 / 10 / 10; images imported a day 12 / 30 / 80 / 200 / 400; stored product images 8 / 30 / 80 / 200 / 400 and 24 / 90 / 250 / 600 / 1,200 MB; plus per-minute rate limits per route. Over a limit the answer is HTTP 402 with the number and the next plan. Known limits: pages that render their content with JavaScript give little data (the card says so and offers manual entry); a price listed only by script is not found; robots.txt and `noai` are the only "terms" signals read, so the rights checkbox is the owner's responsibility.
