# Keplar — principles extracted from the references

Three references were studied (Sept 2026) by loading each in headless Chromium at 1440×900,
scrolling through them and capturing frames (`/workspace/refshots/`), plus reading their
markup and computed styles. None of their assets, layouts, or code are reused. What follows
is what they do well, stated as principles, and how Keplar's language departs from each.

---

## 1. vaalentin.github.io/2015 — scroll as a film reel

**What it does.** A single full-screen WebGL canvas. Wheel/keys advance through discrete
"shots" (HELLO → FROM AN IDEA → FOLLOW THE TRENDS → LET IT MORPH → KEEP TRYING → WORK AS A
TEAM). Each shot is a self-contained 3D composition; the camera travels between them so
the piece reads as one continuous take. Text is tiny, widely letter-spaced, and set *into*
the scene, never over a card.

**Principles**
- **Camera is the narrator.** Transitions are camera moves (dolly, crane, rotate), not
  cuts or fades. The viewer always knows where they came from.
- **One idea per shot.** Each beat has one subject and 2–3 words of copy.
- **Continuity of material.** The same particles/lines are reused and re-arranged from
  shot to shot, so change feels like transformation, not replacement.
- **Scroll maps to time, and time is reversible.** Scrolling back plays the film backwards.

**Where Keplar differs.** vaalentin is dark, cosmic, and uses discrete snapping between
shots. Keplar is white, daylight, and continuous: scroll is *scrubbed* with damping, never
snapped, and every beat is an argument (question → intelligences → disagreement →
verification → answer), not a mood. Its particles are data with identity, not stardust.

## 2. builder.peachworlds.com/remix — dimensional object, soft light

**What it does.** A single hero object (an iridescent soft-body "peach" blob) sits above a
prompt. The object is lit with a soft studio environment, has thin-film/pearlescent
reflections and gentle idle motion. Everything else is flat and quiet. (The route is a
builder app, so the scroll story is minimal; its value as a reference is lighting and
material.)

**Principles**
- **A single hero object earns the 3D.** One well-lit object beats many decorative ones.
- **Image-based lighting over point lights.** Soft environment reflections make a simple
  form feel physical and expensive.
- **Idle motion is slow and small.** Breathing, not spinning.
- **UI stays 2D and calm under a 3D subject.** Depth lives in the object, not the chrome.

**Where Keplar differs.** Peach leans pastel-lavender, gradient-washed, and playful. Keplar
keeps the canvas pure white and lets colour exist only in *light and particles*. Keplar's
hero object is the founder's mark, rendered as layered, clear-coated black extrusions lit by
a prefiltered room environment: precise, not soft-bodied.

## 3. spacefs.com — white, restrained, product-first

**What it does.** White page, Google Sans at 76px/-2.66px (≈-0.035em) with a two-tone
headline (ink line, grey line). Behind the hero, dithered particle "ribbons" (cool blue and
warm orange) flow diagonally across the page. The hero hands off quickly to *real product
UI* (Finder windows, info panels, terminal) shown large and crisp. Nav is a tiny centred
pill ("Menu") plus two right-aligned buttons. Sections vary: product windows, a split
feature list, cards for verticals, a governed/enterprise card, a restrained pricing table.

**Principles**
- **White is a material.** Contrast comes from ink, hairlines, and one or two colour
  temperatures, never from backgrounds.
- **Particles as texture of meaning.** Ribbons read as "data streaming", which is the
  product's claim.
- **Show the real product early and big.** The UI is the proof; it's pixel-precise.
- **Typography does the hierarchy.** Few weights (400/500), tight negative tracking on
  display sizes, generous line spacing on body.
- **Composition varies by section** so the page never becomes a grid of identical blocks.

**Where Keplar differs.** Space's particles are ambient; Keplar's particles are the
narrative's actors. Each stream is one intelligence with its own colour and motion
signature, and the page follows them through distribution, disagreement, and convergence
into the mark. Space cuts to product screenshots; Keplar *morphs* the converged structure
into the product window, then the DOM window takes over at the exact same frame.

