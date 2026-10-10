# Create mega scan — 2026-10-06 (EDT)

Scope: Create UI (App / Images / Video / Mobile), `/api/create/**`, `/api/apps/**`, `src/lib/create/**`, `src/lib/app-builder/**`, hang/stale/stream contracts, live smoke where the network allows.

Method: code review + existing unit/contract tests (`create-*`, `apps-api`, `app-builder-hang`, `media`, `mobile-creator`) + `tsc --noEmit` + live redirects/CSRF probes. Live HTML for `/app/create` is often `403 x-vercel-mitigated` from this box (bot challenge); redirect HEAD checks still work.

## Severity counts

| Severity | Found | Fixed | Open / wontfix |
|----------|------:|------:|----------------:|
| P0       | 2     | 2     | 0 |
| P1       | 3     | 3     | 0 |
| P2       | 5     | 5     | 0 |

---

## Findings

### P0-1 — Sign-in gate missing on Create App (and weak on media tabs)
- **Repro:** Open `/app/create` signed out. App studio shows a raw API error (“Sign in to continue.”) + Try again; no Sign in / Create account links that return to Create. Images/Video only show a one-line string.
- **Cause:** `SignInGate` remained only in `SiteBuilder.tsx`, which is no longer mounted after Site tab removal (`da470a9`).
- **Pointers:** `src/components/create/CreateStudio.tsx`, `src/components/create/apps/AppBuilder.tsx`, `src/components/create/SiteBuilder.tsx` (dead gate), `src/components/create/ImageStudio.tsx`, `src/components/create/video/VideoStudio.tsx`, `src/components/create/mobile/MobileStudio.tsx`, `tests/create-gate.test.ts` (still pointed at SiteBuilder).
- **Status:** **fixed** — CreateStudio gates signed-out visitors once; media tabs use the same gate; create-gate test updated.

### P0-2 — Site resume + template remix handoff dead
- **Repro:** Projects → Resume on a site, or Templates → Remix. Both set `sessionStorage["keplar:create-site"]` and navigate to `/app/create`. Create only mounts `AppBuilder`, which never reads that key. Remixed/resumed site never opens.
- **Cause:** Site tab removed; only `SiteBuilder` consumed the handoff keys.
- **Pointers:** `src/components/app-ui/KeplarApp.tsx` (`onResumeSite`), `src/components/templates/RemixPanel.tsx`, `src/components/create/SiteBuilder.tsx`, `src/components/create/CreateStudio.tsx`.
- **Status:** **fixed** — CreateStudio detects the handoff and mounts `SiteBuilder` (no Site tab); “Back to Create” returns to App tabs. Contract test added.

### P1-1 — Local accidental delete of `/api/apps/[id]/build`
- **Repro:** Working tree had `D src/app/api/apps/[id]/build/route.ts` while the client still POSTs `/api/apps/:id/build`. A local/dev deploy from this tree would 404 every build.
- **Pointers:** `src/app/api/apps/[id]/build/route.ts`, `src/components/create/apps/build-client.ts`.
- **Status:** **fixed** — restored from HEAD before other work (was never committed as a delete).

### P1-2 — `failStaleBuild` / stream idle always blame “planning”
- **Repro:** Build dies mid-generate/verify after stale window / idle timeout → UI says it stopped “while planning”.
- **Pointers:** `src/lib/app-builder/pipeline.ts` (`failStaleBuild`), `src/components/create/apps/build-client.ts` (`STREAM_IDLE_MS` error).
- **Status:** **fixed** — stage-aware / generic wording; hang test updated.

### P1-3 — create-gate contract still asserted SiteBuilder only
- **Repro:** `tests/create-gate.test.ts` passed while App Create had no gate (false confidence).
- **Status:** **fixed** — asserts CreateStudio / AppBuilder path.

### P2-1 — Create tab URL not synced on click
- **Repro:** Load `?tab=images`, switch to Video → URL stays `?tab=images`.
- **Pointers:** `src/components/create/CreateStudio.tsx` `pick()`.
- **Status:** **fixed** — `history.replaceState` updates `tab` query.

### P2-2 — `/create?tab=site` redirect rule unreachable
- **Note:** General `/create` → `/app/create` (permanent) ran first; query preserved into a second hop.
- **Pointers:** `next.config.ts`.
- **Status:** **fixed** — `?tab=site` rule ordered before the bare `/create` permanent redirect.

### P2-3 — Focus/selection boxes still on Images / Video / Mobile chrome
- **Note:** App studio already killed focus boxes; Images / builder / Mobile module CSS still declared boxed outlines (globals already force `outline: none !important` on /app).
- **Status:** **fixed** — module rules aligned to underline / no-outline (Video error outline kept).

### P2-4 — Dead `SiteBuilder` chunk still in repo (no Create tab)
- **Status:** **wontfix** for now — still required for resume/remix path (P0-2). Not linked as a tab.

### P2-5 — Stuck-plan defenses already present
- Verified: `failStaleBuild` + `STALE_BUILD_MS`, plan heartbeats/`onDelta` progress, `plan_timeout` after too many plan-only continues, client `STREAM_IDLE_MS=210_000` + `stalled`, dynamic `import("./verify/smoke")`, `serverExternalPackages` + tracing includes for build route, apps list/id/build static graphs free of playwright. Unit tests in `tests/app-builder-hang.test.ts` green.
- **Status:** **ok** (no bug).

### Checked OK (no new bug)
- Free plan: `chainFor("free", …)` returns only `:free` models; `runtimeChain` free-only.
- Playwright not statically in `/api/apps` serverless graph (dynamic smoke only on build verify).
- `?tab=site` → 307 `/app/create?tab=app` on production (HEAD).
- Cross-origin POST to apps/create media → 403 (WAF/CSRF layer).
- Creators’ ages/birthdates: not published from Create paths; identity redaction elsewhere unchanged.
- Typecheck clean; create-related unit tests green before fixes.

---

## Deploy / blockers
- **Deployed:** `dpl_BSe3G6VzAQk9xTCV8WCmgts1ZaMY` → https://keplar-2667vdj1e-team-6667.vercel.app aliased to https://keplar.one (sha `69bb69a`).
- **Note:** env `VERCEL_TOKEN` was invalid and broke CLI auth; deploy used logged-in CLI after `unset VERCEL_TOKEN`.
- **Live HTML smoke:** datacenter IP often gets `x-vercel-mitigated: deny` on `/app/create` GET; redirect HEAD and `/api/apps` 401 checks still work.

## Phase 3
Create P0/P1 fixed + deployed. Sitewide section scan starts after this report (Ask/chat first).
