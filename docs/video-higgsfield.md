# Video and images through Higgsfield

Status: **Beta**. Higgsfield is the **default provider** for video (Create > Video) and for images (Create > Images). Until keys exist the UI shows **Not configured** and nothing is generated or charged. Verified against docs.higgsfield.ai and open.higgsfield.ai on 2026-10-03.

## Environment variables (add in Vercel > Project > Settings > Environment Variables, then redeploy)

| Name | Required | Value |
| --- | --- | --- |
| **`HIGGSFIELD_API`** | yes | `KEY_ID:KEY_SECRET` exactly as issued by Higgsfield (a single token is also accepted, and a leading `Key ` is ignored). This is the variable already set in production. |
| `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET` | alternative | Used only when `HIGGSFIELD_API` is empty. Both are needed. |
| `KEPLAR_PUBLIC_URL` (or `BETTER_AUTH_URL`) | optional | An **https** origin. When set, every job submission carries a signed webhook URL so completion is pushed to `/api/webhooks/higgsfield`. Without it, polling alone is used. |
| `KEPLAR_HIGGSFIELD_OFF=1` | optional | Operator kill switch: Higgsfield is treated as not configured (video stops; images use the OpenAI fallback if configured). |
| `OPENAI_API_KEY` | optional | Image **fallback** when Higgsfield is down or not configured, and stronger prompt/image moderation (see below). |

Keys are never typed into the app, logged, returned by an API, or shown in Admin. **Admin > Connect Higgsfield** shows Configured / Not configured / Switched off, which variable it was read from, and has a **Test connection** button (a free status lookup that makes no generation).

## What the product does

