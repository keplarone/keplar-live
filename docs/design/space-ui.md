# Space UI: the Space Studio design language on keplar.one

Status: Phase A (foundation) landed on `space-ui`, then the background became the weather sky (section 2.1). Every page already picks up the new tokens, font, focus, buttons and chrome;
Phases B-E restyle each area on top of it (split at the end of this file).

The owner asked for "the Space Studio buttons and all of the animation styles in keplar live" and for "every single UI part of
Keplar One" to change, with the backend untouched. Space Studio is the desktop app (repo `space-studio`,
`src/renderer/styles/*.css`, `src/renderer/ui/*`). This document is the contract: what the language is, where it lives in this
repo, and how to restyle a page with it.

**Never change behaviour while restyling.** API routes, `src/lib` server logic, data, auth flows, copy that tests treat as a
product promise, routes and the accessibility tree stay as they are. Restyle markup and CSS only.

---

## 1. The language in eight rules

1. **A sky, not a void.** Light is the default for everyone without a saved choice: a realistic day sky showing the visitor's
   current weather behind every marketing page (`WeatherSky`, section 2.1), frosted white cards, ink primary. Dark is the same
   weather as a dimmed bluish almost-night sky with small stars; app surfaces stay `#0a0a0c` / `#141417` / `#1e1e23` on a `#000` canvas.
   Auto follows the OS. The theme switch is unchanged (`src/lib/theme.ts`).
2. **No outlines.** Surfaces separate by depth and light: a fill step, a 1px inner top highlight
   (`inset 0 1px 0 rgb(255 255 255 / .06)`), a soft drop, a violet glow. Never a 1px border around a card, button or field.
   (Data tables may keep the faint `--hairline`, which is now 5% white.)
3. **Every control is a pill** (`--shape-control: 9999px`). Cards are 28px glass (`--r-card`, `--space-r-card`). Dialogs 28px.
   Textareas 22px (a pill would clip lines).
4. **Primary buttons are 3D.** A lit face (white gradient in dark, ink gradient in light) over a hard ledge (`0 4px 0 #8c8a99`);
   hover lifts 1px and adds a violet glow, a press sinks the face 4px into the ledge. One primary per surface.
5. **Montserrat everywhere** (UI and headings), IBM Plex Mono for code only. Headlines are semibold with tight tracking
   (`-0.045em` to `-0.05em`); eyebrows are 12px, `0.18em` tracked, uppercase, `--c-ink-3`.
6. **Motion is transform, opacity and filter only**, with Space Studio's curves: things rise out of a blur, major views warp in,
   fast movement is motion-blurred, numbers roll like an odometer, the headline verb carries a moving gradient. Nothing waits on
   an animation to be readable.
7. **Focus is the violet glow** (`--space-focus-glow`) on keyboard focus only (`:focus-visible`). No browser outline, never
   invisible; a mouse press draws nothing (e2e/no-focus-box). Windows High Contrast keeps the system outline (mobile.css).
8. **Calm on phones, still for reduced motion.** At 640px and narrower: no entrance animation, no blur filters, no infinite
   gradient drift, a still sky. `prefers-reduced-motion`: every animation lands on its final frame.

---

## 2. Where it lives

| What | File |
|---|---|
| Base tokens (colour, type, spacing, radii, shadows), both themes | `src/styles/tokens.css` (dark block = Space palette), `src/styles/light.css` (light) |
| Space tokens, motion, focus, every `.sp-*` class | `src/styles/space.css` (imported last by `globals.css`) |
| React components | `src/components/ui/space/` (barrel `@/components/ui/space`) |
| Effects bus (warp, aura) | `src/lib/fx/space-fx.ts` |
| Theme-gated canvases | `src/lib/fx/theme-gate.ts` (`runWhileTheme`) |
| Phone / lite detection | `src/lib/fx/lite.ts` (`isPhone`, `liteFx`) |
| Font | `src/app/layout.tsx` (`Montserrat` via `next/font/google`), `src/lib/i18n/fonts.ts` (localized pages) |
| Motion-blur SVG filters | `<SpaceMotionFilters />`, rendered once by the root layout |
| The sky | `<WeatherSky />` (pre-rendered stills in `public/sky` + the live WebGL2 renderer in `src/lib/sky/`), mounted by `src/components/sky/SkyBackdrop.tsx` on every marketing page (auth pages included) and the 404; styles in `space.css` ("the sky"); weather from `GET /api/sky`; stills from `scripts/sky/render-stills.mts` |
| The kit (Studio design system used across /app) | `src/components/kit/*` reads `--ks-*`; `src/styles/kit.css` maps them onto Space |
| Page CTAs (`Button` / `ButtonLink`) | `src/components/ui/Button.tsx` (restyled in place: 3D) |

