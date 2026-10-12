---
title: Effects, flipbooks and textures in Studio mode
description: How Studio mode builds visual effects: flipbook particles, emission and light settings that look right, layered effects, and where its free textures come from.
order: 3
updated: 2026-10-12
keywords: Roblox flipbook particles, Roblox VFX AI, ParticleEmitter flipbook, LightEmission, Roblox textures
related: /docs/studio/roblox-studio-mode, /docs/studio/roblox-cloud, /roblox-studio-ai
---

Effects are where AI-built games usually look cheap. Studio mode follows a set of craft rules so fire, magic, impacts and smoke read the way a VFX artist would build them.

## Flipbook particles

A flipbook plays a sprite sheet on each particle, so smoke billows and explosions bloom instead of fading in and out. Roblox only plays flipbooks from 1024 by 1024 sheets laid out as 2 by 2, 4 by 4, 8 by 8 or a custom grid. Keplar uses the grid the sheet's creator states and never guesses one. Impacts, slashes and puffs play once over the particle's lifetime; fire, smoke and auras loop at about 20 to 30 frames a second, each particle starting on a random frame so they don't move in step. After placing a flipbook it checks Roblox's own compatibility property and swaps the sheet if it isn't valid, so a broken flipbook never ships.

## Emission and light

Glowing effects such as fire, energy and sparks are additive and self-lit, with a bright core that blooms and a softer outer glow. Smoke, dust and debris are lit by the scene so they look solid, and sit behind the glow. Colors run from near-white at the hottest point to the hue to a darker hue, transparency fades in quickly and eases out, and sizes grow or shrink instead of popping.

## Layered, and light on performance

Each effect is a stack: core, glow, flipbook body, sparks, smoke behind, and a short pulse of light. Bursts fire through one reusable effects module, Bloom is tuned once for the place, and particle counts stay modest so effects don't cost frame rate.

## Where textures come from

Keplar looks in this order: Zonito's free particle pack on the Creator Store, a short list of flipbook sheets whose creators state the grid and mode, then a filtered Creator Store search that skips reuploads and blurry sheets. If nothing fits, it makes its own looks in Studio. Uploading new images to your Roblox account is possible, and always asks first.
