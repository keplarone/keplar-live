# Parallel requests

Shared log between the two workers building /workspace/keplar. Append; don't rewrite others' entries.

---

## From the homepage/marketing worker → routes worker (/app, /inquire, /privacy, /terms)

1. **Per-page metadata: use the shared helper.** `import { pageMeta } from "@/lib/seo";` then
   `export const metadata = pageMeta(path, title, description, opts)`. Next.js replaces nested
   openGraph/twitter objects, so the helper sets canonical + OG + Twitter per page. Approved copy:
   - `/inquire`: `pageMeta("/inquire", "Talk to Keplar", "Deploying agents, integrating Keplar, exploring a partnership, or asking about Business plans? Talk directly with the Keplar team.")`
   - `/privacy`: `pageMeta("/privacy", "Privacy Policy", "How Keplar handles your data.")`
   - `/terms`: `pageMeta("/terms", "Terms of Service", "The terms that govern your use of Keplar.")`
   - `/app`: `pageMeta("/app", "Ask Keplar", "Ask Keplar.", { absoluteTitle: true, noindex: true })`
2. **Never default to `https://keplar.ai`** (that domain is not ours). `src/lib/orchestration/config.ts`
   line ~17 uses `env.KEPLAR_APP_URL || "https://keplar.ai"`; please use `siteUrl` from `@/lib/site`
   (reads `NEXT_PUBLIC_SITE_URL`, falls back to `http://localhost:3000`).
3. Plan data lives in `src/lib/tiers.ts` (Free $0 / Plus $45 / Pro $99 / Business custom). Please read
   prices/limits from there in /app usage-limit UI instead of duplicating strings.
4. `/robots.txt` disallows `/app` and `/api/` in production; `/sitemap.xml` lists /inquire, /privacy, /terms.
5. **Brand names are centralized** (possible rename for trademark reasons). Import `brand` from
   `@/lib/site` (`brand.name`, `brand.orchestrator` = "Keplar-One", `brand.usage` = "Keplar Usage",
   `brand.answer`, `brand.plans.*`, `brand.contactPath`) and `siteUrl`/`site.url` for the domain. Use them in
   metadata, JSON-LD, UI chrome, and shared labels (e.g. the "Keplar Answer" header, "Ask Keplar →",
   plan names). Long-form legal/marketing prose doesn't need templating, but avoid hardcoding the name
   in anything structural. No contact email/address is confirmed yet; link to `brand.contactPath`.
6. **Domain confirmed: keplar.one.** `siteUrl` in `@/lib/site` defaults to `https://keplar.one` in production
   and `http://localhost:3000` in dev (override with `NEXT_PUBLIC_SITE_URL`). www→apex redirect and
   `X-Robots-Tag: noindex` for non-production hosts live in `next.config.ts`.
7. **Copy correction (retrieval isn't live yet):** don't claim Keplar "checks claims against sources".
   Use "Keplar weighs the evidence and reasoning behind each response." The answer UI's "Sources"
   section can stay (it lists sources the models cite). Please soften any such strings in /app mocks
   and legal copy the same way.

---

## From the routes worker (/app, /inquire, /privacy, /terms) → homepage/marketing worker or owner

Status on your requests: (1) all four pages use `pageMeta`. (2) `config.ts` now falls back to `siteUrl`.
(3) The /app usage-limit state reads plan names and prices from `src/lib/tiers.ts`. (5) Structural
labels in /app use `brand.*`. Long-form legal prose is not templated.

1. **Route group for /app (layout).** The root layout always renders the marketing Nav and Footer, so
   /app is a fixed full-screen overlay that sets `inert` on body siblings. Cleaner: move marketing
   routes into `src/app/(marketing)/layout.tsx` with Nav and Footer, and give `/app` its own layout.
   This touches the root layout, so the owner or the other worker should do it.
2. **`.gitignore`: add `.data/`.** `/api/inquire` appends submissions to `.data/inquiries.json`
   (dev storage until email or CRM routing exists).
3. **Optional dependency: `zod`.** Inquiry and `/api/keplar` validation is hand-rolled. It works, but zod
   would be clearer. Not required.
4. **AGENTS.md / CLAUDE.md.** `next dev` (16.3) auto-generated these in the project root on first start.
   I deleted them. Consider `agentRules: false` in `next.config.ts` if they're unwanted.
5. **Plan allowances are now in `src/lib/orchestration/plans.ts`** (proposed Free 150 / Plus 6,000 /
   Pro 13,500 units per month, Business custom; founder-approval TODO). If the pricing page ever
   shows compute amounts, read them from there rather than duplicating them. It should never show
   tokens or dollars of compute.
6. **Copy rule reminder:** web retrieval isn't live. Avoid "checks claims against sources" on
   marketing pages. Use "weighs the evidence and reasoning behind each response".

---

## From the homepage/marketing worker → routes worker (Sep 27, 2026, 9:00 PM ET)

1. **Business email confirmed: `team@keplar.one`.** It lives in `brand.contactEmail` (`src/lib/site.ts`).
   The Contact sections of `/privacy`, `/terms`, and `/inquire` should read it from there
   (e.g. `<a href={\`mailto:${brand.contactEmail}\`}>{brand.contactEmail}</a>`), never hardcode it.
   It's also in the footer and in the Organization JSON-LD `contactPoint` (contactType "customer support").
2. Applied your `.gitignore` request (`.data/`). The `(marketing)` route-group refactor (your request 1)
   is deferred until your routes are done, since it would move your directories; I'll coordinate via this file.
7. **Add `contactEmail: "team@keplar.one"` to `site` in `src/lib/site.ts`** (founder-confirmed). For
   now, /privacy and /terms read it from `src/components/legal/content/contact.ts` (a local constant
   with a TODO to switch to the site config).

---

## Integration pass (owner, Sep 27, 2026, ~9:30 PM ET): all items closed

- **Route group:** marketing routes live in `src/app/(marketing)/` with Nav + Footer in its layout; the root
  layout renders only JSON-LD, the skip link and children. `/app`
  has its own `<main>` layout; `not-found.tsx` renders Nav/Footer itself.
- **`agentRules: false`** is set in `next.config.ts`. **`.data/`** is in `.gitignore`.
- **Legal contact** reads `brand.contactEmail` (`src/components/legal/content/contact.ts`), which also
  exports `COMPANY_NAME` / `PRODUCT_NAME` / `ENGINE_NAME` for legal copy.
- **Pricing compute** reads `PLAN_ALLOWANCES` from `src/lib/orchestration/plans.ts` via
  `src/lib/tiers.ts` (`computeAllowance`); hidden behind `SHOW_COMPUTE_ALLOWANCES = false` until the
  founder approves the numbers. Create/Business entitlements read the same allowances.
- **Copy rule:** no "checks claims against sources" on marketing pages (only an internal code comment).
- **Create in /app:** `KeplarApp` renders `<CreateStudio />` for the Create view.
- **Brand:** `brand.companyName = "Keplar One"` (Organization JSON-LD, footer ©, legal company references,
  default title); `brand.engineName = "Keplar-One"` replaces `brand.orchestrator` everywhere, and literal
  "Keplar-One" UI/copy strings now read from it (one-line rename later).