### 2.1 The background: the weather sky

One sky system for the whole site (it replaced the home page's auras, liquid layer and dot ribbons, Phase A's star field and the
first CSS cloud tiles). **The sky matches the visitor's current local weather**; time of day never matters, the theme picks the
look: Light = the daytime version of the weather, Dark = a dimmed, bluish almost-night version, moonlit, with small scattered
stars through the gaps (none under overcast, rain, snow or fog).

| Variant | Look |
|---|---|
| `clear` | open sky, Rayleigh-like gradient and horizon haze, a few small fair-weather cumulus far off |
| `partly-cloudy` (default / fallback) | sunlit cumulus with silver edges and blue-grey bases, clear behind the headline, denser toward the horizon and the edges |
| `cloudy` | bigger, closer cumulus, greyer sky |
| `overcast` | flat grey stratus, low contrast, soft thickness variation |
| `fog` | haze, low visibility, washed contrast |
| `drizzle` / `rain` | low grey cloud deck; fine short streaks / longer streaks and darker cloud |
| `thunderstorm` | dark heavy cloud, rain, a rare soft lightning glow inside the clouds |
| `snow` | pale sky, soft falling flakes |

- **Renderer** (`src/lib/sky/renderer.ts`, GLSL in `src/lib/sky/shaders.ts`, looks in `src/lib/sky/variants.ts`): WebGL2. Bakes
  tileable 3D noise once (Perlin-Worley shape volume 128^3 + Worley detail volume 32^3, a few slices per frame), then raymarches a
  cloud shell over a curved Earth: weather-map coverage, a height profile per cloud type (cumulus to stratus), detail erosion,
  Beer-Lambert extinction, dual-lobe Henyey-Greenstein phase with multiple-scattering octaves (silver lining toward the sun),
  powder term, height-graded ambient light, a 6-step light march toward the sun, aerial perspective. 40 view steps at a third
  of the CSS resolution with interleaved-gradient-noise jitter and frame history, upscaled; a full-resolution composite adds the
  stars, the precipitation particle layer (procedural streaks / flakes on the GPU) and the lightning glow.
- **First paint = a still of that same renderer** (`public/sky/<variant>-<day|night>[-sm].{avif,webp}`, 1600x1000 and an
  800x1000 portrait crop for phones, a few KB each), rendered offline in headless Chromium with SwiftShader by
  `node --import tsx scripts/sky/render-stills.mts` (re-run it after changing the shaders or a look). CSS picks the still for the
  current variant (`.sp-sky[data-sky]`) and theme, so only one image is fetched; the gradient under it matches its sky.
- **Weather lookup**: `GET /api/sky` (src/lib/sky/weather.ts) reads Vercel's `x-vercel-ip-latitude/-longitude`, rounds them to
  one decimal (~11 km), asks Open-Meteo for the current `weather_code`, `cloud_cover`, `wind_speed_10m` (3 s timeout, cached per
  cell for 15 minutes: Next fetch cache + an in-memory LRU), maps them to a variant (wind speed nudges the drift) and answers
  `{ sky, wind }` with `Cache-Control: private, max-age=900`. No permission prompt, no client geolocation, nothing stored or logged;
  the privacy policy says so. No headers, timeout, error or local dev: `partly-cloudy`. The pages stay static: WeatherSky fetches
  it after hydration (no cookies) and cross-fades to the right still; a tab remembers its answer for 15 minutes (sessionStorage,
  restored before paint). Testing: `?sky=<variant>` on any page, honoured only outside production or with `KEPLAR_DEV_TOOLS=1`.