* **Create > Video (Beta)**: model picker (Seedance 2.0 default, plus Seedance image-to-video and references, Genjutsu motion transfer, Kling 3.0 Standard, Kling 2.5 Turbo Pro, MiniMax Hailuo 2.3 Standard), **Compare** (Pro 2 models, Business 3), shape, length, resolution, outputs (1 up to the plan's concurrency), sound, negative prompt. **Only the options a model documents are shown**; everything else is hidden. The cost updates live as options change.
* **Create > Images**: model picker (Z-Image Turbo default, Qwen Image 3, "GPT Image (fallback)"), quality and size as before (High = 2k PNG, Standard = 1k), seed and negative prompt where the model supports them, outputs (up to the plan's concurrency), a reference image (1 to 3, switches to Qwen Image 3 Edit), "Download original", the same plan limits and credit accounting. OpenAI remains an **automatic fallback**: if Higgsfield fails (not for a policy refusal, not when a reference was attached), the job continues on OpenAI and the charge never exceeds the credits the user confirmed.
* Last-used choices are remembered per browser (`keplar.video.prefs.v1`, `keplar.image.prefs.v1`).
* **References** (image, and video for motion transfer and reference models): JPEG/PNG/WebP up to 10 MB (4 per video job, 3 per image job), MP4 up to 100 MB and 4 to 30 s. Originals are uploaded as-is. Files up to 3 MB go through a Keplar function; larger files get a presigned Higgsfield upload URL and go **browser to storage** so Vercel's 4.5 MB request limit never applies. Each has a preview and a Remove button, and uploading requires ticking the rights/consent note (server-enforced). The reference is part of the cost quote. In Compare, models that take it receive it and the others are labelled "ignores your reference". Reference images are moderated before use.

## Calls used

Base `https://api.higgsfield.ai`, header `Authorization: Key KEY_ID:KEY_SECRET`.

| Purpose | Call |
| --- | --- |
| Submit | `POST /<model-id>` (JSON body, `Idempotency-Key` = Keplar job id, `?hf_webhook=<https url>` when public https is known) |
| Poll | `GET /requests/{id}/status` (queued, in_progress, completed, failed, nsfw, canceled), throttled to one read per 3 s per job |
| Cancel | `POST /requests/{id}/cancel` (queued only; used on timeout) |
| Quote | `POST /estimate/<model-id>` with the exact body, returns `{credits, usd}` for the account |
| Upload | `POST /files/generate-upload-url {content_type}` then `PUT` to the returned URL |
| Connection test | `GET /requests/00000000-0000-4000-8000-000000000000/status`: 404 means the credentials work, 401 means rejected. Free. |

Retries: network errors, 408, 429, 5xx and the "maximum number of concurrent requests" 400 are retried (up to 3 attempts, exponential backoff, same Idempotency-Key). 401, 403 (out of credits), 404, 422 are not. Provider details are never shown to users; they see "Nothing was charged. Try again" style messages. Failed, nsfw and canceled requests are not charged by Higgsfield and not charged by Keplar. A job unfinished after **25 minutes** is canceled, failed and not charged.

## Prices and credits (no invented numbers)

Keplar credit = $0.002 of provider cost; the user pays provider cost x 1.1.

1. If Higgsfield answers the live **estimate** for the exact request, that is the price ("Higgsfield's own quote").
2. Otherwise the **published list price**, but only for models and settings where it is unambiguous: Seedance 2.0 text/image-to-video **$0.1407/s** at the default resolution with sound on; Z-Image Turbo **$0.015/image**; Qwen Image 3 and Qwen Image 3 Edit are published as a **$0.04 to $0.075 range** across 1k to 2k, so the upper bound $0.075 is used and labelled.
3. Otherwise the price is **TBD** and Keplar **refuses to start the job** ("Price TBD"). TBD today without a live quote: Kling 3.0 Standard, Kling 2.5 Turbo Pro, Hailuo 2.3 Standard, Genjutsu motion transfer, Seedance reference-to-video (the published lines do not name these tiers), and Seedance at a non-default resolution or with sound off.

With the keys set, the live estimate resolves every TBD above, so verify prices on the first real quote.

**Approval**: every video needs the user to confirm the exact credit total (`confirmUnits` must equal the server's number, else HTTP 409 `confirm`). At 1,000 credits or more (about $2.20 of provider cost) a second acknowledgement is required (`confirm_large`).

**Charging** happens once, when the finished video is stored (`charge(..., { ref: jobId })`), under a per-job lock so a poll and a duplicate webhook cannot double charge.

## Compare (Beta)

* One prompt, **6 outputs per selected model** (the "Outputs per model" select goes 1 to 6, default 6), shown side by side in one grid per run. Pro compares up to 2 models, Business 3. Free, Lite and Plus are refused with an upgrade message.
* **Exact cost before anything runs.** The approval step shows the total in credits (about $4 for 6 Seedance 2.0 clips of 5 s); a run of 1,000 credits or more needs a second tick ("I understand it uses N credits"). The quote is held until it matches the current options, so the Start button cannot be pressed on a stale price.
* **Failed tiles are not charged.** Credits are taken per delivered clip only; a failed, filtered or canceled tile costs nothing.
* **Daily caps** (policy, TBD founder approval): Pro 2 Compare runs per rolling day, Business 5; one active Compare run at a time; Compare does not use the single-video allowance. The existing 5-hour and weekly usage windows still apply: Pro's 5-hour window (2,250 credits) is smaller than a full 6 x 5 s Seedance run (about 2,322), so the preview says so and blocks it until the window allows it (or the user chooses fewer outputs or a shorter clip). Business has no windows.
* **Concurrency.** All tiles are recorded at once, the first 4 are sent to Higgsfield and the rest ("Waiting for a free slot") are sent as slots free up, so Keplar stays under Higgsfield's per-key concurrency.
* **Pick.** Each finished tile has a Pick checkbox; Select all / none, "Download selected", "Remove the ones I didn't pick" and "Remove selected" (finished clips only, owner only; removes the stored clip too).
* A reference (image or video) is uploaded once and shared with every model that accepts it; the others are labelled "ignores your reference".
* Compare exists in the video studio only. The image studio has one model per job plus an Outputs count.

## Verifying the key (no secret is ever shown)

* `GET /api/health/higgsfield` returns booleans and the env var name only: `{"provider":"higgsfield","configured":true,"source":"HIGGSFIELD_API","shape":"id:secret","switchedOff":false}`.
* Admin > Connect Higgsfield > "Test connection" makes a free authenticated GET (404 for the nil request id = key accepted, 401 = rejected). No generation, no cost.
* The cheapest real generation is one Z-Image Turbo image (about $0.015).

## Images in normal chat (/app)

* **How a message becomes a picture.** Two ways, both client-side routing in `KeplarApp.send`; the answer engine is not touched. (1) The composer's **Create image** toggle: that message is made into a picture, whatever it says. (2) A clear request is detected (`src/lib/images/chat-intent.ts`): "draw me an image of...", "generate a picture of...", "make a logo for...", "paint a sunset..." and, with an image attached, "make this photo look like a watercolor". The detector is deliberately conservative: questions ("how do I generate an image in Python?"), code, diagrams/charts, idioms ("draw a conclusion") and a bare "make an image" stay normal questions. Not applied while Deep Research, Create or Agent is on.
* **What the card does** (`src/components/app-ui/chat-image/ChatImageTurn.tsx`, steps in `src/lib/images/chat-flow.ts`): checks the plan and quotes the exact cost (`POST /api/images/estimate`), then either starts at once (cheap: up to 15 credits, about 2.5 cents; the default Z-Image Turbo is 9 credits; the cost is shown on the card) or **asks first** ("This will use up to N credits, and only if the picture is created", with the Shape choice and how many pictures are left today). A picture made from a reference image (an attached image, or an earlier picture for Variation/Edit) always asks first and needs the rights tick. Generation is `POST /api/images` (same job, caps, credits, refunds, moderation and storage as Create > Images; Higgsfield default, OpenAI automatic fallback only for pictures without a reference).
* **Result.** Shown inline from the stored original (`/api/images/:id/file`, full quality; click to open full size). Actions: **Download original**, **Regenerate** (a new version of the same image, same prompt), **Variation** (the stored original as a reference, edit model), **Edit** (type what should change; same). Each follow-up is its own card and goes through the same cost check and approval. The picture also appears in Create > Images.
* **Plan gating and caps.** Free and Lite: an upgrade card ("Images are part of Plus and Pro") with "See plans" and "Ask as a normal question"; signed out: a sign-in card. Plus/Pro/Business use the existing daily caps (`IMAGE_LIMITS`), per-minute and concurrency limits, spend breakers and credits; at the cap the card shows the plan's message. Nothing is charged unless a picture is delivered; a failed picture says "Nothing was charged" and offers Try again. The same idempotency key is the same job, so a double click or a retry never makes two.
* **After a reload.** A picture still being made resumes by its job id. One that was only waiting for a decision is cancelled ("Not started. Nothing was charged.") and its reference upload is dropped.
* **Not in scope.** Several pictures at once (chat makes one at a time; "make 4 images" says so; Create > Images makes several); picking a model in chat (Create > Images has the picker); video in chat.
* Chat history sent to the panel holds a one-line "[Keplar made a picture here: ...]" for a picture turn, so a follow-up question can refer to it.

## Plans and limits (policy values, TBD founder approval)

Video: Pro and Business only (Free, Lite, Plus: upgrade message). Pro: 6 per rolling day, 3 per minute, 2 at once, length up to 8 s, Compare 2. Business: 15 per day, 6 per minute, 3 at once, length up to 10 s, Compare 3. Jobs that never reached Higgsfield do not count against the day. Images keep their existing limits (`IMAGE_LIMITS`). Higgsfield's own default concurrency is 20 per key; the per-plan caps keep Keplar well under it. The ops pause, per-provider disable, circuit breaker, cooldown and admin spend cap apply to video like they do to images.

## Moderation and safety

* Prompts: local rules (real people, explicit content, minors, and so on) then the shared moderation. With `OPENAI_API_KEY` set the image-prompt check also uses OpenAI omni-moderation (fails closed). **Without `OPENAI_API_KEY` the check is weaker**: local rules plus Higgsfield's own `nsfw` status. Setting `OPENAI_API_KEY` is recommended even though Higgsfield is the default.
* Reference images are downloaded and checked like generated images before use. Reference videos are not frame-checked by Keplar (only Higgsfield's filter applies).
* Finished videos: the prompt is re-checked and Higgsfield's `nsfw` result blocks and removes the job. There is **no frame-level Keplar moderation** of output video.
* The webhook has no documented signature. Keplar signs the URL it hands out (HMAC bound to workspace and job), treats the body only as a "check now" hint, re-reads the status with its own credentials and never uses a URL from the body.

## Storage and playback (known limit)

Finished videos are downloaded and stored with Keplar's blob store, and the job records whether a copy exists. The R2 blob backend is still a placeholder (`src/lib/create/platform/blob.ts`), and Vercel functions cannot return responses over 4.5 MB or keep local files, so **on Vercel playback redirects to the Higgsfield output URL, which Higgsfield keeps at least 7 days** ("Results are kept for 7 days" is shown). Durable long-term storage needs the R2 wiring (TBD).

## Not verified without a real call

* A real generation (submit, poll, finished file) has not been run by the build tests: they use a mocked Higgsfield (`tests/helpers/hf-fake.ts`).
* Browser to presigned storage upload depends on the storage host allowing cross-origin `PUT`; this is untested. If it is blocked, files over 3 MB cannot be attached (files under 3 MB still work).
* Prices marked TBD above.

## Tests

`tests/higgsfield-core.test.ts` (credentials, headers, retries, error mapping, estimate/list/TBD, options, references, webhook token), `tests/higgsfield-video.test.ts` (preview, approval, lifecycle, charge once, failures, timeout, limits, Compare, references, routes, webhook), `tests/higgsfield-images.test.ts` (default provider, OpenAI fallback, options, references), `e2e/higgsfield.e2e.ts` (Playwright: Not configured, Beta, option filtering, live cost, references, remembered choices). Existing `tests/images.test.ts` still covers the OpenAI path.
