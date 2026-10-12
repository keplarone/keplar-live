---
title: Browser extension privacy and permissions
description: Exactly what the Keplar One extension reads, what it sends to Keplar and when, what it keeps on your device, and why it asks for each browser permission.
order: 3
updated: 2026-10-12
keywords: Keplar extension privacy, extension permissions, activeTab, what the extension sends, Keplar data
related: /privacy, /docs/extension/search-with-keplar-one, /docs/privacy-security/data-handling
---

The extension is built to read as little as possible, and only after you ask.

## What it reads, and when

Nothing on a page is read until you press a button in the popup or choose one of the extension's right-click items. Then it reads only what that action needs: the text you selected, the text of the page, or the area you drag with Search with Keplar One. It works on the tab you chose and never sees other tabs, other windows or the rest of your screen.

## What it sends

- **A question from the popup or the right-click menu** sends your question and the text you added, using your API key.
- **Search with Keplar One** sends the words inside the area you dragged and a JPEG picture of that area, after you agreed once on its first-use card. Follow-ups also send that search's earlier questions and answers.
- Pages are labeled by host name only, never by the full address.

Everything goes to keplar.one and nowhere else. The extension has no analytics, no advertising and no remote code. Keplar processes the request like a question in the app, using the AI model providers it selects; pictures go only to models that can read images. Neither the extension nor Keplar saves the question, the answer or the picture.

## What it keeps on your device

Only two things: your API key, and the fact that you agreed to Search with Keplar One. Both live in the extension's own storage. Removing the key or the extension deletes them.

## Why it needs each permission

- **activeTab:** read the tab you are on, and capture a picture of the area you drag, only after you click.
- **scripting:** run the extension's own packaged script on that tab to read text or draw the search overlay.
- **contextMenus:** add the Keplar One items to the right-click menu.
- **storage:** keep your key and your one-time agreement.

It requests no access to websites in advance. The full policy is on the [privacy page](/privacy).
