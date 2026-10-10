# Custom domains for published sites

Status: live for Plus, Pro and Business. A published Create site (`/s/<slug>`) can also be served from the owner's own domain, with HTTPS from Vercel.

## What the user does
Create → site → **Publish** tab → **Custom domain**: type a domain (`example.com` or `shop.example.com`), add the DNS records shown, press **Verify** (or wait; a background job re-checks). Remove disconnects it.

States: **Waiting for DNS** (pending), **Checking…** (verifying), **Active**, **Needs attention** (error: never set up after 7 days, or a provider problem; Verify retries).
DNS changes can take minutes to hours to spread. HTTPS is issued automatically by Vercel once DNS is correct; the first visit can take a minute.

## DNS records (three kinds, all shown in the UI with copy buttons)
| Record | Where it comes from |
|---|---|
| Apex domain: `A @` → address from Vercel's config (`recommendedIPv4`, rank 1; currently `216.198.79.1`, the older `76.76.21.21` also works) | `GET /v6/domains/{domain}/config` |
| Subdomain: `CNAME <sub>` → target from Vercel's config (`recommendedCNAME`, rank 1; the older `cname.vercel-dns.com` also works) | same |
| `TXT _keplar-verify.<host>` = `keplar-verify=<token>` (per domain, random) | Keplar |
| Only if Vercel asks: `TXT _vercel.<domain>` = `vc-domain-verify=…` (domain already used by another Vercel account) | Vercel project domain `verification` |

Why Keplar's own TXT: every customer domain lives in one Vercel project, so Vercel can't tell customers apart. Without proof of ownership a user could claim a hostname whose DNS still points at Vercel (a dangling CNAME). The TXT is read over DNS-over-HTTPS (`src/lib/domains/dns.ts`) from Google and Cloudflare at the same time; a record seen by either counts. With Cloudflare, set the records to **DNS only** (grey cloud) or Vercel reports the domain as misconfigured.

