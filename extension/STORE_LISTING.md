# Store listing — DRAFT (NOT submitted anywhere)

Nothing in this file has been sent to the Chrome Web Store, Microsoft Edge Add-ons, Firefox Add-ons, or any other store. It is text for the owner to review, edit and submit by hand. Before submitting: create a developer account, pay any one-time fee, host the privacy policy URL below, take real screenshots of the built extension, and re-read every claim against what the extension does that day.

## Name
Keplar (beta)

## Short summary (≤132 characters)
Beta: drag an area of the current tab and ask Keplar about the words. The picture stays on your device.

## Category
Productivity

## Description
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

## Single purpose (reviewer field)
Let the user ask the Keplar service a question about text they select, the page they are viewing, or the words inside an area they drag on the current tab, and show the answer.

## Permission justifications (reviewer fields)
- `activeTab`: reads the selected text, visible text, or words inside a drag on the current tab only after the user clicks the toolbar button or a context-menu item. The same gesture can capture a picture of that tab for a local preview. No access to other tabs, and no background access.
- `scripting`: runs a script packaged inside the extension on the active tab, to read the selection or page text, or to draw the search overlay (that same user action). No remote code is loaded or evaluated.
- `contextMenus`: adds "Ask Keplar about selection", "Ask Keplar about this page", and "Search this tab with Keplar (beta)" to the right-click menu.
- `storage`: saves the user's API key locally (`storage.local`) and holds a one-time hand-off from the context menu to the popup (`storage.session`, cleared when the browser closes).
- Host permissions: none requested. The extension calls `https://keplar.one/api/v1/ask` with a bearer key; the API allows that cross-origin call.

## Data-use disclosures (reviewer form)
- Collected: "Website content" (the text the user chooses to send) and "Authentication information" (the API key the user pastes).
- Purpose: app functionality only (answering the user's question).
- Not sold or transferred to third parties outside of providing the feature; not used for unrelated purposes; not used for creditworthiness or lending.
- Note for the owner: the text is processed by the AI providers Keplar selects for the answer; describe that accurately in the privacy policy (https://keplar.one/privacy) before submitting.

## Privacy policy URL
https://keplar.one/privacy (the "Browser extension (beta)" paragraph)

## Support URL
https://keplar.one/contact

## Screenshots to capture (none taken yet)
1. Popup with a question and an added selection (1280×800).
2. Answer with the agreement line and "where they split" list.
3. Right-click menu showing the Ask entries and "Search this tab with Keplar (beta)".
4. The drag overlay: dimmed tab, rectangle, and the "Ask anything" panel.
5. Key setup screen.

## Version notes (0.1.0-beta)
First beta. Ask about selected text, the page, or words inside a drag on the current tab. The picture of a drag stays on the device. Answers include where the models disagreed. Chrome and Edge only.
