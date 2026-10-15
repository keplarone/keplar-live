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

## After Phase 4 (mobile)

Measured 2026-10-15 on the same machine against local production builds (`next build` + `next start -p 3310`) of `5303a7f` (before)
and the Phase 4 branch `rebirth-mobile` (after), Lighthouse 12.8.2 mobile preset, performance + accessibility only. Median of 3
runs (after /features: 2 valid runs). Another agent was building and testing on the machine at the same time, so treat single
numbers as noisy and compare the direction. Note the lab LCP is Lighthouse's simulated value; observed LCP on the home in the same
runs was ~0.8 s before and after, the simulated value is driven by main-thread work and by text that starts at opacity 0.

| Page | Perf | A11y | LCP | TBT | CLS |
|---|---|---|---|---|---|
| `/` before | 66 | 100 | 5.1 s | 527 ms | 0 |
| `/` after | 87 | 100 | 3.7 s | 119 ms | 0 |
| `/pricing` before | 78 | 100 | 3.8 s | 350 ms | 0 |
| `/pricing` after | 90 | 100 | 3.3 s | 90 ms | 0 |
| `/features` before | 85 | 96 | 4.0 s | 126 ms | 0 |
| `/features` after | 89 | 100 | 3.2 s | 169-196 ms | 0 |
| `/space-studio` before | 42 | 100* | 4.6 s | 125,415 ms** | 0.016 |
| `/space-studio` after | 63 | 100 | 3.4 s | 1,626 ms** | 0.013 |

\* Before, the Space model cards and plan rows were faded out by the scroll reveal, so the checker never measured their
4.4:1 labels; with the reveal off on phones they are measured, and the quiet ink is one step lighter there (4.9:1).
\*\* This machine has no GPU: the star field runs on SwiftShader. Before, its animation loop never let the page go idle; after,
phones draw one still frame once the page is idle, and the remaining TBT is that one software-rendered frame.

Page height at 390×844 (fully scrolled, so lazily rendered sections count), before → after: `/` 12,774 → 7,347 px (15 → 9 screens);
`/pricing` 8,740 → 7,126; `/features` 10,738 → 6,832; `/space-studio` 5,126 → 5,126 (no folded content there); `/download`
3,824 → 3,361; `/signin` 1,945 → 1,481; `/de` 10,027 → 8,419. At 320px: `/` 13,675 → 7,971, `/pricing` 9,316 → 7,759,
`/features` 11,449 → 7,463. No page scrolls sideways at 320 or 390px. Desktop (1440×900) page heights are unchanged
(`/` 8,562, `/pricing` 5,530), and full-page reduced-motion captures differ only in the example answer window on `/` (below).

What changed on phones (640px and narrower; wider screens unchanged):

- **Root causes of the slow LCP.** Every marketing page faded its first blocks in from opacity 0 (`kp-page-in`, redesign.css); a
  phone does not count that text as painted until the first visible frame, which waited behind hydration (~2.6 s at 4x CPU, vs
  ~0.9 s now). The home hero had its own rise-in on top. Both are off on phones.
- **Backdrop.** No canvas runs on phones (liquid layer, drifting dots); the blurred auras are one still CSS glow behind the hero.
- **Empty example card (bug, all widths).** DemoWindow's "finished" frame was `LOOP - fade - 400`, which is the first frame of the
  fade-out, so the server render, reduced motion and any below-the-fold load showed an empty white card until a loop ran. It is
  now the frame before the fade; phones show it statically, without the scroll zoom/blur.
- **How it works.** Not pinned on phones: a plain numbered list; three.js is never fetched there.
- **Folded, never removed** (`src/components/ui/MobileMore.tsx`, a real button with `aria-expanded`): use cases 4-6 on the home,
  plan features beyond the first 4 (3 on the home) behind "See everything in <plan>", footer link groups as accordions.
- **Pricing.** "Which plan fits?" keeps who each plan is for but no longer repeats the prices and buttons on phones; the
  comparison table shows the feature column plus one plan picked with buttons above it (Plus first), so nothing is cut off.
- **Scroll fade-ins** (`[data-reveal]`, the Space reveal) are off on phones; the home feature list no longer dims under a stuck
  touch hover. `/features` rows are one compact line (name and status) plus the description.
- **Space Studio.** The star field starts when the page is idle and draws one still frame on phones; a dark band backs the
  floating nav. **Localized homes** use the static composition on phones (no pinned seven-screen WebGL story), and its brand
  mark now sits in the first screen instead of over act 02's text.
