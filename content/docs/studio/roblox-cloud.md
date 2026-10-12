---
title: Roblox Cloud (overnight jobs)
description: Hand Keplar a goal for your Roblox game and close your computer. It works on your scripts on Keplar's servers and leaves changes for you to review and apply in Studio.
order: 2
updated: 2026-10-12
keywords: Roblox Cloud, overnight Roblox development, AI Roblox scripts, Luau checker, Keplar Roblox Cloud
howto: true
related: /docs/studio/roblox-studio-mode, /docs/studio/effects-and-textures, /docs/billing-plans/credits-explained
---

Roblox Cloud lets Keplar keep working on your game while you are away. You give it a goal, a credit budget and a time limit; it works on Keplar's servers, so you can close Studio, the desktop app and even your computer.

## What it can and can't do

Roblox Studio doesn't run on a server, so a cloud job works on a copy of your game's scripts: every Script, LocalScript and ModuleScript, plus a summary of the instance tree. It can read, search and edit scripts, create new ones, and propose deleting old ones. It can't play-test, take screenshots, insert assets, or change parts, models, UI objects or properties. Anything that needs Studio goes into the report as a next step.

## Steps

1. Connect Studio mode to the place you want to work on.
2. Scroll to **Roblox Cloud** at the bottom of the Studio page.
3. Write the goal, for example: "Fix the inventory bugs, add a pet system with equip and follow, and make the shop remotes secure."
4. Choose how long: until the goal is done, for a set time, or just the first step so you can review before it continues. Pick a time limit (up to 12 hours) and a budget (300 to 20,000 credits).
5. Press **Start the job**. Keplar reads your scripts from Studio in batches, uploads them, and starts.

## While it works

Every edit is checked with Luau's own analyzer, the official tool from the Luau team, for syntax errors, misspelled globals and type errors in the script's mode. Roblox API types aren't checked, and scripts larger than 28 KB aren't checked in the cloud. Jobs use Claude Opus 5.5 only. A job stops on its own when the goal is done, when it reaches your budget or time limit, after repeated failures, or when it stops making progress. You can pause, resume or stop it from the job card at any time.

## Review and apply in the morning

The report lists what was done, what is still open or needs Studio, things to try in a play test, and problem counts before and after. Open **Review changes** to see a diff for every script, tick the ones you want, and press **Apply in Studio**. Each change is one Undo step. A script you edited after the snapshot is skipped, never overwritten, and a proposed deletion only happens if you tick it.

Jobs are kept for 30 days, up to eight per account, and one runs at a time.
