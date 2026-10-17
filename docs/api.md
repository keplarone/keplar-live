# Public API and browser extension (BETA)

Status: **BETA**. Public docs: `/developers`; spec: `/api/v1/openapi.json` (built in `src/lib/api/openapi.ts`).

## API keys
- Created in Account → Developer API (`/api/keys`, session auth, same-origin, verified email, personal workspace only). Format `kpl_` + 32 URL-safe chars. **Shown once; only a sha256 hash is stored**; the list never returns it; exports redact it; account deletion removes keys.
- Scopes `ask`, `usage`. Optional expiry (1–365 days). Revoke is immediate (`DELETE /api/keys/[id]`). Plans (`src/lib/api/policy.ts`): Free limited (the shared Free pool must not be drainable by scripts); Lite 2 keys / 6 per min / 100 per day; Plus 5 / 15 / 400; Pro 10 / 30 / 1,500; Business 25 / 60 / 5,000 (per key; proposals, `TODO(founder approval)`).
- `authenticateKey()` (`src/lib/api/keys.ts`) reads the `Authorization: Bearer` header only. Cookies are never read, so a browser session can't call v1 and a key can't call session routes. Failed-key throttle per address (20/min), per-key per-minute and per-day limits (shared limiter), plan re-checked on every call (a lapsed plan disables the key).
- Metering: `POST /api/v1/ask` runs the same `/api/keplar` handler in-process with the key's workspace injected (`injectWorkspace`), so credits, rolling windows, spend caps, safety screen and creator replies are exactly the app's. Stateless: no memory read/write, no chat saved, no FAQ/learning recording. Each key counts requests and credits.

## Endpoints
- `POST /api/v1/ask` `{question, history?, routing?:{strategy}, stream?, tools?}` → `{object:"answer", answer, agreement, disagreement|null, models, sources, source_check|null, usage:{credits}, created}`; stream = SSE `progress`, `delta` (preview), `answer` (authoritative), `done`/`error`; refusals before the run are real HTTP statuses.
- `tools` (src/lib/api/tools.ts): `reason`, `debate`, `web_search`, `deep_research` (modes for the same pipeline; web/deep need `KEPLAR_RETRIEVAL_ENABLED`), `read_url` (up to 3 links through the SSRF-safe reader, counts toward the daily link reads) and `x_search` (needs `X_BEARER_TOKEN`; off in Family mode). Strings or `{type, urls?, query?}`. The answer gains `tools: [{type, status, detail}]`; `requested` means the mode was switched on, and the pipeline's own gates can still skip it.
- `GET /api/v1/usage` (scope `usage`), `GET /api/v1/openapi.json` (public). CORS `*` without credentials; preflight allows `authorization, content-type`.
- Errors `{error:{code,message,retry_after?}}`.

## Extension (`extension/`)
MV3, Chrome/Edge. Permissions `activeTab, contextMenus, scripting, storage`; no host permissions, no content scripts, CSP `script-src 'self'`, `connect-src https://keplar.one`. Auth = an `ask`-scoped API key in `chrome.storage.local` (a session cookie would hand an extension the whole account). Reads the page only on a click; labels pages by host only; stores nothing but the key. Build: `npm run build:extension` → `extension/dist/keplar-extension-0.1.0-beta.zip` (validated first: permission allow-list, CSP, no eval/innerHTML/remote URLs; dist is git-ignored). Store text: `extension/STORE_LISTING.md` — **drafted, not submitted**.

## Versioning and deprecation
Public routes live under `/api/v1`. A breaking change ships as a new version (`/api/v2`); the old one keeps answering for at least six months and
sends `Deprecation: true` and `Sunset: <date>` headers plus a notice on `/developers` and in the OpenAPI document (`info.description`). Removal happens
only after the sunset date, and only when the key owners still calling it have been emailed (keys carry an owner). Non-breaking additions (new optional
fields, new tools) land in place. Internal `/api/*` routes are not versioned and change with the app. Policy: `docs/security-policy.md` §8.

## Not verified / pending
- No live-model run of `/api/v1/ask` against real providers here (tests use the creator reply and the local fake model); extension not loaded in a real browser or reviewed by any store.
- COMING SOON: device-flow pairing (no pasted key), Firefox/Safari builds, team-level keys, per-key credit caps, SDK, webhooks.
