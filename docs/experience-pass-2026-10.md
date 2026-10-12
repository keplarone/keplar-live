# Experience pass, October 2026

Branch `redesign/keplar-experience`, from `desktop-nav-controls` at `4fc30a8`. A pass through the public site, sign-in and the
app against the "Ultimate Experience & Conversion" brief: find what makes Keplar look confusing, unpolished, slow or dishonest,
and fix it without removing working capability. Every change is a separate commit with the reasoning in its message.

## How it was checked

- Every screen below was captured before and after at 1440x900 and 390x844 (phone emulation), in Light and Dark, with a local
  test account on Free and on Plus. Answers came from a local fake model server (no provider keys, no spend).
- axe-core (WCAG 2.0/2.1 A and AA) on home, pricing, the app home and an open answer with its details expanded, both themes,
  desktop and phone: 0 violations after the fixes (one serious contrast issue found and fixed, see below). The project's own
  a11y suite (e2e/a11y.e2e.ts, 20 public routes x Light and Dark, production build): 40 of 40 pass.
- Browser tests on a production build (e2e/split-view, typing-hidden, typing-slow, answer-card, each run twice): 28 passed. The
  other 4 are two answer-card tests that fail the same way on the untouched base commit: "a clarifying question keeps its chips"
  (the e2e server has no live models for that request) and "the card has one style" (the plain reply card computes no shadow).
  These runs also caught a real bug in this pass's typing change (the reveal could stop one word short); fixed in a729ea9 with a
  test. typing-slow: the reveal now finishes in 2-4 frames (limit 8). e2e/mobile, basics and smoke: no failures.
- Unit tests (`npm test`): 2,526-2,530 of 2,532 pass depending on machine load. Before any change one test failed ("Keplar Cloud
  browser tasks"); in the last full run six timing-sensitive server tests failed while a dev server and builds shared the machine,
  and all six pass when rerun on their own. None touches a file changed here.
- `tsc --noEmit` clean, ESLint clean on every changed file, `next build` succeeds.
- Load (dev server, warm): home LCP 0.4-0.5 s, CLS 0 at desktop and phone; pricing LCP 0.36 s, CLS 0.

## What was already good (kept)

Design tokens and a calm motion system (`tokens.css`, `motion.css`, reduced-motion handled), a minimal sidebar with "More",
a well-organised Settings page with search, honest copy about models and limits, an interactive no-account demo on the home page,
consent-gated first-party analytics with no prompt text, and a controlled experiment framework (`src/lib/growth/experiments.ts`,
docs/growth/EXPERIMENTS.md) that runs nothing without approval and never declares a winner. No new experiments were added: the
backlog's own rules (two at a time, minimum evidence, founder approval) already cover hero copy and landing variants.

## What changed

| Area | Problem found | Change |
|---|---|---|
| Scroll reveal | A script set below-the-fold blocks to opacity 0 until it saw them: "How it works", use cases, the home plan cards and the pricing FAQ were blank for fast scrollers, find-in-page, full-page captures and slow script loads | CSS scroll-driven animation tied to each block's position; content is visible by default and never left hidden |
| Prices | A count-up from $0 rewrote below-the-fold prices, so Lite, Plus and Pro read "$0 per month" to find-in-page, translation and assistive tech | Prices render as text; CountUp removed |
| Motion | A later layer turned the motion system up: 1.56 overshoot, 420 ms dialogs, 2 px button lifts, page sections fading in over 560 ms with up to 350 ms of stagger | 1.3 overshoot, 320 ms dialogs, 1 px lift, page and app view entry in one 280-360 ms beat with at most 80 ms of stagger |
| Answer speed | The typing reveal capped at 480 characters a second with sentence pauses: a finished 3,000-character answer took 6 s or more to "type" | A live stream is still smoothed, a burst clears in ~0.5 s, a finished answer appears within ~0.3 s; "Skip" removed; the reveal always reaches the last word (a floating-point stall is fixed and tested) |
| Answer card | Up to seven detail rows, seven raised icon discs on every answer, then confidence, memory and draft notes as loose lines | One "How Keplar answered" row with a plain summary ("5 of 5 models · 1 source") that opens the same rows; quiet icon actions, shown on hover for older answers; the notes grouped under the answer; "Open as draft" a quiet text action |
| Early drafts | A panel's first words (one model's early draft) were replaced by the checked answer with no warning in the main view | The existing "early draft" note shows there too |
| Chat top bar | The title pill and round buttons floated over the thread, so text ran underneath them; phones crowded six controls and cut the title to a few letters | A soft band in the page colour under the bar; on phones (signed in) theme and memory move to the account menu and Settings |
| Segmented choices | A global "lifted pill" rule matched any class with btn/chip/pill/tab, so every option of a radio group looked selected | Radio options keep their own selected style |
| Sign in / sign up | Unconfigured providers sat first as disabled "Coming soon" buttons (Microsoft on keplar.one) | Only working providers show; no divider or provider consent line when there are none |
| Nav | "Try Keplar" next to "Account" for signed-in people | "Open Keplar" when signed in (CtaLabel, no flash) |
| Home | Feature list numbered 02-07; cookie banner covered the hero's buttons on phones; phones got a desktop download button; the model badge wrapped; the demo window snapped from its finished answer to empty | 01-06; one-sentence banner (details stay on /privacy#cookies); one call to action on phones; the badge fits; the demo carries on or rewinds unseen |
| Phones | Create's tabs cut off "Mobile (Beta)" at 390-414 px; rename in All chats was a raised disc beside a flat delete | Tabs fit up to 440 px; rename is a quiet row action |
| Accessibility | Dark pricing: "per month" / credits text at 3.5:1 on the translucent Plus and Pro cards | ink-2 in Dark (>= 4.5:1) |

## Decisions left to the owners

1. **Whop Pixel and consent.** Per /privacy#cookies, the Whop ad-measurement pixel loads on marketing pages without being part of
   the cookie choice. Whether that is acceptable for visitors in consent-required regions is a legal call; it was not changed.
2. **"Coming soon" providers.** Hiding unconfigured sign-in providers reverses an earlier deliberate choice (tests/launch-auth.test.ts
   recorded it). Revert `f9d2419` to bring the disabled buttons back.
3. **Desktop detection.** `DESKTOP_SCRIPT` (src/lib/desktop.ts) treats any Electron user agent as the Keplar desktop app, so
   Electron-based in-app browsers get the desktop title bar. Desktop app 0.1.3+ sends a `keplar-desktop` token; dropping the
   plain-Electron check would fix it once nobody runs an older app.
4. **The global button rule.** `redesign.css` restyles anything whose class name contains btn / chip / pill / tab. This pass
   carved out answer actions and radio options, but the selector approach will keep catching new components; moving the lifted
   look into the shared Button component would be the durable fix.

## Not done in this pass (candidates for the next one)

- Production profiling of long threads: in the dev build, the third answer in a thread showed up to nine main-thread tasks of
  ~55-60 ms while streaming. FitRuntime was ruled out (disabling it changed nothing measurable); profile a production build next.
- A screen reader walk-through (VoiceOver, NVDA) of ask -> answer -> details -> share; axe covers roughly a third of issues.
- The pricing page is long; the plan grid, the usage scale and "Compare every plan" repeat some facts. Worth a content pass with
  the pricing owner (prices, limits and plan names were not touched).
