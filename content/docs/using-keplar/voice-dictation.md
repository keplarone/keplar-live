---
title: Voice dictation
description: How the microphone button works, who processes your voice, and why Keplar itself never receives audio.
order: 10
updated: 2026-10-03
keywords: voice dictation, microphone, speech to text, Web Speech API
related: /docs/privacy-security/data-handling, /docs/using-keplar/write-better-questions
---

The microphone button in the Ask box turns speech into text in the message box. It uses your browser's built-in speech recognition (the Web Speech API), only when you click it, and only in browsers that provide it.

## What happens

1. You click the microphone and your browser asks for permission.
2. You speak. Your browser converts speech to text and puts it in the box.
3. You edit the text if needed and send it like any other prompt.

## Who hears your voice

In Chrome, Edge and Safari, the browser itself may send your voice to its vendor's speech service to produce the text. That is governed by your browser vendor's policy, not Keplar's. **Keplar never receives, records or stores audio.** It receives only the text in the message box.

## When it is not available

In browsers without the feature, such as Firefox, the button is not shown. Microphone use is allowed only for Keplar's own origin and can be revoked in your browser's site settings.

## Tips

Speak in full sentences, say punctuation words like "comma" if your browser supports them, and review the text before sending, because dictated numbers and names are easy to mishear.
