---
title: Generate images
description: Make a picture from a chat message, with the cost shown when a confirmation is required, and what is refused.
order: 4
updated: 2026-10-18
keywords: AI image generation, generate image, Create image, download original
related: /docs/create/create-limits-by-plan, /docs/billing-plans/credits-explained, /docs/create/publish-your-site
---

Pictures are made in chat. Turn on **Create image** in the composer, or ask Keplar to draw one ("draw a …", "make an image of …"). Image generation is not a Create tab. It is part of Plus, Pro and Business.

## How to generate

1. In chat, turn on Create image, or write a clear request to draw a picture. With Create mode on, that request is answered as a normal chat message and no picture is made.
2. Describe the image: subject, setting, style, lighting, composition. Attach an image to use it as a reference.
3. A small picture can start on its own. A larger one, or one that uses a reference, shows the cost first and waits for you to confirm. Failed, refused, blocked or timed-out jobs cost nothing.
4. The picture appears in the thread. Download the original from there. You can regenerate it, ask for a variation, or describe an edit.

## Prompts that work

```text
A matte ceramic coffee mug on a pale oak table, soft window light from the left,
shallow depth of field, calm and minimal, no text.
```

- Describe what to draw, not what to avoid. If the model supports a negative prompt, use it for specifics.
- Keep text out of the image; generated lettering is often wrong.
- Reference images, where the model supports them, can guide style or subject. You confirm you have the rights before a reference is used.

## What happens to the file

The image is stored in your account and served only to you through authenticated routes. Downloads are the original file, not a recompressed copy.

## Safety rules

Prompts are checked locally, by a moderation model, and again on the finished image. These are refused: sexual content, minors, deepfakes and face swaps, graphic violence, and real-person likeness (named people, celebrities, public roles, "looks like <name>"). The local check is a heuristic and can refuse an innocent phrase that resembles a name; describe a fictional person or scene instead. If the moderation service cannot be reached, the job fails and nothing is charged, rather than letting the prompt through.

## Retries and protection

A repeated request with the same idempotency key returns the same job and never charges twice. Several failures in a short window pause generation for the rest of the window to stop retry storms.

## Slides

Image ideas in the [slideshow creator](/docs/using-keplar/slideshow-creator) are text placeholders. Turn on Create image in chat if you want a picture, then add it yourself.
