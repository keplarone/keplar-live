# Multimodal understanding: status

Keplar reads links, images, video, audio, documents, code and data in **Ask** (including Debate, Study and Deep Research
when attachments apply) and uses links, screenshots and documents as **references in Create**. Everything goes through
one pipeline (`src/lib/attachments/*`), one chip language (`AttachTray`) and one set of limits (`ATTACH_LIMITS` in
`src/lib/attachments/kinds.ts`).

## What Keplar reads

| Type | How | Free | Paid |
| --- | --- | --- | --- |
| **Links** (web pages) | Server-side reader (`/api/keplar/link`, `lib/attachments/link.ts`). SSRF-safe: public hosts only, DNS pinned, every redirect re-validated, at most 4 redirects, 12 s, 5 MB. Readability-style extraction: title, site, author, date, headings, main text, JSON-LD facts. Pages marked `noai` are not read. Script-only pages say so | 3 links/message, 40/day, 14k chars each | 5 links/message, 300/day, 32k chars each |
| YouTube | oEmbed + the watch page: title, channel, length, description, chapters, captions as a timestamped transcript (manual tracks preferred over auto) | ✓ | ✓ |
| PDFs, CSV/JSON, images at a URL | PDF → text with page labels. Data → typed table with exact stats. Image → sent to the vision models (≤ 2.6 MB, magic-byte checked) | ✓ | ✓ |
| **Images** | Re-encoded in the browser and sent to vision models. Routing filters on `acceptsImages`. Free uses `:free` vision models only; if none is available the answer says so plainly (`NO_FREE_VISION_MESSAGE`) | 4 images, 10 MB each | same |
| **Video** | Up to 3 min, 50 MB. Keyframes chosen by scene change (40 candidates → the most distinct frames, with minimum spacing), plus the sound track transcribed and sent as a timestamped transcript. Chip shows the frame and transcript progress | ✓ (transcribed by free audio models) | ✓ (OpenAI transcribe, then Gemini/Voxtral) |
| **Audio** | MP3/M4A/WAV/OGG/FLAC/WebM decoded in the browser to 16 kHz mono and transcribed in 55 s chunks, two at a time | 3 min, 20 transcriptions/day | 10 min, 120/day |
| **Documents** | PDF (page-labeled), DOCX (headings, lists, tables, footnotes, comments), PPTX (slides in order, tables, speaker notes), RTF, TXT/MD | 4 MB, 30k chars, 40 PDF pages | 4.2 MB, 80k chars, 150 pages |
| **Code** | Source files fenced with their language; notebooks; `.zip` projects with a file map, language mix and key files first (dependencies, build output and secret files skipped) | 400 entries / 40 MB unpacked | 2000 entries / 120 MB |
| **Data** | CSV/TSV (delimiter sniffing, RFC 4180), XLSX (shared strings, dates, up to 12 sheets), JSON/JSONL records. **Exact statistics** per column: count, missing, min/p25/median/mean/p75/max, std, sum, top values, date spans, and Pearson correlations with \|r\| ≥ 0.5. The models are told to use them, not estimate | 20k rows | 100k rows |

**Safety guards:** size caps checked before anything is parsed. A defensive ZIP reader caps entries and total size before inflating, caps inflate output, rejects ratios above 200:1 (zip bombs), refuses ZIP64 and encrypted entries, and drops `..` and absolute paths. Executables (MZ/ELF/Mach-O) and pre-2007 Office files are refused. Macros are noted and never run. Strict UTF-8 is checked for text. Attachment text is labeled as material, never instructions. Nothing is stored: file text stays in the tab for the message and only the name is saved with the chat. Virus scanning is by refusal of executable and binary types (no AV engine runs).

**Free privacy gate:** file text isn't sent to free hosts that may train on prompts (`FREE_DOCS_NOT_SENT`). The chip warns before you send. Links (public pages) and transcripts of your own attached media are allowed on Free, as images and video already are.

## Composer UI

