---
title: Blender Cloud rendering
description: Render a Blender scene on Keplar's servers while your computer is off. Pack it with its textures, pick frames and a budget, then download the frames and an MP4.
order: 5
updated: 2026-10-12
keywords: Blender cloud rendering, render Blender online, Blender render farm, render while my computer is off, Cycles EEVEE cloud render
howto: true
related: /blender-ai, /docs/studio/blender-mode, /docs/desktop/install-desktop-app
---

Blender Cloud renders the scene you have open in Blender on a render machine of Keplar's own, so you can close Blender, or turn your computer off, while the frames are made. It is part of Keplar Lite, Plus and Pro, in the desktop app version 0.1.10 or newer.

## Steps

1. Update the desktop app to 0.1.10 or newer, press **Set up Blender** once to update the Keplar add-on, and restart Blender.
2. Connect to Blender, then press **Prepare a cloud render**. Keplar saves a copy of the scene as it is right now, unsaved changes included, and packs its textures and linked files into that copy. Your own .blend file isn't changed.
3. Read what it found. Textures missing on your computer are listed (they would render pink), and so is anything that can't travel with the file, such as simulation caches on disk, image sequences or Python drivers.
4. Choose the engine, the frames (this frame, the whole animation or a range you pick), the resolution, the samples and the format: PNG, JPEG or OpenEXR. For an animation you can also have the frames joined into an MP4. Set a time limit and a credit budget.
5. Press **Render in the cloud**. The scene uploads straight to its render machine. Once the render has started, Keplar, Blender and your computer can all be closed.
6. When it's finished, press **Download the renders**. The frames, and the video if you asked for one, go to Documents/Keplar renders.

## How the cloud renders

The machines run Blender 5.2 on CPUs, without a graphics card: Cycles uses every core, and EEVEE and Workbench render through software graphics. Expect a frame to take longer than it would on a good graphics card. OptiX denoising needs an NVIDIA card, so Open Image Denoise takes its place. Add-ons you installed in Blender aren't on the machine, and the scene's own Python scripts don't run there. The machine has no internet access at all; only Keplar's server and your desktop app can reach it, with a key made for that one job.

## What it costs

Rendering is charged by machine time, not per frame. The panel shows about how many credits a minute the machine uses before you start, and uploading the scene costs nothing. A render stops by itself at your budget or your time limit, whichever comes first, and every frame finished by then is kept. **Pause** stops the machine and the charge; **Resume** renders only the frames still missing.

## Long renders

A machine session has a maximum length (about 45 minutes right now). When a render runs longer, Keplar continues on a fresh session and renders only the frames that aren't done yet. The frame that was in progress at that moment starts over, so a single frame has to finish within one session.

## How long renders are kept

Finished renders stay downloadable for three days after the render ends; then the machine, the scene and the frames are deleted. You can delete them sooner with **Delete from the cloud**. An account keeps up to eight cloud renders, and one runs at a time. Cloud rendering has a shared amount of machine time each month; when it's used up, new cloud renders open again the next month, and you can still render in Blender on your own computer.
