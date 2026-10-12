# Studio overlay: Solar 5.8 Ultra

The always-on-top overlay the desktop app floats over Roblox Studio or Blender (`/app/studio/overlay`, window in keplar-desktop `src/main/studio/overlay.ts`: frameless, `transparent: true`, `backgroundColor: #00000000`).

## What changed

- **Glass you can see through.** The panel was 93% opaque; its middle is now 53–77% (measured from the rendered page's alpha, varying with what is on screen). It is a thin tint (`--glass-tint`), light gradients, inner shadows, a spectral rim warped by an SVG displacement filter (`#solar-liquid`), and a specular highlight that follows the pointer. Text sits on denser glass where it needs contrast.
- **Solar core** (`SolarCore.tsx`, three.js, already a dependency): a liquid core with a fresnel rim, a faceted shell, three orbital rings with nodes, links to the core, and a particle stream. Its state comes only from `useStudioAgent`: `looking`, `planning`, `thinking` (a model call in flight), `building` (a Studio step running), `testing` (play test), `done`, `error` (a warning or failed step), `typing`. Each completed Studio step sends one pulse. It pauses when hidden or off screen, is still with reduced motion, and disposes everything on unmount.
- **Header**: Keplar Studio, a Solar 5.8 Ultra badge that opens the model details (what Solar does, and that it is not a separately trained model), a status line, and the Studio / Blender switch on its own row with a sliding pill.
- **Stage and timeline**: the core is a hero above the empty state and morphs into a status strip once a build starts; the plan is a collapsible timeline that opens while a build runs.
- **Composer**: a floating glass capsule with a light that runs round it on focus, grows with its text, flashes on send; Build leans toward the pointer and springs on press; while a run is going the same spot is Stop with a turning ring. Idea chips in the empty state only fill the box.
- **Auto top-up**: a slim expandable row; its text, consent and payment flow are unchanged.

## Limits

- The page cannot sample Studio's pixels: `backdrop-filter` in a transparent window sees only this page, so Studio is seen through the glass but is not blurred or refracted. A native blur (Windows acrylic, macOS vibrancy) would have to be set on the desktop window and was not tried here (no Windows or macOS machine).
- Verified in Chromium (Playwright) with a stand-in desktop bridge and scripted agent turns, composited over a test backdrop. Not yet seen in the real desktop window over a live Roblox Studio.
- Frame rate measured only under software rendering (SwiftShader, no GPU): 17–24 fps for the whole page.

## Evidence

`docs/assets/solar/before-*.png` and `after-*.png` (440×760 overlay over the same test backdrop). `e2e/studio-overlay.e2e.ts` checks the transparent page and glass tint, the core reaching `idle`, `typing`, `building` and `done` from the run, the model details, Escape, and the Studio / Blender switch.

## Liquid glass (Oct 2026)

**Material:** Mike Bespalov's "Liquid Glass" pen (https://codepen.io/Mikhail-Bespalov/pen/MYwrMNy), MIT licence, copyright (c) 2026 Mike Bespalov. Its source was taken from the attributed mirror in `lekandigital/glass-projects-lab` (codepen.io is not reachable from the build environment); the lens map and licence are in `src/components/app-ui/studio-mode/liquid-glass/` (`pen-map.ts`, `LICENSE-liquid-glass.txt`).

**How the pen works:** `backdrop-filter: url(#frosted)`; the filter stretches a 200×200 lens map over the element (feImage), blurs the backdrop slightly and displaces it (feDisplacementMap, R → x, G → y, 128 = still), with the displacement scale animated 1 → 1.4 on hover. Chromium only.

**Engine (`liquid-glass/engine.ts`):** every surface gets its own filter. Round controls use the pen's own map; pills and panels get a map generated for their exact shape that pulls the backdrop inward at the rim and only faintly in the middle, so text behind stays readable. A spring drives each surface's displacement (`surge()`, `setStrength()`), interruptible. Pixel units (`userSpaceOnUse`).

**Rule found while reproducing:** no outer `box-shadow` on a glass surface. Chromium positions the displacement map against the element's visual overflow, so a drop shadow shifts the lens off the element (the pen itself shows this as an unrefracted crescent: `docs/assets/solar/glass/engine-shapes-with-shadow-bug.png` against `engine-shapes.png`).

**Where it is used:** title-bar controls (pen lens, swells on hover as in the pen), the Solar badge (grows into the details panel, clip-path spring from the badge's shape), the Studio / Blender switch (one glass pill that stretches as it slides), the composer (floats over the conversation, which scrolls under it; swells on focus), Build / Pause / Stop, and the status strip. Build carries its glass up to the strip (contract, stretch, land); the strip becomes the results panel when the run finishes (real counts).

**Scene-adaptive tint:** `useSceneTone` reads Keplar's own latest Studio screenshot (no guessing): bright, mixed or dark, and the panel's tint thickens over bright scenes. Light and dark themes each have presets.

**Solar core:** a glowing core inside a faceted crystal of physically based glass (transmission, IOR 1.52, dispersion, iridescence, studio environment), glass orbital rings with nodes, three orbiting coloured lights; drag to turn. Quality budget: half-resolution transmission, ≤1.5× density, and it steps down by itself when frames stay slow.

**Verified:** the pen reproduced in Chromium (70% of pixels under the lens changed against no filter) and in Electron 44.5.1 / Chromium 152, the desktop app's renderer (59%). The overlay in Electron 44 with a frameless transparent window like the real one: every glass surface has its filter, corners fully transparent, no errors, the composer refracts a striped layer behind it (18% of its pixels changed, at the rim). Over four scenes (bright, grey, dark, colourful): text readable, tint adapted, no page errors. Frame rate in software rendering only (no GPU here): about 12–19 fps with the core, 26–34 without.

**Not possible / not done:**
- Studio's own pixels are not refracted. The overlay window is transparent and the operating system composites Roblox Studio after Chromium has drawn, so a backdrop filter cannot sample it. The glass bends the overlay's own content (the core, the aura, messages scrolling under the composer); Studio shows through it unbent. A native blur of the desktop (Windows acrylic / macOS vibrancy on the window) would need a desktop-app change and a Windows or Mac to test it on.
- Not run over a live Roblox Studio; no GPU frame-rate measurement.
- A site rule removed every backdrop filter at ≤767 px wide (for phones); the overlay window is 440 px wide, so it is now exempt (`html[data-overlay]`, `src/styles/redesign.css`).
