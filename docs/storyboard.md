# Homepage storyboard — "Convergence"

The homepage is one continuous take. A single sticky stage holds the persistent WebGL
canvas, the scene copy, and the product window. Scroll is the clock: **1 timeline unit =
1vh of scroll** inside the narrative section (`src/gl/scenes.ts`). Scrub damping 1.1s.
Everything below is reversible by scrolling back.

**Actors.** ~18,000 particles (desktop) / ~7,000 (mobile), split into six streams. Each
stream is one intelligence and keeps its identity all the way through:

| id | colour | motion signature (responses) | role in the demo |
|---|---|---|---|
| 0 | ice blue `#3E6FE8` | straight, tight | Research |
| 1 | lavender `#6E63DB` | helix, 4 turns | Reasoning |
| 2 | cyan `#2A9DB0` | flat ribbon | Finance |
| 3 | steel blue `#4F86D0` | pulsed packets | Market Analysis* |
| 4 | violet `#8274CC` | double strand | Regulatory |
| 5 | warm `#D9795B` | wide, slow | the dissent |

\* The demo names Market Analysis as the dissenting intelligence; the 3D keeps the dissent
as the one warm stream so the colour story reads without labels.

~16% of particles are **noise** (they vanish during verification). ~30% of each stream are
**node** particles (they form the intelligence's shell in distribution).

---

## Desktop (≥900px)

| # | Scene | Scroll (vh) | Camera (pos → look, fov) | Particle state | DOM copy |
|---|---|---|---|---|---|
| 0 | **Hero** | 0–90 | (0, 0, 9.5) → (0.4, 0, 0), 38° | Six parametric trajectories flow left→right on distinct frequencies, amplitudes and depths, and all pinch through one focal point right of centre (2.35, 0). Left third is dimmed behind the copy. Pointer parts the streams slightly. | Bottom-left: **Stop trusting one AI.** (display) · *One question. Multiple intelligences.* **One answer.** · body · `Ask Keplar →` `See how it works`. Fades out 40–62. |
| 1 | **Question** | 90–200 (hold 170) | cranes up to (0, 1.9, 7.4) → (0, −0.2, −1.6), 40° | All streams collapse into one ink-coloured beam that starts behind the prompt card and dives into depth (0, 0.2, −5.5), spiralling tighter as it recedes. Colour → ink: it's one question now. | Centre: label QUESTION, glass prompt card "Should our company expand into Japan next year?", caption "One question enters the system." |
| 2 | **Distribution** | 200–310 (hold 290) | (−0.6, 0.9, 8.6) → (0, 0.1, −0.8), 42°, slight roll | The beam's end splits along six Bézier paths to six abstract nodes on an ellipse (no logos). 30% of each stream settles on its node as a breathing particle shell. Paths go ink→stream colour as they travel. | Bottom-left: DISTRIBUTION · **Keplar-One decides who to ask.** · "Not every model, every time…" |
| 3 | **Responses** | 310–410 (hold 392) | (1.2, 0.3, 8.2) → (0.3, 0.1, 0), 40° | Each node answers back along its own path with its own motion signature (table above). Five paths bend toward a shared gather point; stream 5 arcs away toward the upper right. | Bottom-right: RESPONSES · **Each answers on its own.** · "Different reasoning… Some don't." |
| 4 | **Disagreement** | 410–560 (hold 525) | drifts right and tightens: (2.4, 0.35, 7.6) → (1.45, 0.3, 0), 36° | Flow speed drops to 0.3×: the environment slows. The five agreeing streams braid into one cable rising to the gather point, tinted toward a shared blue. The warm stream holds apart in a slow open orbit; the camera follows it. | Left, large: ● DISAGREEMENT DETECTED. · **5 agree.** · *1 doesn't.* (grey) · **Keplar investigates why.** |
| 5 | **Verification** | 560–680 (hold 655) | recentres (−0.4, 0.2, 7.8) → (0.1, 0, 0), 38° | Particles move onto three tilted evidence rings. Related points cluster into sources along each ring. Noise particles fade out. Half of the dissent (valid points) joins the rings and cools in colour; the contradicted half is held apart in its own small cluster, separated rather than deleted. | Right column: VERIFICATION · **Evaluation, not voting.** · "…The minority can be right." |
| 6 | **Convergence** | 680–810 (hold 792) | settles front-on (0, 0, 7.2) → (0, 0, 0), 38° | Every particle travels to a sampled point on the founder's mark (62% area fill, 38% edge tracing) at (1.75, 0), size 2.6. Colour → ink. From 740 the solid mark resolves underneath: three clear-coated black extrusions at slightly different depths, turning the last few degrees into place. Particles thin to a fine grain on its surface. | Left, huge: CONVERGENCE · **ONE ANSWER.** · "Synthesized from what held up, with its confidence shown." |
| 7 | **Transition → product** | 810–900 | unchanged (front-on keyframe the window rect is computed from) | Solid mark fades (815–850). Particles leave the mark and trace a wireframe of the product window: outer frame, title bar rule, sidebar rule, answer lines, exactly on the DOM window's rectangle (projected per resize). 858–890 the real glass window fades in over the wireframe while the particles hand off (870–900). No screenshot, no cut. | — |
| 8 | **Product demo** | 900–1040 | — | Canvas idle (particles handed off). | Glass app window, centred. Plays automatically once: *Understanding request… → Selecting intelligence…* (chips: Research, Reasoning, Finance, Market Analysis, Regulatory, Risk) *→ Comparing…* (six response bars) *→ Disagreement detected* (one bar lifts, warm) *→ Verifying… → Synthesizing…* → **Keplar Answer** with Consensus ring **87%**, "5 agree · 1 disagrees", answer, and expandable Consensus / Models consulted / Sources / Disagreements / Verification / Reasoning summary. Labelled "Illustrative example". Replay button. |

After 1040vh the sticky stage releases and the window scrolls up naturally into the next
section.

## Mobile (<900px) — composed separately

Same clock and scene order (so the argument is intact), different world and copy layout
(`mobileLayout`, `CAMERA.mobile`). Particle budget 7,000 (×0.6 on low-tier devices);
point size 2.4; camera further back (z ≈ 9–11, fov 44–46°) for portrait framing.

| # | Scene | Composition |
|---|---|---|
| 0 | Hero | Copy stacks from the top under the nav (title, lead, body, CTAs). Streams run across the lower third and pinch at (0.2, −1.6), directly under the CTAs. |
| 1 | Question | Prompt card centred slightly low; beam rises from it into depth. |
| 2 | Distribution | Nodes on a tall ellipse (1.5 × 2.1) in the lower two-thirds; copy at top. |
| 3 | Responses | Gather point low-left; dissent arcs to upper right. Copy at top. |
| 4 | Disagreement | Cable rises centre; dissent orbit upper right. Copy anchored to the bottom (5 agree. / 1 doesn't. at 15vw). |
| 5 | Verification | Rings at 72% scale in the lower half; contradicted cluster bottom-right. Copy at top. |
| 6 | Convergence | Mark centred low (0, −1.2), size 2.3; **ONE ANSWER.** at top. |
| 7–8 | Product | Single-column window (sidebar hidden), 3 composer tools, same states and answer. |

## Reduced motion
No scrub, no flow, no pointer response. Each scene is shown as its composed *hold* frame
(numbers above), switching as the reader scrolls into the scene. The demo shows the final
answer immediately. The WebGL canvas renders once per change.

## No WebGL
Static SVG: six dotted trajectories converging on the SVG mark; the mark appears in the
convergence scene. All copy and the product window work unchanged.

## No JavaScript
The section renders as a normal document: hero, then each scene's copy in order, then the
window. Nothing is hidden behind scripts.