- The **Attach** button opens a menu: Upload files, Photos and video, Read a link (inline URL field), plus a "Keplar reads" grid (Links, Images, Video, Audio, Documents, Code, Data, each with a detail tooltip).
- A quiet hint under an empty input says "Paste a link or drop a file. Keplar reads links · images · video · audio · documents · code · data".
- Pasting or typing a URL reads it automatically. Its chip shows the site icon or initial, the title, and "Article · 15,158 words". Deleting the URL removes the chip.
- Typed chips (PDF, DOC, PPT, XLS, CSV, JSON, CODE, ZIP, AUDIO) show real stages and progress. Warnings appear on the chip. The drop overlay lists what Keplar reads.
- Flat graphite styling: no gradients, no glow, no focus boxes. Mobile chips are full width.
- In answers, links Keplar read are listed first in Sources and tagged "Read by Keplar". The sources note changes accordingly.

## Create

- `ReferenceTray` sits under the prompt. Paste a site, or add a screenshot or document.
  - Sites are read with the link reader (purpose `reference`), which returns section flow, navigation, palette, fonts and CTAs.
  - Screenshots get a vision-model design brief (`/api/keplar/reference`; free vision models on Free).
  - Documents get a short excerpt.
- Briefs are appended as "References (inspiration only)" together with `REFERENCE_RULES` (never copy text, logos or layouts). They stay inside the plan's prompt cap (Free 2,000 chars). The conversation log shows only your own words.
- The planner now returns `decisions` (choice, why, trade-off) and `assumptions`. After each build, Create's note narrates them.

## Response style

See `docs/response-style.md`. Clarity and presence rules reach every writer: panel, synthesizer, Free merged pass and the Core reviser. A readability meter checks the 16-prompt eval set; general answers average grade 8.8. Nine before/after cases cover acknowledgment, reasoning, uncertainty, context and Create narration.

## Tests

- `tests/attachments-parsers.test.ts` (18): ZIP (traversal, bombs, limits), DOCX, PPTX, XLSX, CSV, stats, JSON, RTF, extractor routing and refusals, HTML Readability, script-only pages, kinds and URLs, YouTube captions, keyframes, WAV, reference briefs, sources.
- `tests/link-ssrf.test.ts` (9): private, loopback, metadata and mixed DNS refused before any connection; redirects to private refused; redirect cap; `noai`; HTTP error mapping; image magic check; data stats; script-only shells; the 5 MB cap on a real socket.
- `tests/response-style.test.ts` (12): readability meter, eval set, presence before/after, prompt wiring, Create narration.
- Existing: `tests/mcp-ssrf.test.ts`, `tests/chat-docs.test.ts`, and `tests/authz.test.ts` (link and transcribe were reviewed as public).

## Screenshots

`screenshots/multimodal/`: composer-empty-dark, attach-menu-dark, attach-link-input-dark, chips-dark (a link read live, an image, a refused link), attach-menu-mobile, chips-mobile.

## Known limits

- The YouTube transcript depends on YouTube exposing captions. Without them, Keplar reads the title, channel and description and says so. On the box, YouTube resolves to a 198.18.x proxy address, which the SSRF guard correctly refuses. Production resolves public addresses.
- No standalone OCR engine runs. Text in images and scanned pages is read by the vision models. A scanned PDF with no text layer returns an "empty" notice; rendering scanned pages client-side to images for the vision models is the next step.
- Old binary Office files (.doc/.xls/.ppt) are refused with a "save as .docx/.xlsx/.pptx" message.
- Signed-out users can attach images, video, audio and links. Documents need an account, because the extract route requires a session.

## Deploy and smoke test

- Commits: `29784fd` (the feature), `9a95fb9` (UI fixes, status doc, screenshots), `35adcf6` (unavailable YouTube video message; ships with the next deploy).
- Production: `dpl_G5ZzohNyCBzhAM4hvN7UXuxEmYuM`, aliased to https://keplar.one on Oct 6, 2026 at 9:49 PM ET. It includes 5f227da, 92ecb40, 10d9aac, 527ebcd and 09d2e02.
- Smoke results (`vercel curl`):
  - `POST /api/keplar/link` with a Wikipedia article returned `page`, title "Tide", "Article · 15,158 words".
  - `169.254.169.254` returned `private` (refused).
  - A cross-site Origin returned 403.
  - A YouTube video returned title, channel, length, views and description. YouTube returned no captions to the Vercel servers, so the chip says "no transcript" (see Known limits).
