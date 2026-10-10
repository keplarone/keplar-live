# Parity stage 3: Posts on X in answers, Record notes, Specialist links, your location

Date: 2026-10-06 (ET). Not deployed by this track: the commit rides along with the next HEAD deploy.

## Built
- **Posts on X under answers** (`parity/XPosts.tsx`, `GET /api/x/search` availability). The button appears only when X is switched on and the plan is paid. The search box is prefilled with distinctive words from the question (`xQueryFrom`) and can be edited. Posts are shown as written and labeled "not checked by Keplar's panel". They can be opened as a draft for Keplar to check. Links are built only from valid handles and numeric ids.
- **Record notes** (`parity/RecordNotes.tsx`, `lib/voice/record.ts`). Available on a new chat. Uses the browser's speech service for a live transcript with timestamps. Lines spoken within 20 seconds of each other are merged. Limits: 2 hours and 60k characters. The session restarts itself after pauses. When it stops, the transcript opens as a side draft with the prompt that turns it into notes, decisions and action items. Keplar never receives audio.
- **Specialist links** (`lib/personalize/specialist-share.ts`, `/api/specialists/share`, `/api/specialists/copy`, `/sp/[token]`).
  - Each link is a snapshot. Reference notes are included only if the owner opts in.
  - The public page shows everything before "Add to my specialists", and plan caps apply.
  - Views and copies are counted. Owners can revoke links in Settings > Shared links, and links expire after 180 days.
  - `/sp/` views are rate-limited. The page has a report link and is noindex/no-referrer.
  - The `specialist_shares` collection is exported and deleted with the account.
- **Your location** (Answer preferences). Typed only: city or region, or "Use my time zone". It is used only when place matters and is withheld on Free, the same as "About you". Keplar never reads the device's location.

## Tests
`tests/parity-stage3.test.ts` has 5 tests, all passing. Stage 1 and 2 still pass. A scoped typecheck of every stage 1–3 file and its imports is clean. ESLint shows 0 errors (5 existing `_w` warnings). The authz, rate-limit, privacy and US-English audits show no new failures; the remaining ones are core/signal, embed/ask, templates like, `sb_template_likes`, CHAPTERS.md and critic css from other tracks.
No screenshots were taken this stage: no local build or dev server was run because the shared box is low on memory.

## Blockers
- Posts on X: `X_BEARER_TOKEN`.
- Record notes depends on browser Web Speech. Chrome sends the audio to its own speech service. Firefox has no support, so the button is hidden there.

## Next (stage 4)
Event-triggered agent automations (inbound mail or webhook), family mode with a parent PIN, a moderated public specialist directory, and the API's built-in tools.