- **Live**: desktop only, after idle, the renderer is imported on demand and cross-fades over the still (same camera, so the
  fade is near invisible); up to 30 fps, paused while the tab is hidden or the sky is off screen; stops for good (back to the
  still) on a software GPU (SwiftShader, llvmpipe), `failIfMajorPerformanceCaveat`, a slow GPU (median frame gap over 60 ms),
  Save-Data or a battery under 20% and discharging. `spaceFx.warp()` sends a gust. Lightning: at most two soft pulses per strike,
  then 6-15 s of calm (WCAG 2.3.1).
- **Phones (640px and narrower) and reduced motion**: the still only; the renderer is never downloaded.
- **Readability**: on pages that carry the sky, `--c-ink-2` / `--c-ink-3` step darker in Light (darker again under rain, drizzle
  and storm skies) and lighter in Dark (space.css, `body:has(.sp-sky)`). Put dense content on `--space-glass` cards (frosted
  white in Light, deep translucent in Dark). /app, Business and admin have no sky behind them (solid panels).
- Don't add other backdrops (no star fields, auras or canvases behind pages); a page that needs a different mood adjusts the
  sky's look (`variants.ts`), not a new layer.

---

## 3. Tokens

### 3.1 Colour (product tokens, same names in both themes)

| Token | Dark (Space) | Light | Use |
|---|---|---|---|
| `--c-canvas` | `#000000` | `#f7f8fa` | page |
| `--c-surface-1` | `#0a0a0c` | `#ffffff` | panels |
| `--c-surface-2` | `#141417` | `#f1f3f6` | raised / inset |
| `--surface-panel` / `-raised` / `-overlay` | `#0a0a0c` / `#141417` / `#111114` | white | app surfaces |
| `--c-ink` | `#f4f4f6` (19:1) | `#0e0f12` | text |
| `--c-ink-2` | `#b3b3bb` (10:1) | `#4b4f58` | secondary text |
| `--c-ink-3` | `#8a8a94` (6.1:1 on black, 4.9:1 on `#1e1e23`) | `#686d78` | quiet text (still AA) |
| `--c-accent`, `--c-focus` | `#c39bff` violet | `#7d3bc4` (6.4:1 on white) | links, highlights, focus |
| `--ring-rgb` | `195 155 255` | `125 59 196` | glows: `rgb(var(--ring-rgb) / .2)` |
| `--hover-wash` / `--press-wash` | 7% / 11% white | 5% / 9% ink | quiet control fills |
| `--hairline` | 5% white | 8% ink | data tables only |
| semantic `--c-reasoning`, `-research`, `-creation`, `-verified`, `-attention`, `-disagree`, `-destructive`, `-memory` | Space Studio hues: `#6ea8ff`, `#8fd8ff`, `#ffb37a`, `#5fd49a`, `#ffd66b`, `#ffa58f`, `#ff7a85`, `#f08bd8` | unchanged (AA on paper) | one meaning each |

`tests/semantic-colour.test.ts` keeps the CSS and `src/lib/tokens.ts` in step and checks AA; `tests/palette.test.ts` still bans
SaaS electric blues and the Tailwind violets (`#7c3aed`, `#8b5cf6`...). Use the Space violets (`#b27cff`, `#c39bff`, `#d76cff`,
`#a467f0`) and keep `b - r <= 80` for any new blue-violet.

### 3.2 Space tokens (`src/styles/space.css`, theme-aware)

