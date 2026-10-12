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
