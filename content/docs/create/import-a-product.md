---
title: Import a product from a link or photo
description: Start a shop page from a real product: how the link fetch respects robots.txt, what the photo reader does, the editable review card, and the rights check.
order: 3
updated: 2026-10-03
keywords: import product, product page from photo, product link import, KeplarBot
related: /bot, /docs/privacy-security/published-sites-safety, /docs/create/build-a-site
---

On the first Create step, **Start from a product** accepts a product link or a photo. The result is an editable **Imported product** card, and the discovery questions and the brief are built around it.

## Importing from a link

Keplar's server fetches the page. The fetch is deliberately careful:

- **Public addresses only.** Every address the name resolves to must be public, the connection is pinned to the checked address, and redirects are re-checked. Internal and loopback addresses are refused.
- **robots.txt and noai.** The `KeplarBot` user agent obeys robots.txt before fetching the page, before following any redirect and for each image host. Pages marked `noai` are refused, and images marked `noimageai` are not taken. If robots.txt cannot be read, nothing is fetched. Documentation for site owners is at [/bot](/bot).
- **Limits.** 12 seconds and 1.8 MB for a page, HTML only, at most four redirects. No cookies, no Authorization header and no Referer are sent.
- **Privacy.** Nothing that identifies you is sent to the site.

If a page builds its content with JavaScript, little data may be found; the card says so and offers manual entry. A price shown only by script is not found.

## Importing from a photo

Choose, paste or drag in a photo. PNG, JPEG, WebP, GIF and AVIF are accepted by their actual bytes, never by file name. SVG, HTML, PDF and anything else is refused, as are very large decompression-bomb images and tiny thumbnails. A suitable photo is stored byte for byte; a JPEG containing GPS location is re-encoded without it, and the card says "Location data was removed".

Optionally, one vision call reads the photo to suggest a name, description, features and alt text, describing only what is visible. It only fills empty fields, and it can be wrong.

## The review card

Everything is editable: name, brand, description, features, price and currency, the Buy setting, selected photos, hero and alt text.

- **Buy button:** link (the original product page, or a payment link you paste), inquiry (leads to the contact form), or checkout later (a marked placeholder). Keplar sites have no built-in cart.
- **Price:** only a price found on the page or typed by you is used, shown with "as listed on <host> on <date>". With none, the page shows a marked placeholder; the generator is told not to invent one.
- **Rights:** the card asks you to import only images you hold the rights to. Builds drop images that are not your own stored assets, and drop all images if you have not confirmed rights.

## Limits per plan

Page imports, photo readings, imported images, and stored images per day and in total are higher on higher plans, and the answer to hitting one is a message naming the number and the next plan. See [Create limits by plan](/docs/create/create-limits-by-plan).

## What import will not do

It will not copy a competitor's whole site, bypass a robots.txt rule, or guarantee that facts on a third-party page are right. You are responsible for the content you publish.