| Group | Tokens |
|---|---|
| Durations | `--space-dur-instant` 90, `-fast` 140, `-base` 200, `-slow` 320, `-page` 420, `-entry` 1100 (ms; ~0 under reduced motion) |
| Easing | `--space-ease-out` (0.22,1,0.36,1), `--space-ease-expo` (0.16,1,0.3,1), `--space-ease-in`, `--space-ease-in-expo` (0.7,0,0.84,0), `--space-ease-in-out`, springs `--space-spring-snappy` / `-gentle` / `-bouncy` (0.34,1.56,0.64,1) |
| Shape | `--space-r-card` 28, `--space-r-panel` 22, `--space-r-field` pill, `--space-r-area` 22, `--space-hit` 44 / `-sm` 36 / `-lg` 54 |
| Glass | `--space-glass` (gradient fill), `--space-glass-solid`, `--space-glass-depth`, `--space-glass-lift` |
| Fields | `--space-field`, `-hover`, `-focus`, `--space-field-depth` (holds a 3:1 edge, WCAG 1.4.11) |
| Focus | `--space-focus-glow` |
| 3D buttons | `--space-p-face / -ink / -depth / -depth-hover / -depth-press` (primary), `--space-s-*` (secondary), `--space-d-*` (danger), `--space-g-ink / -hover` (ghost), `--space-ledge` (press depth, 4px) |
| Gradient | `--space-grad` (the moving verb gradient), `--space-aura` |

Older names still work and now resolve to Space values, so un-migrated modules change on their own: `--btn-p-bg` /
`--btn-p-shadow` / `--btn-s-*` (glass.css) are the 3D faces and ledges, `--nav-*` are the glass pills, `--ks-*` (kit.css)
drive the kit, `--m-*` (motion.css) keep their budget.

### 3.3 Type

`--f-sans` = Montserrat (next/font, self-hosted, latin, variable 100-900, swap, metric-matched fallback generated by next/font).
Localized pages put a second Montserrat (latin-ext, cyrillic, vietnamese; not preloaded) first and Google Sans (other scripts)
second (`src/components/i18n/i18n.css`). The fluid scale (`--t-display` ... `--t-label`) is unchanged; set headings with
Space tracking:

| Role | Recipe |
|---|---|
| Hero | `.sp-hero-title` (clamp 42-76px, 600, -0.05em, balance) or `--t-display` with `letter-spacing: -0.045em` |
| Section title | 600, -0.03em |
| Eyebrow | `.sp-eyebrow` |
| Lede | `.sp-lede` (16px / 1.6, `--c-ink-2`) |
| Button | 700 (`--w-bold`), 13-15px |

---

## 4. Components (`@/components/ui/space`)

All are typed, keyboard operable, reduced-motion aware, and render the `.sp-*` classes (so plain HTML can use the classes too).

| Component | API | Notes |
|---|---|---|
| `Button` | `variant: primary \| secondary \| ghost \| danger` (default secondary), `size: sm \| md \| lg`, `status: idle \| loading \| success \| error`, `successLabel`, `errorLabel`, `icon`, `trailingIcon`, `arrow`, `iconOnly` + `label`, `fullWidth`, all `<button>` props, `ref` | loading = spinner ring + light sweep, `aria-busy`, clicks ignored, stays focusable; success/error roll the label in; error shakes once |
| `ButtonLink` | same visual props + every `next/link` prop | a navigation stays an `<a>` |
| `spaceButtonAttrs()` / `spaceButtonClass()` | | give any element the button look: `<a className={spaceButtonClass()} {...spaceButtonAttrs({ variant: "primary" })}>` |
| `Card` | `as`, `pad: none \| md \| lg`, `interactive` | 28px glass; `interactive` = hover lift + glow |
| `Panel` | `title`, `actions`, `pad` | solid raised surface for dense app UI (no blur) |
| `Notice` | `tone: info \| warn \| error \| success`, `title`, `shake` | glass + coloured glow, `role=status/alert` |
| `Input`, `Textarea`, `Select`, `Field` | native props; `fieldSize: sm \| md`; `Field({ label, hint, error, children: (aria) => control })` | pill fields, violet glow while typing, red glow when invalid |
| `SegmentedControl` | `segments`, `value`, `onChange`, `label`, `mode: radio \| tabs`, `idPrefix`, `size`, `fullWidth` | glass track, lit thumb on a spring, motion blur while it travels |
| `Toggle` | `checked`, `onChange`, `label?`, `description?`, `disabled`, `ariaLabel` | `role=switch`, violet gradient track, squashy thumb |
| `Dialog` | `open`, `onClose`, `title`, `children`, `actions` | native `<dialog>`, rises out of a blur, backdrop click closes |
| `Popover` | `open`, `onClose`, `anchorRef`, `label`, `prefer`, `align`, `width`, `role` | flips to the side with room; use `.sp-menu-item` rows |
| `Disclosure` | `summary`, `children`, `defaultOpen` | caret turns, panel resolves in |
| `Tooltip` | `content`, `side` | for marketing pages; /app keeps the kit Tooltip |
| `Skeleton`, `LoadingBlock` | `width`, `height`, `lines` | pills that breathe |
| `RollingNumber`, `useGlide` | `value`, `format`, `durationMs` | odometer with vertical motion blur; SR gets the plain number |
| `RotatingHeadline` | `lines: [verb, rest][]`, `label`, `as`, `cycleMs`, `warp` | Space Studio's cycling headline: gradient verb, glyphs rise out of a motion blur; line 1 paints immediately (LCP); still on phones |
| `WeatherSky` | `className` | the weather sky (section 2.1); already on every marketing page, the auth pages and the 404 |
| `SpaceMotionFilters` | | already in the root layout |
| `spaceFx` | `warp(strength, seconds)`, `prompt()`, `aura()`, `onWarp`, `onAura` | fire a warp on big actions (send, publish, arrive) |