## How "pointed at Keplar" is decided (A / CNAME row)
Two sources, every check, nothing cached on our side (no-store fetches, a random cache-busting parameter on Google's resolver):
1. **Vercel's domain config** (`GET /v6/domains/{d}/config?projectIdOrName=…`): `misconfigured:false` = pointed (source of truth). Its `recommendedIPv4` / `recommendedCNAME` (rank 1 first) are what the table shows to enter; the other accepted values are listed as "Also accepted". Its `conflicts` list is used too.
2. **Live DNS** for the hostname (A, AAAA, CNAME chain) and the domain's NS, from Google (8.8.8.8 DoH) and Cloudflare (1.1.1.1 DoH). If every resolver that answers shows only Vercel addresses (recommended values or anything in Vercel's ranges 76.76.21.0/24, 216.198.79.0/24, 64.29.17.0/24) or a CNAME to a Vercel target, and no AAAA, the row is "Found" even if Vercel's own check lags behind.
The row shows what was actually found ("Found at your domain right now: …") and `src/lib/domains/diagnose.ts` names the specific problem: **conflicting extra A record** (e.g. the old Shopify IP next to Vercel's: this was the live report, telebuddies.fun had `216.198.79.1` and `23.227.38.65`), **wrong A / CNAME value**, **Cloudflare proxy on** (Cloudflare addresses returned), **AAAA pointing elsewhere**, **record on the wrong name** (`example.com.example.com`, `www`, or the apex instead of the subdomain), **no record at all** (with where the DNS is hosted, from NS), **resolvers disagree** (still spreading), **resolvers unavailable**. Each has "what to do" text.
The button is **Check again** (`POST /api/domains/:id`): always re-checks DNS and Vercel immediately, no 8 s throttle (still 40 per 10 min per account). The 15 s poll while pending still uses the ~20 s throttle.

## Rules
- Hostname validation (`src/lib/domains/hostname.ts`): lowercase ASCII, letters/digits/hyphens, ≥ 2 labels, TLD letters only. Rejected: URLs, ports, paths, `@`, wildcards, underscores, IPs and numeric names, any `xn--`/IDN label, reserved TLDs (`.test`, `.local`, …), bare public suffixes (`co.uk`), `keplar.one`, `keplar.site`, `vercel.app` and other shared-hosting suffixes.
- **One owner per domain:** unique index on `keplar_domains.hostname` (checked on insert, so it holds under races).
- **Limits per plan** (`src/lib/domains/limits.ts`, also `ENTITLEMENTS.customDomains`): Free 0 (add form shows an upgrade note, API answers 402), **Plus 1, Pro 3, Business 10**. Admin accounts count as Business. The limit is per account across all its sites; it is enforced atomically in the insert.
- Needs a verified email and a *published* site.
- If a plan is downgraded, domains over the new allowance (newest first) and all domains on Free stop serving but stay stored.

## Server
- Table `keplar_domains` (created on first use like `keplar_images`): `id, user_id, workspace_id, project_id (= site id), hostname UNIQUE, status (pending|verifying|active|error), ownership_token, ownership_verified, verification jsonb (Vercel's state + DNS to show), last_error, last_checked_at, next_check_at, verified_at, created_at, updated_at`. Without `DATABASE_URL` a JSON file in the data dir is used (dev/tests).
- Vercel REST (`src/lib/domains/vercel.ts`), env `VERCEL_DOMAINS_TOKEN` (secret), `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`: `POST /v10/projects/{id}/domains`, `GET /v9/projects/{id}/domains/{d}`, `POST …/verify`, `GET /v6/domains/{d}/config`, `DELETE /v9/projects/{id}/domains/{d}`. The token goes only into the `Authorization` header; it, bodies and Vercel's error bodies are never logged or returned.
- Routes: `GET/POST /api/domains`, `GET/POST/DELETE /api/domains/:id` (GET = status poll, POST = Verify, throttled to one real check per 8 s), `GET /api/cron/domains` (Vercel Cron once a day at 05:17 UTC because the Hobby plan allows only daily crons; on Pro change `vercel.json` to `*/10 * * * *`; `CRON_SECRET`. While the Publish tab is open the 15 s status poll does the due re-checks, so the cron is only the catch-all for closed tabs). All owner-scoped: another account's ids answer 404.
- Re-check schedule: every 5 min for the first hour, 30 min for a day, then every 3 h; stops after 7 days (status error; Verify restarts). Active domains are re-checked every 6 h. A provider outage never downgrades a working domain.
- Adding claims the hostname in our table first, then adds it to Vercel (removed again if Vercel refuses). Removing detaches from Vercel first (a failure keeps the row so the owner can retry). Deleting a site detaches its domains first.

## Routing and headers
- `src/proxy.ts` runs on every request except Next static assets. A Host that is not Keplar's own (`keplar.one`, `www`, `localhost`, `*.vercel.app`, `KEPLAR_APP_HOSTS`) is looked up (`src/lib/domains/routing.ts`, cached 30 s hit / 10 s miss per instance). Active → rewritten to `/s/<slug>/<path>`; anything else → plain 404. Only GET/HEAD/POST; `/s/<slug>/…` old links redirect to the clean path; `/fx/*.js` (Keplar's effects runtime) passes through. No app, admin or API route is reachable on such a host: every path is just a page of that one site (`/api/keplar` → "page not found").
- The `/s` route re-checks the Host itself, so a rewritten URL can never serve another tenant's site; lead form (`/_lead`), thanks and abuse report work on the domain; links, canonical, sitemap and robots use the domain at the root.
- Headers: the site's own sandbox CSP (no scripts, no frames), `nosniff`, `no-referrer`; HSTS `max-age=31536000` only (the app's `includeSubDomains; preload` is limited to Keplar hosts in `next.config.ts` so it can't affect a customer's other subdomains); the app CSP and the preview `noindex` header are not applied to customer hosts (the site's own robots meta/`robots.txt` decide; indexing is off unless the owner turns it on). Pages cache `s-maxage=60, stale-while-revalidate=300`; removing a domain can keep serving cached pages for up to ~6 minutes at the edge.

## Setup (once per environment)
Vercel project env (production): `VERCEL_DOMAINS_TOKEN` (encrypted), `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `CRON_SECRET` (random; Vercel Cron sends it as a bearer token). `vercel.json` registers the cron. Rate limits on Vercel's side: about 100 adds/hour and 50 verifications/hour per team; Keplar limits adds to 30/hour per account.

## Tests
`tests/domains-dns.test.ts` (address/CNAME classification and every diagnosis case, pure) and `tests/domains.test.ts` (validation, plan limits, cross-user authz, one owner per domain incl. races, mocked Vercel + DNS flows, background re-check, cron auth, host routing through the proxy and the `/s` route, lead form, downgrade/unpublish/remove, token never logged) and `tests/domains-store.test.ts` (the SQL against PGlite). Real API calls against Vercel with a throwaway hostname were run by hand (see the CP entry in `docs/revamp/CHECKPOINTS.md`); CI never calls Vercel.
