# Chrome Web Store submission: ready to submit (NOT submitted yet)

Everything below is ready for the owner to paste into the Chrome Web Store developer dashboard
(https://chrome.google.com/webstore/devconsole) and submit by hand. Keplar has not submitted anything to any store. The
developer account fee is paid. Re-read every claim against the extension on the day you submit.

## 1. Package
- Upload: `extension/dist/keplar-extension-0.1.0-beta.zip` (build it fresh with `npm run build:extension`; the build
  validates permissions, CSP and the no-remote-code rules before it writes the zip).
- Manifest V3, version 0.1.0 (shown as 0.1.0-beta), Chrome 116 and later.

## 2. Store listing tab
**Name** (from the manifest): Keplar (beta)

**Summary** (from the manifest, 132 characters max): Beta. Ask Keplar about selected text, a page, or an area you drag on this tab. Needs a Keplar API key (paid plans).

**Category:** Productivity. **Language:** English.

**Description:**

Keplar (beta) adds Keplar to your browser toolbar and right-click menu.

Select some text, or open a page, and ask a question about it. Keplar asks several AI models, writes one answer, and shows how many agreed and where they split, so you know which parts to double-check.

How it works
• Click the toolbar button, type a question, and optionally press "Add selected text" or "Add page text".
• Or right-click selected text (or the page) and choose "Ask Keplar…".
• Or right-click the page and choose "Search this tab with Keplar (beta)". Drag a rectangle. Suggestions and Ask run only when you click them.
• Nothing is read from a page until you press one of those buttons or choose a menu item. The overlay is drawn only after that click.

What you need
• A Keplar API key. Keys are available on paid Keplar plans (Lite and above) and are created in Keplar → Account → Developer API. The Free plan can't create keys.
• Each question spends the same credits as a question in the Keplar app.

Privacy
• Your text is sent to keplar.one only when you press Ask. The extension has no other servers. A picture of a dragged area is not uploaded.
• The only thing saved on your device is your API key (in the extension's own storage). Questions, answers and pictures are not saved by the extension.
• No analytics, no advertising, no tracking, no remote code.

Honest limits
• This is a beta. It can be wrong: models can agree and still be mistaken.
• Browser pages (settings, the web store) can't be read by any extension.
• "Search this tab" covers the browser tab you right-clicked. It cannot see other windows or the rest of the screen.
• If a dragged area has no words, Keplar says so. It does not read the picture.
• Chrome and Edge only for now.

**Graphics** (all in `extension/store/`, made from the real extension by `scripts/extension-store-assets.mjs`):
- Store icon: `extension/icons/icon128.png` (128x128, 96x96 artwork with 16 px transparent padding, as the store asks).
- Screenshots, 1280x800, in this order:
  1. `screenshot-1-answer.png`: an answer with the agreement line.
  2. `screenshot-2-page-text.png`: page text added from the right-click menu, question typed.
  3. `screenshot-3-setup.png`: first run, paste a key.
- Small promo tile, 440x280: `promo-small.png`. Marquee, 1400x560 (optional): `promo-marquee.png`.
- Honesty note on the screenshots: the popup and its layout are the real extension. The answer shown is a real keplar.one
  answer to the question in the screenshot (`extension/store/sample-answer.json`), served to the popup without a real key.
  The article behind it is an original sample page made for the screenshot.

**Homepage URL:** https://keplar.one/developers. **Support URL:** https://keplar.one/contact.
**Official URL** (optional): only after keplar.one is verified for this developer account in Google Search Console.
**Mature content:** No.

## 3. Privacy practices tab
**Single purpose:**
Let the user ask the Keplar service a question about text they select, the page they are viewing, or the words inside an area they drag on the current tab, and show the answer.

**Permission justifications:**
- `activeTab`: reads the selected text, visible text, or words inside a drag on the current tab only after the user clicks the toolbar button or a context-menu item. The same gesture can capture a picture of that tab for a local preview. No access to other tabs, and no background access.
- `scripting`: runs a script packaged inside the extension on the active tab, to read the selection or page text, or to draw the search overlay (that same user action). No remote code is loaded or evaluated.
- `contextMenus`: adds "Ask Keplar about selection", "Ask Keplar about this page", and "Search this tab with Keplar (beta)" to the right-click menu.
- `storage`: saves the user's API key locally (`storage.local`) and holds a one-time hand-off from the context menu to the popup (`storage.session`, cleared when the browser closes).
- Host permissions: none requested. The extension calls `https://keplar.one/api/v1/ask` with a bearer key; the API allows that cross-origin call.

**Remote code:** No, I am not using remote code. (All scripts are in the package; the CSP is `script-src 'self'`.)

**Data usage, tick:**
- Authentication information: the API key the user pastes. Stored on the device; sent only to keplar.one with each question.
- Website content: the text the user chooses to send (a selection, the page text, or the words in a drag), plus the page's
  host name as a label (never the full address). Sent only when the user presses Ask.
- Do not tick the others: the extension collects no personally identifiable information, health, financial, personal
  communications, location, web history list or user activity (no analytics, no clicks or keystrokes are recorded).

**Certify all three:** not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not
used or transferred to determine creditworthiness or for lending. (The text is processed by the AI providers Keplar selects
to write the answer, as the privacy policy says; that is the extension's purpose, not an unrelated transfer.)

**Privacy policy URL:** https://keplar.one/privacy (section "Team workspaces, API keys and the browser extension (beta)").

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
   sentence, right-click and choose 'Ask Keplar about the selection', and press Ask. Or right-click the page and choose
   'Search this tab with Keplar (beta)' and drag over some text. The key is for review only and expires on <date>."
3. Revoke the key once the review is done (Account → Developer API → Revoke).

## Version notes (0.1.0-beta)
First beta. Ask about selected text, the page, or words inside a drag on the current tab. The picture of a drag stays on the device. Answers include where the models disagreed, with formatting (bold, lists, code). Chrome and Edge only.