The kit (`@/components/kit`, used all over /app) keeps its API; `Button`, `IconButton`, `SegmentedControl`, `Switch`, `Menu`,
`Dialog`, `Tooltip`, `Toast` now draw the Space look through `--ks-*` tokens (kit.css): 3D primary/secondary/danger, pill ghosts,
the glass segmented track with the lit thumb, the violet switch, 20px menus, 28px dialogs, the violet focus glow. Link-buttons
inside /app use `src/components/app-ui/link-action.module.css` (`className={la.act} data-variant="primary"`), also 3D.

---

## 5. Motion

| Effect | How |
|---|---|
| Rise out of a blur (entry) | `.sp-rise` (+ `style={{ "--d": "80ms" }}` to stagger). Desktop only; phones show content at once |
| Swap a label / value | `.sp-swap` (re-key the element) |
| Warp between major views | Marketing route changes and `/app` view switches already warp (space.css view-transition rules, wider than 640px). For a hand-made big transition: `.sp-warp-out` on the old view, `.sp-warp-in` on the new, and `spaceFx.warp(0.4, 1)` for a gust in the sky |
| Motion blur on fast movement | `animation: sp-mb-x 0.5s ease-out` (horizontal) / `sp-mb-y` (vertical) on the moving element, or classes `.sp-blur-x` / `.sp-blur-y`. Needs `<SpaceMotionFilters>` (present). Not on phones |
| Rolling numbers | `<RollingNumber value={n} />`; for polled values `useGlide(target)` |
| Gradient verb | `<span className="sp-grad">word</span>` (static text) or `<RotatingHeadline>` |
| Sky gust | `spaceFx.warp(strength 0..1.5, seconds)`; `spaceFx.prompt()` on send (the clouds speed up and settle) |
| Overlays | kit overlays use motion.css (`data-motion` + `usePresence`); Space components animate themselves (`sp-pop-in`, `sp-dialog-in`) |

Budgets: hover/press 60-200ms; menus/popovers <= 320ms; dialogs <= 600ms (content readable from ~200ms); page warp 420ms
(old page out in 200ms); entry 1.1s but never on the first paint of a phone. Every value collapses under reduced motion.

**Performance rules (keep Lighthouse where it is):** never fade the LCP element in from opacity 0 on phones; no
`backdrop-filter` on in-page surfaces on phones (redesign.css already strips it at <=767px / coarse pointers); canvases start
after idle, pause when hidden, draw one still frame on phones and under reduced motion; never stack blur layers in long lists
(use `Panel` or `--lg-card`, not `Card`, for repeated rows).

---

## 6. Migration guide: restyling a page

1. **Read the page's module CSS first.** Most colours already come from tokens and changed with Phase A. Look for what is left:
   literal colours, `border: 1px solid`, `box-shadow: inset 0 0 0 1px` rings, square corners, teal accents, Google Sans
   comments.
