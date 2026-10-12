---
title: Install the Keplar One browser extension
description: Add Keplar One to Chrome or Edge, paste a Keplar API key, and ask about a selection or a page from the toolbar or the right-click menu.
order: 1
updated: 2026-10-12
keywords: Keplar One extension, Keplar Chrome extension, Keplar Edge extension, AI browser extension, API key
howto: true
related: /docs/extension/search-with-keplar-one, /docs/extension/extension-privacy, /docs/reference/developers-and-api, /developers
---

The Keplar One extension puts Keplar in your browser's toolbar and right-click menu. It works in Chrome and Edge (version 116 or newer).

## What you need

- A Keplar API key, made in Keplar under Account, then Developer API. On the paid plans (Lite and above) the extension uses your plan's models. A Free key works too, with free models only and tight limits: a couple of questions a minute and a few dozen a day.
- Each question spends the same credits as a question in the Keplar app.

## Steps

The extension has been submitted to the Chrome Web Store and is waiting for Google's review. Once it is listed, install it from the store with one click. Until then, testers who have the extension zip can load it by hand:

1. Unzip the extension into a folder you will keep.
2. Open `chrome://extensions` (in Edge, `edge://extensions`) and turn on Developer mode.
3. Press **Load unpacked** and choose the folder.

## Add your key

1. In Keplar, open Account, then Developer API, and create a key with the `ask` scope. It is shown once, so copy it straight away.
2. Click the Keplar One button in the toolbar, paste the key and press **Save key**.

The key stays in the extension's own storage on this device. Press **Remove key** in the popup to delete it, and revoke the key in Account to cut off access everywhere at once.

## Ask about a page

- Click the toolbar button, type a question, and optionally press **Add selected text** or **Add page text**.
- Or right-click selected text and choose "Ask Keplar One about" it, or right-click a page and choose "Ask Keplar One about this page".

The answer shows how many models agreed, the formatted answer and, when the models split, where they differed. For anything on the page you can point at, including pictures, use [Search with Keplar One](/docs/extension/search-with-keplar-one).

## When it can't read a page

No extension can read the browser's own pages, such as settings or the web store. On those pages, type the question yourself.
