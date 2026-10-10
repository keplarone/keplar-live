# Measurement: from search result to first answer

What we can and cannot see, how to switch on the outside tools, and what Keplar records itself.

## 1. Tools the owner must set up (nothing here has been done on the owner's behalf)

### Google Search Console
1. Go to <https://search.google.com/search-console> and add a property. Preferred: **Domain property** for `keplar.one` (verify with a DNS TXT record at the domain registrar). Alternative: **URL-prefix** property `https://keplar.one/` with the HTML-tag method.
2. HTML-tag method: Search Console gives a token. In Vercel → Project → Settings → Environment Variables (Production) add `GOOGLE_SITE_VERIFICATION=<token>` and redeploy. The site renders the `google-site-verification` meta tag only when this variable is set (`src/lib/site.ts`).
3. Sitemaps → submit `https://keplar.one/sitemap.xml` (33 URLs at 3 Oct 2026; dates are real content dates).
4. URL Inspection → "Request indexing" for the new pages: `/superintelligence`, `/ai-vs-agi-vs-superintelligence`, `/si-vs-ai`, `/multi-model-ai`, `/models`, `/about`.
5. Later: Performance → export queries and pages (see `WEEKLY-REVIEW.md`); Pages (indexing) report for "Crawled, currently not indexed" and "Duplicate" states.

### Bing Webmaster Tools
1. <https://www.bing.com/webmasters> → add site (or import from Search Console).
2. Verification by meta tag: set `BING_SITE_VERIFICATION=<token>` in Vercel (supported in `src/lib/site.ts`), redeploy, then verify.
3. Submit `https://keplar.one/sitemap.xml`.
4. **IndexNow**: the key file is `https://keplar.one/794a2fb6c986d2a4fdc970229ac50be4.txt`. After deploy run `node scripts/indexnow.mjs --all`. The script checks that the key file is live first and prints "accepted" only if the endpoint answers 200 or 202. IndexNow is used by Bing and some other engines; **Google does not use it**.

### Not available to us (so not claimed)
Search volume, rankings, impressions, clicks, Core Web Vitals field data (CrUX) for keplar.one. Until Search Console is verified, every number about search performance is "to measure".

## 2. What Keplar records itself (first-party, consent-gated)

| Event | When it fires | Fields stored |
|---|---|---|
| `landing_view` | First public page of a browser session (not internal navigation) | event, landing path, source class, random browser id, utm_source, utm_campaign, day |
| `cta_click` | A tracked "try Keplar" button (existing `track("cta_click")` calls) | same + placement (e.g. `si-vs-ai:hero`) |
| `signup_complete` | `/welcome` loads (only new accounts reach it) | same, attributed to the stored landing page; reported once per browser |
| `first_prompt` | The `keplar:send` event fires in `/app` (carries no text) | same; once per browser |
| `synthesis_success` | A completed synthesized answer appears in `/app` | same + answer level (`simple`/`moderate`/`complex`); once per browser |

- **Source class** is one of `search`, `ai` (AI assistants), `social`, `direct`, `internal`, `other`, derived in the browser from `document.referrer`. The referrer URL itself is never sent or stored.
- **Never stored:** question text, answers, files, email, account id, IP address, full URLs with query strings.
- **Consent:** the browser sends nothing unless the visitor allowed Analytics in the cookie banner. The server checks the consent cookie again and ignores requests that carry Global Privacy Control (`Sec-GPC: 1`) or Do Not Track (`DNT: 1`). The privacy page and cookie banner describe it.
- **Storage in the browser:** `keplar_vid` (random id), `keplar_lp` (first landing page, 30 days), `keplar_seo_done` (which one-time milestones were reported). Cleared when the visitor clears site data.
- **Server:** collection `seo_events` (workspace `system`; no link to an account). Endpoint `POST /api/seo/event`: same-origin only, allow-list validation, 1 KB cap, 40 requests/minute/IP, always answers 204. Rows are deleted after **180 days** (`KEPLAR_RETAIN_SEO_EVENTS_DAYS` changes it), pruned hourly by the existing retention trigger. Listed in `src/lib/privacy/account-data.ts` as a retained, non-exported collection because it holds no account data.
- **Report:** `/admin/seo` (admin only): per landing page, distinct browsers for views, views from search, views from AI assistants, CTA clicks, sign-ups, first questions and answers shown, plus a 90-day freshness list.
- **Limits:** counts only cover visitors who allowed Analytics, so they are a floor and over-represent privacy-indifferent visitors. Each step is "distinct browsers", so one person on two devices counts twice. Visitors who allow Analytics after landing appear as `(unknown)`. Do not compare pages until each has a few hundred visits.
- **Verified locally** (production build, headless Chromium, 3 Oct 2026): with no consent nothing is requested; with consent a visit from `google.com` stored `landing_view` with `src: search` and the UTM tags; a click on a tracked button stored `cta_click` with its placement; the `keplar:send` event stored `first_prompt` attributed to the original landing page after in-app navigation. Not tested end to end: a real sign-up (`signup_complete`) and a real synthesized answer (`synthesis_success`), because those need an account and live model keys; both are unit-level only.

## 3. Branded vs non-branded
Search Console cannot split these on its own. In Performance → Queries use the filter "Queries not containing" `keplar` (non-branded) and "Queries containing" `keplar` (branded). Report both separately. The superintelligence cluster should be judged on non-branded queries; branded queries measure awareness.

## 4. Technical monitoring
- `node scripts/seo-crawl.mjs https://keplar.one --json out.json` (status, canonical, title/description length, headings, JSON-LD validity, X-Robots-Tag, sitemap vs. lastmod).
- Lighthouse (`scripts/lh-summary.mjs` summarises a folder of JSON reports). Lab only; field data comes from Search Console's Core Web Vitals report once enough visits exist.