2. **Buttons.** Replace page-local button classes with `<Button>` / `<ButtonLink>` from `@/components/ui/space` (or the kit
   Button inside /app). If the markup must stay (tests pin it), keep the element and give it the look:
   `className={spaceButtonClass(s.mine)} {...spaceButtonAttrs({ variant: "primary" })}`, or in CSS
   `background: var(--space-p-face); color: var(--space-p-ink); box-shadow: var(--space-p-depth)` + the hover/press pair.
   One primary per surface; everything else secondary or ghost.
3. **Cards and panels.** Remove borders/rings. Marketing cards: `.sp-card` (or `background: var(--space-glass);
   box-shadow: var(--space-glass-depth); border-radius: var(--space-r-card)`). App surfaces: `.sp-panel` or
   `background: var(--surface-raised); box-shadow: var(--elev-2)`. Interactive cards: `data-interactive`.
4. **Fields.** `.sp-input` / `.sp-textarea` / `.sp-select` or the components. Keep the label (`.sp-field__label`), keep
   `aria-invalid` and error text wiring as it was.
5. **Tabs / filters.** `SegmentedControl` (radio) or `mode="tabs"` with `idPrefix` for view switchers. Inside /app, the kit's
   `SegmentedControl` / `Tabs` already look right.
6. **Headings.** Montserrat is wider than Google Sans: check every display heading at 320, 390 and 1440px. Use the Space
   tracking (`-0.045em`), semibold. Hero verbs may use `.sp-grad` or `<RotatingHeadline>` (marketing heroes only).
7. **Motion.** Add `.sp-rise` to below-the-fold blocks or rely on the existing `[data-reveal]`; never on the hero text on phones.
   Fire `spaceFx.warp()` on the big action of the page (send, publish, deploy) if it feels like a jump.
8. **Light theme.** Every recipe has a light twin through the tokens. Look at both themes; never hard-code `#000`/`#fff` unless
   the surface is always dark (Business, the Space site) and say so in a comment.
9. **Check:** `npx tsc --noEmit -p .`, `npx eslint . --quiet`, `npm test`, screenshots at 1440x900 and iPhone 13 in both
   themes, Lighthouse a11y 100 on public pages. Update a test only when it encodes the old look (not a product promise) and
   list it in your report.

