---
title: Roblox Studio mode
description: Connect the Keplar desktop app to Roblox Studio and build with a co-builder that plans, builds, fixes script errors and asks before every major change.
order: 1
updated: 2026-10-12
keywords: Roblox Studio AI, Roblox co-builder, Luau AI, Keplar Studio mode, build Roblox games with AI
howto: true
related: /roblox-studio-ai, /docs/studio/roblox-cloud, /docs/studio/effects-and-textures, /docs/desktop/install-desktop-app
---

Studio mode is a co-builder for Roblox Studio. It runs in the Keplar desktop app on the same computer as Studio and works through Studio's own tools, so every part, script and property it touches is visible in your Explorer. It is included with Keplar Lite, Plus and Pro.

## Steps

1. [Install the desktop app](/docs/desktop/install-desktop-app) and sign in.
2. Open a place in Roblox Studio. An empty Baseplate works, and so does a game you are already making.
3. In the desktop app, open Studio and press **Connect to Roblox Studio**. Keplar starts Studio's connection on this computer; nothing is sent anywhere until you ask for a build.
4. Describe what you want, and attach screenshots or a short clip if you have a look to match.

## How a build goes

Keplar first reads your place: the Explorer tree and, at the start of a session, one screenshot. It writes a numbered plan, then works through it step by step, starting each message with the step it is on. It builds in large, organized pieces (whole districts, interfaces or systems in one go), keeps everything in named folders, and writes complete Luau. After a script runs it reads the output log and fixes any error it caused.

When the plan is done it ends with a short "How to test it" list. Press **Play test** to start and stop play mode in Studio directly; that costs no AI usage. Tell Keplar what to change and it makes a small, focused fix.

## You approve the changes

- Reading your place happens on its own.
- Changes wait for your approval, unless you turn on auto-approve for safe changes.
- Deleting, publishing, data stores, teleports, monetization and uploading images to your Roblox account always ask first, whatever the setting.

## The model

Studio mode always uses Claude Opus 5.5. It never switches to another model behind the scenes; if Opus 5.5 is unavailable, the build pauses with a message instead. Each turn is charged in credits at its real cost, and the running total shows in the side panel.

## Your chat follows the game

Each game keeps its own conversation, plan and progress, saved on the device and synced to your Keplar account. Close Studio, come back tomorrow or on another computer, and continue. A floating overlay can keep the chat next to Studio while you watch it build.
