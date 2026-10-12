# Chrome Web Store submission: ready to submit (NOT submitted yet)

Everything below is ready for the owner to paste into the Chrome Web Store developer dashboard
(https://chrome.google.com/webstore/devconsole) and submit by hand. Keplar has not submitted anything to any store. The
developer account fee is paid. Re-read every claim against the extension on the day you submit.

## 1. Package
- Upload: `extension/dist/keplar-extension-0.1.0.zip` (build it fresh with `npm run build:extension`; the build
  validates permissions, CSP and the no-remote-code rules before it writes the zip).
- Manifest V3, version 0.1.0, Chrome 116 and later.

## 2. Store listing tab
**Name** (from the manifest): Keplar One

**Summary** (from the manifest, 132 characters max): Ask Keplar One about selected text, a page, or an area you drag. Several AI models, one answer. Needs a Keplar API key.

**Category:** Productivity. **Language:** English.

**Description:**

Keplar One adds Keplar to your browser toolbar and right-click menu.

Search anything on a page, like a lens: right-click, choose "Search with Keplar One", and drag over text or a picture. Keplar asks several AI models, writes one answer in a side panel, and shows how many agreed and where they split, so you know which parts to double-check. Ask follow-ups right there.

How it works
• Click the toolbar button, type a question, and optionally press "Add selected text" or "Add page text".
• Or right-click selected text (or the page) and choose "Ask Keplar One…".
• Or right-click anywhere and choose "Search with Keplar One" (or press "Search with Keplar One" in the toolbar). Drag over any part of the page: text, a picture, a chart. The answer opens in a side panel, with Copy text, Translate and Copy as image next to the area, and a box to ask a follow-up.
• Nothing is read from a page until you press one of those buttons or choose a menu item. The overlay is drawn only after that click.

What you need
• A Keplar API key. Keys are available on paid Keplar plans (Lite and above) and are created in Keplar → Account → Developer API. The Free plan can't create keys.
• Each question spends the same credits as a question in the Keplar app.

Privacy
• Your text is sent to keplar.one only when you press Ask. The extension has no other servers.
• Search with Keplar One asks you once before its first search. After you agree, a search sends the words inside the area you dragged and a picture of that area (only that part of the tab), answered by models that can read images. It is not saved.
• The only things saved on your device are your API key and that you agreed to Search with Keplar One (in the extension's own storage). Questions, answers and pictures are not saved.
• No analytics, no advertising, no tracking, no remote code.

Honest limits
• It can be wrong: models can agree and still be mistaken.
• Browser pages (settings, the web store) can't be read by any extension.
• "Search with Keplar One" covers the browser tab you right-clicked. It cannot see other windows or the rest of the screen.
• Chrome and Edge only for now.

**Graphics** (all in `extension/store/`, made from the real extension by `scripts/extension-store-assets.mjs`):
- Store icon: `extension/icons/icon128.png` (128x128, 96x96 artwork with 16 px transparent padding, as the store asks).
- Screenshots, 1280x800, in this order:
  1. `screenshot-1-lens.png`: Search with Keplar One, the answer in the side panel next to the area searched.
  2. `screenshot-2-lens-select.png`: dragging over part of a page.
  3. `screenshot-3-answer.png`: an answer in the toolbar popup, with the agreement line.
  4. `screenshot-4-page-text.png`: page text added from the right-click menu, question typed.
  5. `screenshot-5-setup.png`: first run, paste a key.
- Small promo tile, 440x280: `promo-small.png`. Marquee, 1400x560 (optional): `promo-marquee.png`.
- Honesty note on the screenshots: the popup, the Search with Keplar One overlay and their layout are the real extension
  (the Lens frames come from `scripts/extension-lens-e2e.mjs` driving it in a real browser). The answer shown is a real keplar.one
  answer to the question in the screenshot (`extension/store/sample-answer.json`), served to the popup without a real key.
  The article behind it is an original sample page made for the screenshot.

**Homepage URL:** https://keplar.one/developers. **Support URL:** https://keplar.one/contact.
**Official URL** (optional): only after keplar.one is verified for this developer account in Google Search Console.
**Mature content:** No.

## 3. Privacy practices tab
**Single purpose:**
Let the user ask the Keplar service a question about text they select, the page they are viewing, or an area of the current tab they drag over (its words and a picture of it), and show the answer.

**Permission justifications:**
- `activeTab`: reads the selected text, visible text, or words inside a drag on the current tab only after the user clicks the toolbar button or a context-menu item. The same gesture lets it capture a picture of the dragged area of that tab: shown as a preview, and, once the user has agreed in the Search with Keplar One consent card, sent with that search to answer it. No access to other tabs, and no background access.
- `scripting`: runs a script packaged inside the extension on the active tab, to read the selection or page text, or to draw the search overlay (that same user action). No remote code is loaded or evaluated.
- `contextMenus`: adds "Ask Keplar One about the selection", "Ask Keplar One about this page", and "Search with Keplar One" to the right-click menu.
- `storage`: saves the user's API key and their one-time agreement to Search with Keplar One locally (`storage.local`) and holds a one-time hand-off from the context menu to the popup (`storage.session`, cleared when the browser closes).
- Host permissions: none requested. The extension calls `https://keplar.one/api/v1/ask` with a bearer key; the API allows that cross-origin call.

**Remote code:** No, I am not using remote code. (All scripts are in the package; the CSP is `script-src 'self'`.)

**Data usage, tick:**
- Authentication information: the API key the user pastes. Stored on the device; sent only to keplar.one with each question.
- Website content: the text the user chooses to send (a selection, the page text, or the words in a drag), a picture of the
  dragged area for Search with Keplar One (after the user agreed once), and the page's host name as a label (never the full
  address). Sent only when the user asks or drags to search.
- Do not tick the others: the extension collects no personally identifiable information, health, financial, personal
  communications, location, web history list or user activity (no analytics, no clicks or keystrokes are recorded).

**Certify all three:** not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not
used or transferred to determine creditworthiness or for lending. (The text and pictures are processed by the AI providers Keplar selects
to write the answer, as the privacy policy says; that is the extension's purpose, not an unrelated transfer.)

**Privacy policy URL:** https://keplar.one/privacy (the browser extension is covered at https://keplar.one/privacy#teams-api-extension).

## 4. Distribution tab
- Payments: free (the extension itself is free; the API key comes with a paid Keplar plan, which the description says).
- Visibility: Public. (Choose Unlisted first if you want to try the store install before anyone can find it.)
- Regions: all.

## 5. Test instructions tab (for Google's reviewer)
The extension does nothing without a Keplar API key, so give the reviewer one or the review can fail as "not testable".
1. In Keplar, sign in to a paid account → Account → Developer API → create a key named "Chrome Web Store review", scope
   `ask`, with an expiry of about 30 days and a low credit limit. Copy it (it is shown once).
2. Paste into the Test instructions field:
   "Click the Keplar toolbar button, paste this key into API key and press Save key: <key>. Then open any article, select a
   sentence, right-click and choose 'Ask Keplar One about the selection', and press Ask. Or right-click the page and choose
   'Search with Keplar One', press Continue on the card, and drag over some text or a picture. The key is for review only and expires on <date>."
3. Revoke the key once the review is done (Account → Developer API → Revoke).

## Version notes (0.1.0)
First release. Search with Keplar One: drag over text or a picture on any page and get one answer from several AI models in a side panel, with follow-ups, Copy text, Translate and Copy as image. Ask about selected text or the page from the toolbar or the right-click menu. Answers include where the models disagreed, with formatting (bold, lists, code). Chrome and Edge only.