Don'ts: no `outline` anywhere (globals.css removes it; use the glow), no borders on cards/buttons/fields, no square buttons,
no teal for new UI (teal stays only as the light theme's semantic "reasoning" colour), no `backdrop-filter` on repeated items,
no animation that holds content invisible on phones, no new font families.

---

## 7. Phase A decisions (and why)

- **Light is the default theme again (sky update).** Phase A made Dark the default over a star field; the owner then asked
  for "a sky with clouds", "moving clouds", realistic. `DEFAULT_THEME_PREF = "light"`; the server renders `data-theme="light"`.
  The storage key stays `keplar-theme-v2`, so anyone who explicitly chose Dark (or Auto) keeps it.
- **The background is the weather sky** (section 2.1). The first CSS cloud tiles were judged "pretty unrealistic" (grey clay-like
  blobs, too dense behind the headline); they were replaced by a real volumetric renderer that shows the visitor's own weather.
  The cost stays off the critical path: a few-KB still of the same renderer paints first, the live canvas only runs on desktop
  after idle and gives up on weak GPUs.
- **Montserrat replaces Google Sans** sitewide (Space Studio's face). Business keeps Geist (its own brand, Phase D decides),
  OG/share images still render with the bundled Google Sans files (`src/lib/og.tsx`, open item).
- **Light accent moved from teal to violet** (`#7d3bc4`) so focus, selection and links match Space in both themes. The light
  semantic colours (reasoning teal etc.) are unchanged: they carry meaning in answers.
- **Focus**: Space Studio's glow replaces the old brightness+underline+bar cue on controls; inline links keep an underline (a
  glow around wrapped text would read as a box).
- **No star field anywhere but the Space site.** Phase A's 2D-canvas star field (`SpaceSky`) was removed; the only stars left
  are the few the weather sky shows through clear gaps in Dark. The Space site (`/space-studio`, space.keplar.one) keeps its own three.js journey.
- **No sky behind dense app UI** (/app, Business workspace, admin): the app sits on its canvas with solid panels.
- **Kit**: restyled through tokens (`--ks-*-face`, `--ks-*-depth`, `--ks-seg-*`, `--ks-switch-*`, `--ks-control-radius`), so the
  ~115 files that import `@/components/kit` changed without edits. The kit CSS files themselves still contain no literal
  gradients/blur (`tests/studio-ui-tokens.test.ts`).

---

## 8. Area split for Phases B-E

Each area: routes, then the main component files. Shared chrome (marketing nav/footer, the app sidebar/top bar, the Business
header) is done in Phase A; agents should not restyle it again, only adjust where their pages need it.

### (a) Marketing, docs and the Space site
- Routes: `src/app/(marketing)/*` except account/auth/legal (below): `/` (home), `/pricing`, `/features`, `/download`,
  `/desktop`, `/about`, `/how-it-works`, `/compare*`, `/vs`, `/for-*`, `/use-cases`, `/showcase`, `/templates`, `/models`,
  `/agents`, `/specialists`, `/developers`, `/enterprise`, `/team`, `/roadmap`, `/changelog`, `/status`, `/security`, `/help`,
  `/contact`, `/inquire`, `/feedback`, `/blogs`, `/guides`, `/glossary`, `/answers`, `/topics`, `/prompts`, all SEO landers
  (`/ai-*`, `/chatgpt-alternative`, `/multi-model-ai`, `/superintelligence`, `/what-is-keplar`, `/si-vs-ai`, `/blender-ai`,
  `/roblox-studio-ai`, ...), localized homes `src/app/(i18n)/[locale]`, docs (`src/app/(marketing)/docs`, docs.keplar.one),
  `src/app/changelog`, the Space site `src/app/(space)/space-studio` (space.keplar.one).
- Components: `src/components/sky/*` (home: `SkyHome.tsx`, `Sky.module.css`, `DemoWindow`, `FeatureList`, `MiniDemos`,
  `ModelStack`, `ScrollZoom`, `ParticleStory`), `src/components/sections/*` (Pricing, Creation...), `src/components/home/*`,
  `src/components/landing/*`, `src/components/page/*` (TwoTone, RoutePlaceholder), `src/components/compare`, `how`,
  `editorial`, `kb` (blogs/guides/glossary), `templates`, `developers`, `download`, `desktop`, `status`, `support`, `inquire`,
  `feedback`, `growth`, `monolith`, `spatial`, `simulation`, `seo`, `i18n`, `src/styles/docs-theme.css` (docs skin),
  `src/components/space/*` (Space site: already Space; align its tokens with `--space-*` and Montserrat is now real).
- Suggested: hero headlines with `RotatingHeadline` / `.sp-grad`, pricing plan cards as `Card`, plan prices with
  `RollingNumber` on the period toggle (`SegmentedControl`).

### (b) Keplar One app (`/app/*`)
- Routes: `src/app/app/*`: `ask` (chat), `create` (+ `create/live`), `studio` (+ `studio/overlay`), `slides`, `study`, `browser`,
  `wants`, `apps`, `deployments`, `history`, `projects`, `agents`, `approvals`, `business` (in-app), settings modal `@modal/(..)account`.
- Shell (done): `src/components/app-ui/KeplarApp.tsx`, `Sidebar.tsx`, `App.module.css` (shell, sidebar, top bar).
- Ask / chat: `app-ui/HomeStart.tsx`, `Composer.tsx` + `.module.css`, `KeplarTurn.tsx`, `Markdown.tsx`, `AnswerExtras`,
  `ChatTools`, `ThreadBar`, `SynthesisView`, `DebateView`, `AttachTray`, `SlashCommandMenu`, `ShareAnswer`, `Recents`,
  `SearchDialog`, `AccountMenu`, `UsageNotice`, `SignInGate`, `agent-flow/*`, `research/*`, `chat-image/*`, `parity/*`.
  Fire `spaceFx.prompt()` on send.
- Create / builder: `src/components/create/*` (`CreateStudio`, `SiteBuilder`, `ImageStudio`, `advanced/*`, `apps/*`,
  `workspace/*`, `video/*`, `mobile/*`, `builder.module.css`, `create.module.css`), `app-ui/create/*`.
- Keplar Studio: `app-ui/studio-mode/*`, `app-ui/studio/*`, `src/components/kit/StudioRoot.tsx` + `tokens.module.css` (Studio's
  own dense tokens: decide how far the 3D look goes at 28px controls).
- Slides `src/components/slides/*`, Study `src/components/study/*`, Browser `src/components/browser/*`, Wants
  `src/components/wants/*`, Connected apps `app-ui/ConnectedAppsView.tsx`, Deployments `app-ui/DeploymentsView.tsx`,
  Projects `app-ui/ProjectWorkspace.tsx`, `ProjectTimeline.tsx`, `SiteProjects`, Agents `app-ui/AgentsPanel.tsx`,
  usage `src/components/usage/*`, loader `src/components/loader/*`.
- Settings: `src/components/account/*` (`SettingsDialog`, `account.module.css`) when opened from /app.

### (c) Keplar Business (business.keplar.one + `/biz/work`)
- Storefront: `src/app/(business)/biz/*` (home, account, signin, chatgpt, privacy, security, status, terms),
  `src/components/business-site/*` (`Storefront.tsx`, `business-site.module.css` (header and buttons done), `tokens.css`
  (`--kb-*`), `ProductTiles`, `BuildDemo`, `Converge`, `AccountSetup`, `ChatGPTConnection`, `fonts.ts` (Geist: keep or move
  to Montserrat, decide with the owner), `business-doc.module.css`).
- Workspace: `src/app/(business-app)/biz/work`, `src/components/business-app/*` (`BusinessWorkspace`, `Home`, `Dashboard`,
  `Ask`, `Analyst`, `Projects`, `Computer`, `DesignCanvas`, `TeamPanel`, `Settings`, `CommandPalette`, `workspace.module.css`,
  `cursor.module.css`, `canvas.module.css`, `settings.module.css`), `src/components/business/*`.
- Local preview: `http://business.localhost:<port>/` (the proxy treats `business.localhost` as the Business host).

### (d) Account, sign-in/up, onboarding, admin, legal, embed, shared pages
- Auth: `(marketing)/signin`, `signup`, `forgot-password`, `reset-password`, `verify-email`, `two-factor`, `secure-account`,
  `(business)/biz/signin`; `src/components/auth/*` (`auth.module.css`, provider buttons). Space Studio's sign-in (`entry.css`
  `.si`, `.sp--primary` / `.sp--glass` provider buttons, the nebula, the cycling headline) is the reference.
