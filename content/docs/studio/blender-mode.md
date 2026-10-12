---
title: Blender mode
description: Connect the Keplar desktop app to Blender 4.2 or newer and model, texture, light and export assets by describing them, approving each change as it goes.
order: 4
updated: 2026-10-12
keywords: Blender AI, Blender co-builder, AI 3D modeling, Poly Haven textures, export FBX for Roblox
howto: true
related: /blender-ai, /docs/studio/roblox-studio-mode, /docs/desktop/install-desktop-app
---

Blender mode brings the same co-builder to Blender. It is part of Keplar Lite, Plus and Pro, in the desktop app version 0.1.8 or newer, with Blender 4.2 or newer on the same computer.

## Steps

1. Update the desktop app to 0.1.8 or newer.
2. Open Blender with the scene you want to work in.
3. In the desktop app, open Blender mode and press **Set up Blender** once. It installs and enables a small Keplar add-on in Blender for you. Then press **Connect to Blender**.
4. Describe the asset, for example "a low-poly wooden crate with worn edges" or "light this scene with an outdoor HDRI".

## What it does

Keplar reads the scene as a compact text summary (cheaper than screenshots), makes a short plan, and builds with clean topology and modifiers at real-world scale. Every object gets a name and goes into a collection. For realistic surfaces it searches Poly Haven, whose assets are CC0 and free for any use, and applies a full material set: color, roughness, normal, ambient occlusion and displacement, unwrapping meshes that have no UVs. For stylized looks it builds node materials, and it can light a scene with an HDRI or import a Poly Haven model.

## Export for games

Finished assets export as FBX (which imports into Roblox Studio), GLB or OBJ into Documents/Keplar exports. For Roblox, it aims to keep each mesh under ten thousand triangles and applies transforms before exporting; check the counts in Blender before you upload.

## Safe by default

The add-on only listens on your computer, behind a secret key. Keplar's Python may not touch files, the network or other apps, and may not save or close Blender. Deleting always asks, and every change waits for approval unless you turn on auto-approve.

## Cost and continuity

A short cached prompt, text summaries and small thinking budgets keep each step's AI usage low. Each .blend file has its own chat, saved and synced to your account, and the floating overlay can sit next to Blender while you work.
