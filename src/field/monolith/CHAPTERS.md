# Space scene chapters

The home space scene (the spinning Keplar logo in a field of blue / yellow / white / orange stars) can walk visitors through the
whole site. Each **chapter** draws its own constellation in a camera-locked plane behind the logo, synced to the landing section
on screen. Landing sections only need a data attribute. Nothing else is required.

## 1. Declarative (recommended): `data-chapter`

```html
<section data-chapter="ask">…</section>
<section data-chapter="understand">…</section>
<section data-chapter="create">…</section>
<section data-chapter="together">…</section>
<section data-chapter="ship">…</section>
<section data-chapter="platform">…</section>
<section data-chapter="trust">…</section>
```

`MonolithHome` calls `watchChapters(scene)` once the scene is live. The section that crosses the **viewport's center line** is the
active chapter. Its scroll progress is `0` when its top reaches the center line and `1` when its bottom leaves it. Progress drives
the beats inside a chapter: the wireframe resolves, the critic corrects, the launch arrives. When no section is on the center line,
the scene goes back to the hero story (`null`). Sections added later are picked up automatically (a MutationObserver re-scans).

## 2. Imperative: event or method

```ts
// from anywhere, no import needed
window.dispatchEvent(new CustomEvent("keplar:chapter", { detail: { id: "ship", progress: 0.5 } })); // progress optional
window.dispatchEvent(new CustomEvent("keplar:chapter", { detail: { id: null } }));                  // back to scroll-driven

// with a scene instance (src/field/monolith/scene.ts)
scene.setChapter(id: ChapterId | null, progress?: number | null): void
scene.chapter: ChapterId | null            // read-only, the chapter currently requested

// helpers re-exported from scene.ts (defined in chapters.ts, pure, no three.js)
watchChapters(target: { setChapter(id, progress?) }, root: ParentNode = document): () => void   // returns a disposer
CHAPTER_IDS: readonly ["ask","understand","create","together","ship","platform","trust"]
type ChapterId = (typeof CHAPTER_IDS)[number]
```

A dispatched event wins over scroll until `{ id: null }` is sent. Without `progress`, a chapter's beats play on a clock: draw-on
in about 1.5 s, then resolve, correct, or relaunch.

## Chapters

| id | Section | What the scene draws |
| --- | --- | --- |
| `"ask"` | Ask | Six stars send curved trails of light that converge on the 3D logo. The logo stays full size. |
| `"understand"` | Understands everything | Four star glyphs (a link, an image, a video and a doc) stream dotted light into the logo. |
| `"create"` | Create | A pen light sketches a site wireframe in warm stars: browser frame, nav, hero, image, three cards. As progress passes about 0.5 it resolves into crisp white lines. |
| `"together"` | Build together | Two cursor-lights (blue and orange) trace one constellation from opposite ends. One line first reaches for the wrong star; a yellow critic star swings it to the right one. |
| `"ship"` | Ship | A light launches along a dotted arc from an orange star to a far blue star ringed like a domain, and the far star flares on arrival. Scroll progress drives the launch. |
| `"platform"` | Platform | A network: the core joins four hubs (API in blue, Embed in yellow, Teams in white, Referrals in orange with a branching tree), with pulses running out to each. |
| `"trust"` | Trust / changelog | A steady orbit of stars around the logo, plus an evenly spaced timeline of releases (the newest is the brightest). Lights move slowly and evenly. |

In every chapter except `ask`, the logo recedes to about 68% of its size (50% on phones) and the background net dims, so the chapter constellation leads.

## Tiers

- **Desktop:** full motifs. Dip-crossfade between chapters (about 0.25 s out, then draw-on). Moving lights: up to 10 sprites.
- **Mobile lite** (`mobile: true`): instant swap. Detail lines are dropped. Only the lights that carry meaning are kept: the pen, the critic and the launch.
- **Reduced motion** (`still: true`): each chapter shows its final state as a static frame (fully drawn, resolved, corrected, arrived), redrawn only when the chapter changes.
- **Cost:** three extra draw calls (stars, lines, lights). Fixed buffers: 72 points, 72 segments, 10 lights. CPU rewrites tens of vertices per frame. Nothing is allocated per frame.

## Host layout (as wired in MonolithHome)

- The canvas lives in a fixed, full-viewport layer (`.sky`: `position: fixed`, `100dvh`, `pointer-events: none`, `z-index: -1` inside `<main>`, solid `#0b0b0d`), behind the hero and all seven `[data-chapter]` sections.
- Past the last chapter (pricing, close, footer) the layer fades out (`visibility: hidden`) and the render loop stops. Scrolling back up resumes it. A hidden tab also pauses it.
- Phones: when the toolbar changes only the height, the resize is debounced (220 ms) so buffers are not reallocated mid-scroll. Scroll listeners are passive and throttled to one per animation frame, and the DPR cap and mobile lite tier apply.
- Reduced motion with WebGL: the hero keeps its stacked static layout, and the scene draws one still frame per chapter. It redraws only when the chapter changes. No WebGL, or a software renderer: the static Keplar logo.
- Legibility: chapter text blocks get a subtle solid graphite scrim (`Chapters.module.css`). Copy stays in the DOM, and `MOTIFS[id].says` gives a one-line description for captions or aria.
- Page-level mirrors such as `<html data-chapter>` (ChapterSync) are ignored; only real sections count.
