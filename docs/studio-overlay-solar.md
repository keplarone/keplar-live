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

**Material:** liquid-glass-react 1.1.1 (https://github.com/rdev/liquid-glass-react), MIT licence, copyright (c) 2025 Max Rovensky, used as the npm package (its licence ships with it). It replaced an earlier engine built on Mike Bespalov's "Liquid Glass" pen; none of that code or its lens map remains.

**How the library works:** its glass is a frosted `backdrop-filter` (blur and saturation) with an SVG filter on top that displaces the backdrop three times with slightly different strengths (red, green and blue split at the rim: chromatic aberration), plus edge highlights that take their light from the pointer and a small elastic lean toward it. Chromium only; Safari and Firefox get the frost without the displacement.

**How Keplar uses it (`liquid-glass/glass.tsx`, `GlassLayer`):** the library centres its glass on a point; Keplar puts one inside each surface instead, sized to the surface, under its content (`z-index: -1` inside the surface's own stacking context, clipped to its shape), with the pointer tracked over the whole surface. It is drawn only in the browser (the library reads `navigator` while rendering, which would break server rendering). It measures itself only on mount and on window resize, so when a surface settles at a new size one shared `resize` event lets every glass re-measure in place; the glass is hidden for its first 80 ms so the frame before it has measured itself is never seen (by `visibility`: an opacity below 1 would cut it off from the backdrop it refracts). The surface keeps a tint; its rim is the library's highlight (a fixed border beside it read as a second outline).

**Where it is used:** title-bar controls, the Solar badge (grows into the details panel, clip-path spring from the badge's shape), the Studio / Blender switch (one glass pill that stretches as it slides), the composer (floats over the conversation, which scrolls under it), Build / Pause / Stop, the details panel and the status strip, which becomes the results panel when the run finishes (real counts). Build sends a frosted surface up to the strip (contract, stretch, land); that traveller is a plain backdrop blur, not the library's glass.

**Scene-adaptive:** `useSceneTone` reads Keplar's own latest Studio screenshot (no guessing): bright, mixed or dark. The panel's tint thickens over bright scenes, and over a bright scene the glass uses the library's `overLight` mode (darker, refracts half as much). Light and dark themes each have presets.

**Solar core:** a glowing core inside a faceted crystal of physically based glass (transmission, IOR 1.52, dispersion, iridescence, studio environment), glass orbital rings with nodes, three orbiting coloured lights; drag to turn. Quality budget: half-resolution transmission, ≤1.5× density, and it steps down by itself when frames stay slow.

**Verified (liquid-glass-react):** in Chromium over grey and bright test scenes, every glass surface (9 in a full run) has the library's displacement filter and frost, sized to its surface; Stop keeps its red tint; no page errors (`docs/assets/solar/glass/liquid-glass-react-overlay.png`). In Electron 44.5.1 / Chromium 152 with a frameless transparent window like the real one: every visible glass surface has its filter, corners fully transparent, the core renders, no errors; the composer bends a striped layer behind it (9.6% of its pixels change with the filter on against off) (`liquid-glass-react-electron44.png`). Frame rate there in software rendering only (no GPU in this container): about 7 fps with the core, lower than the previous engine's 12–15, since the library draws three displacement passes per surface and re-renders on pointer moves; not measured on a GPU.

**Not possible / not done:**
- Studio's own pixels are not refracted. The overlay window is transparent and the operating system composites Roblox Studio after Chromium has drawn, so a backdrop filter cannot sample it. The glass bends the overlay's own content (the core, the aura, messages scrolling under the composer); Studio shows through it unbent. A native blur of the desktop (Windows acrylic / macOS vibrancy on the window) would need a desktop-app change and a Windows or Mac to test it on.
- Not run over a live Roblox Studio; no GPU frame-rate measurement.
- A site rule removed every backdrop filter at ≤767 px wide (for phones); the overlay window is 440 px wide, so it is now exempt (`html[data-overlay]`, `src/styles/redesign.css`).
