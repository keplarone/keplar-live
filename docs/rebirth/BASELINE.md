# Performance baseline (Project Rebirth, Phase 1)

Measured on 2026-10-15 against a local production build of `main` at `982ecf5` (`next build` + `next start`), with Lighthouse
12.8.2 in headless Chromium. The machine has no GPU and a slow, shared CPU, so absolute mobile numbers are pessimistic; use them
to compare before/after on the same machine, and use Vercel Speed Insights (already installed) for real-user p75 values.

SEO scores are low locally because search indexing is off outside production (`NEXT_PUBLIC_SITE_INDEXABLE`); they are not a
production finding.

| Page | Form | Perf | A11y | Best practices | LCP | TBT | CLS | FCP | Script transfer |
|---|---|---|---|---|---|---|---|---|---|
| `/` | mobile | 54 | 100 | 96 | 5.5 s | 1,140 ms | 0 | 2.0 s | 259 KB |
| `/` | desktop | 99 | 100 | 96 | 0.9 s | 0 ms | 0 | 0.5 s | 274 KB |
| `/pricing` | mobile | 75 | 100 | 96 | 4.1 s | 390 ms | 0 | 2.0 s | 263 KB |
| `/pricing` | desktop | 99 | 100 | 96 | 0.9 s | 0 ms | 0 | 0.5 s | 274 KB |
| `/signin` | mobile | 75 | 100 | 100 | 4.2 s | 410 ms | 0 | 2.0 s | 287 KB |
| `/signin` | desktop | 99 | 100 | 100 | 0.8 s | 0 ms | 0 | 0.5 s | 311 KB |
| `/space-studio` | mobile | 74 | 100 | 96 | 4.9 s | 300 ms | 0 | 2.0 s | 453 KB |
| `/space-studio` | desktop | 97 | 100 | 96 | 1.2 s | 0 ms | 0 | 0.5 s | 453 KB |
| `/features` | mobile | 87 | 96 | 96 | 3.5 s | 160 ms | 0 | 3.5 s | 259 KB |
| `/features` | desktop | 100 | 100 | 96 | 0.8 s | 0 ms | 0 | 0.5 s | 274 KB |

Server response (TTFB, local, warm): static pages ~20 ms; `/signin` ~320 ms (dynamic).

## Reading

- Desktop already meets the targets (LCP ≤ 2.5 s, CLS ≤ 0.1) on every page measured.
- Mobile LCP misses the 2.5 s target in this lab on every page; the home page is the worst (5.5 s LCP, 1.14 s TBT), which points
  at main-thread work on load (the animated home scene) rather than bytes: its script transfer is the same as /features.
- Layout shift is zero everywhere measured. Accessibility is 100 except /features on mobile (96).
- Not measured yet: signed-in app routes (`/app/ask`, Create, Business), API latency under load, and real-user p75 values.

Re-run: `npx next build && npx next start -p 3200`, then
`CHROME_PATH=<chromium> npx lighthouse http://localhost:3200/<page> [--preset=desktop] --only-categories=performance,accessibility,best-practices,seo`.
