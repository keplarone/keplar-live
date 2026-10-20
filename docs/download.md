# Desktop download page (`/download`)

Code: `src/app/(marketing)/download/page.tsx`, `src/components/download/`, `src/lib/desktop/{releases,platform}.ts`. Tests: `tests/desktop-download.test.ts`.

- **Source of truth:** the public repo `keplarone/keplar-desktop`, Releases API, read **server-side** only (`next: { revalidate: 600 }`, and the page itself has `revalidate = 600`). The newest published, non-draft, non-prerelease `v*` release wins.
- **Only real files:** an asset is listed only if it is uploaded, non-empty, served from that repo's `releases/download/<tag>/` path and named `Keplar-One-<version>-<os>-<arch>.<ext>` (v0.1.0/v0.1.1 used `Keplar-<version>-...`, still accepted) (`exe msi dmg pkg zip AppImage deb rpm tar.gz`; os `win|windows|mac|macos|darwin|linux`; arch `x64|x86_64|amd64|arm64|aarch64|universal`). Anything else (`.blockmap`, `latest*.yml`, unknown names) is ignored. SHA-256 comes from the `SHA256SUMS` asset and is shown only for an exact file-name match, otherwise "Not published".
- **States:** release found; **First release coming soon** (public repo, empty release list); **temporarily unavailable** (releases API 404, including a private repo, plus rate limit 403/429, other errors, timeouts). The GitHub releases link is shown only when that page is public. Nothing is invented in any state. The unauthenticated API limit is 60 requests/hour per IP. An optional `GITHUB_RELEASES_TOKEN` (read access to the desktop repos) raises the limit and, when the releases page is not public, serves the files from `/api/desktop/download` so the token never reaches the browser. A transient failure can stay on the page for up to one revalidation window (~10 min).
- **Detection is client-side** (the page stays static/ISR): user agent + `userAgentData` hints. macOS chip is unknowable in Safari, so with both Mac builds present both are shown; if the exact architecture has no build the page says the offered file may not match. Mobile shows "Get the desktop app on a computer" with Copy link and a `mailto:` link (no server email).
- **Analytics:** `download_click` (`os`, `arch`, `type`, `version`, `placement`) via `track()`, which sends nothing without analytics consent.
- **Honesty copy:** builds are described as not yet code-signed/notarized (SmartScreen, macOS Open / `xattr`, Linux `chmod +x`). If signing is added, update the Install section in the page. System requirements are "expected minimums"; confirm them against the desktop app before relying on them.
- SEO: metadata, JSON-LD (`WebPage` + `SoftwareApplication`; version, date and `downloadUrl` only when a real release exists), nav, footer and sitemap entries.

## Signing in from the desktop app

From desktop v0.1.5 the app signs in through the system browser (see "Desktop app sign-in through the system browser" in `accounts-billing.md`). Release v0.1.5 or later of `keplar-desktop` together with (or after) this server change; an older app keeps its in-app sign-in window and works as before. Ship order: deploy the server first (the endpoints are additive), then tag the desktop release.

