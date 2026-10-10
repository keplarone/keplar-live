---
title: Attach images and video
description: How to attach images and a short video, the limits, how Keplar sends them to vision-capable models only, and what happens to your files.
order: 3
updated: 2026-10-03
keywords: attach image, video question, vision models, screenshot, upload
related: /docs/privacy-security/data-handling, /docs/privacy-security/free-plan-privacy, /docs/how-it-works/routing-and-panels
---

The composer takes images and one video per message. Use the Attach button, drag a file onto the composer, or paste an image from the clipboard. Thumbnails appear with remove buttons, and everything works from the keyboard and with screen readers.

## Limits

| | Limit |
|---|---|
| Images | PNG, JPG, WebP or GIF; up to 4 per message; 10 MB each |
| Video | MP4, WebM or MOV; 1 per message; up to 50 MB and 3 minutes |
| Request size | The whole request must stay under about 4.5 MB, so large files are fitted before sending |

## How images are sent

When an image fits, Keplar sends the original bytes. If it is too large, it gives up resolution before quality (the long edge shrinks from 4096 pixels toward 768), and PNG stays lossless where it can. Photos taken sideways are turned upright. A GIF keeps its first frame. The thread keeps your original in the browser so you can open it at full size.

## How video is handled

Keplar samples the video into still frames (8 frames for clips up to 20 seconds, 12 up to a minute, 16 up to three minutes), evenly spaced, and sends them to vision models in time order with a note that they are stills from one clip. Models are told to describe motion only as far as the frames show it. **Audio is ignored.**

## Which models see them

Only models that can read images take a panel seat on a media question. The verifier and judge read the panel's text answers, not the media. A media question is at least a small panel, so one model's misreading does not become the answer. On Free, only free vision models are used; if none is available you see a clear message and nothing is sent.

## What happens to the files

Media is held in memory for the request and is not written to disk, the database or logs, and is not saved with the chat. After a reload, the message shows placeholders and "retry" asks you to attach again. On Free, the composer notes that free model hosts may log prompts, which includes attached media.

## Tips

- Crop to what matters. Smaller images fit without losing detail.
- Say what you want: "Read the numbers in this chart", "What is wrong with this error dialog?"
- For documents, paste text or use [Study mode](/docs/using-keplar/study-mode) rather than a photograph of a page.
- Do not attach images of people's private documents or IDs unless you are comfortable with them reaching model providers.
