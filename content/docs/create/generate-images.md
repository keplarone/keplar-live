---
title: Generate images
description: Generate an image from a prompt in Create, choose quality and size, keep versions, download the original and insert it into a site. What is refused and what is charged.
order: 4
updated: 2026-10-03
keywords: AI image generation, generate image, image history, download original
related: /docs/create/create-limits-by-plan, /docs/billing-plans/credits-explained, /docs/create/publish-your-site
---

The Images tab in Create turns a prompt into a real image. Image generation is part of Plus, Pro and Business; the Create screen shows what your plan includes.

## How to generate

1. Open Create, then Images.
2. Describe the image: subject, setting, style, lighting, composition.
3. Pick quality and size. Higher quality and larger sizes cost more credits; the estimate is shown before you start.
4. Generate. Failed, refused, blocked or timed-out jobs cost nothing.
5. Regenerate to make another version in the same history, download the original, or insert the image into a site.

## Prompts that work

```text
A matte ceramic coffee mug on a pale oak table, soft window light from the left,
shallow depth of field, calm and minimal, no text.
```

- Describe what to draw, not what to avoid. If the model supports a negative prompt, use it for specifics.
- Keep text out of the image; generated lettering is often wrong. Put words in your site's text instead.
- Reference images, where the model supports them, can guide style or subject.

## What happens to the file

The image is stored in your account and served only to you through authenticated routes. When you use an image in a site, that one image becomes public at an unguessable address so published pages can show it. Deleting an image used in a site asks you to confirm. Downloads are the original file (PNG), not a recompressed copy.

## Safety rules

Prompts are checked locally, by a moderation model, and again on the finished image. These are refused: sexual content, minors, deepfakes and face swaps, graphic violence, and real-person likeness (named people, celebrities, public roles, "looks like <name>"). The local check is a heuristic and can refuse an innocent phrase that resembles a name; describe a fictional person or scene instead. If the moderation service cannot be reached, the job fails and nothing is charged, rather than letting the prompt through.

## Retries and protection

A repeated request with the same idempotency key returns the same job and never charges twice. Several failures in a short window pause generation for the rest of the window to stop retry storms.

## Slides

Image ideas in the [slideshow creator](/docs/using-keplar/slideshow-creator) are text placeholders. Generate pictures here and add them yourself.