---

## Extracted principles, applied to Keplar

### Camera
- One perspective camera for the whole narrative; per-scene keyframes (position, look-at,
  FOV, a hair of roll) in `src/gl/scenes.ts`, interpolated by the scroll timeline with
  `sine.inOut`/`power2.inOut`. No cuts.
- The camera *does something* in each beat: tilts down to watch the question dive into
  depth, pulls back to reveal the six intelligences, drifts right and tightens FOV to
  follow the dissent, recentres for verification, and settles front-on so the mark reads
  as the logo and the product window lands pixel-aligned.

### Scroll sync
- A single GSAP timeline where **1 unit = 1vh of scroll** drives both the WebGL state and
  the DOM copy, scrubbed by ScrollTrigger with 1.1s damping. Scene ranges are data, so
  copy and 3D can't drift apart.
- Fully reversible. No "fade-up on enter" triggers; copy opacity is a function of scroll
  position, like everything else.
- Reduced motion: no scrub, no flow. The timeline jumps to each scene's composed "hold"
  frame and renders once per change.

### Lighting
- White world, no fog, no bloom. Particles are alpha-blended ink over white (additive
  glow would vanish on white).
- The solid mark is lit by a PMREM-prefiltered `RoomEnvironment`, with ACES tone mapping and
  a clear-coat so edges catch soft highlights. That's the only "lit" object.

### Materials
- Particles: round, soft-edged points, per-particle size and alpha variance, sized in
  screen space with depth attenuation. Stream inks are deeper versions of the spectral
  palette (ice, lavender, cyan) so they hold contrast on white; the dissent is the one warm
  stream.
- Glass: used only where it creates spatial hierarchy (nav capsule, prompt card, product
  window). `rgba(255,255,255,.55)`, `blur(20px) saturate(130%)`, 1px white inner border, a
  1px highlight on the top edge of the window.

### Typography
- Google Sans (open-source SIL OFL family, variable wght 400-700, via next/font/google, self-hosted) for everything, IBM Plex Mono (400) for system labels (scene
  labels, consensus, metadata). Display sizes at −0.048em, body at −0.006em.
- Hierarchy through size and tone (ink / #62646A / #8C8E94), not weight.

### Composition
- Every scene has a different arrangement: hero bottom-left with the streams' focal point
  right; question centred; distribution bottom-left; responses bottom-right; disagreement
  large left-set type; verification right column; convergence huge left type with the mark
  right; product window centred and dominant.
- Mobile is composed separately: copy above or below the subject, the 3D world re-laid-out
  vertically (`mobileLayout`), not a scaled desktop.

### Performance
- One canvas, one `Points` draw call for all streams plus three meshes for the mark. All
  particle motion is computed in the vertex shader from ~20 uniforms; no per-frame CPU
  buffer updates.
- Budgets: 18k particles desktop, 7k mobile, ×0.6 on low-tier devices (≤4 cores or ≤4GB).
- Adaptive DPR steps (0.75→2) from a rolling frame-time average.
- Render-on-demand: the loop stops when the narrative leaves the viewport
  (IntersectionObserver) and when the tab is hidden; in reduced motion it renders only on
  state change.
- Three.js and GSAP are dynamically imported after hydration; the hero copy is
  server-rendered and readable before any JS. No WebGL → static SVG composition.

## What makes Keplar's language its own
1. **Particles with identity.** Six streams = six intelligences. Colour, motion signature
   (straight, helix, ribbon, pulsed, double-strand, wide), and route all persist across
   scenes. The warm stream is always the dissent.
2. **Convergence as the only metaphor.** Every scene is a step from many to one, ending in
   the founder's actual mark and then the actual product.
3. **Evaluation, visualised.** Verification is shown as tilted evidence rings where related
   points cluster, contradicted claims are *separated* (not deleted), and noise leaves.
   There is never a bar chart of votes.
4. **Daylight precision.** White, ink, hairlines, light-born colour, and one lit object.
