# Performance + accessibility audit (Phase 3)

Tool: Lighthouse 13.5.0, headless Chromium (Playwright build), default
mobile (Moto G Power emulation, 4× CPU slowdown, slow 4G) and `--preset=desktop`.
Target: `next start` production build on :3001. Before = commit 293175d
(Sep 27, 2026). After = this commit. Raw JSON is in `before/` and `after/`.

SEO shows 66 everywhere because non-production hosts deliberately send
`X-Robots-Tag: noindex` (and robots `disallow: /`). On the production host
that audit passes.

| Page | Form | Perf | A11y | BP | LCP | TBT |
|---|---|---|---|---|---|---|
| / | mobile | 61 → **94** | 97 → **100** | 100 → 100 | 3.4 s → 2.7 s | 7,280 ms → 150 ms |
| / | desktop | 68 → **100** | 97 → **100** | 100 → 100 | 0.8 s → 0.6 s | 1,500 ms → 0 ms |
| /pricing | mobile | 100 → 99 | 95 → **100** | 100 → 100 | 1.8 s → 2.0 s | 50 → 40 ms |
| /pricing | desktop | 100 → 100 | 94 → **100** | 100 → 100 | 0.5 s → 0.5 s | 0 → 0 ms |
| /how-it-works | mobile | 99 → 97 | 96 → **100** | 100 → 100 | 2.1 s → 2.6 s | 50 → 50 ms |
| /how-it-works | desktop | 100 → 100 | 96 → **100** | 100 → 100 | 0.6 s → 0.6 s | 0 → 0 ms |
| /app | mobile | 82 → **94** | 100 → 100 | 100 → 100 | 3.2 s → 3.0 s | 450 → 90 ms |
| /app | desktop | 100 → 100 | 100 → 100 | 100 → 100 | 0.7 s → 0.7 s | 0 → 0 ms |
| /inquire | mobile | 97 → 99 | 96 → **100** | 100 → 100 | 2.4 s → 2.0 s | 100 → 90 ms |
| /inquire | desktop | 100 → 100 | 96 → **100** | 100 → 100 | 0.6 s → 0.6 s | 0 → 0 ms |

On pages that were already fast, ±2 points and ±0.5 s of simulated mobile
LCP are normal run-to-run variance. CLS is 0 on every run.

Homepage transfer: 477 KiB → 335 KiB on mobile (JS 355 → 212 KiB) and
533 → 392 KiB on desktop.

## Fixes
- **WebGL stage / Three.js:** only loads after `load` plus an idle
  callback (1.5 s cap), so it never competes with the hero for LCP or the
  main thread during load. It is never loaded under `prefers-reduced-motion`;
  those users get the static SVG composition instead. It is also skipped when
  the browser would software-render WebGL (`failIfMajorPerformanceCaveat`, or
  a SwiftShader/llvmpipe renderer). **Caveat:** headless Lighthouse uses
  SwiftShader, so the audited homepage is the static-fallback path. On GPU
  devices the Three.js chunk (~140 KiB) still downloads after idle. That is
  post-load work, but it isn't measured in these runs.
- **LCP:** the hero `h1` entrance is now transform-only, so the LCP element
  is never painted at opacity 0.
- **Contrast:**
  - `--c-ink-3` changed from #8c8e94 (3.3:1) to #696b71 (≥4.8:1 on canvas
    and surfaces).
  - New `--c-dissent-text` #a94f36 (5.4:1) for dissent-coloured text. The
    #c9664a accent is kept for fills and strokes.
  - Agents timeline unreached steps went from 40% to 64% white.
  - Creation code-sample colours were darkened.
- **Headings:** `/pricing` plan names are `h2` when the section title is the
  page `h1` (this fixes heading-order).
- **Focus:** a global `:focus-visible` ring already existed. Added visible
  focus to the /app search bar (it had `outline: none` with no replacement),
  the sidebar account link, the auth/billing forms, and the Create/Business
  badges.
- **Reduced motion:** a static homepage stage (no WebGL), plus the existing
  CSS `prefers-reduced-motion` rules.