- Account: `(marketing)/account`, `src/components/account/*`, `src/components/billing/*`, `(marketing)/checkout`.
- Onboarding: `src/app/welcome`, `src/components/onboarding/*` (reference: Space Studio `entry.css` `.ob-*`: card steps that
  slide with motion blur, tiles, chips, the progress pill).
- Admin: `src/app/admin/*`, `src/components/admin/*` (dense; panels, no sky).
- Legal: `(marketing)/privacy`, `terms`, `referral-terms`, `src/components/legal/*`.
- Embed and shared: `src/app/embed`, `src/components/embed/*`, `src/app/s/[slug]`, `src/app/i/[token]`, `src/app/invite/[code]`,
  `(marketing)/r`, `(marketing)/c`, `(marketing)/sp`, `src/components/share/*`, `src/components/answer/*`, `src/app/bot`,
  `src/app/sites`, `src/app/apps`, consent `src/components/consent/*` (cookie card), `src/app/not-found.tsx`, `error.tsx`,
  `global-error.tsx`.

---

## 9. Tests that encode the look

Phase A updated the tests that pinned the old visual design (Google Sans, teal accent, 14px control radius, flat kit
buttons...). They now pin the Space decisions above. The sky update moved the default back to Light in
`tests/theme.test.ts`, `tests/glass-typing.test.ts`, `tests/light-aura.test.ts` and `tests/docs-host.test.ts`. If a later phase changes one of these decisions, update the
same tests and say why.
