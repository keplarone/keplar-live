# Platform features status

Date: 2026-10-06. Creator credit: Hassen and Hussain Keder (two co-founders, two different people).

Four growth/platform MVPs shipped for signed-in use (embed + API docs are public).

## 1) Referral program — live

| Item | Detail |
|---|---|
| What | Invite friends for **usage credits only** (never cash). Both sides rewarded on verified signup when abuse checks pass. |
| Link | Shareable `https://keplar.one/?ref=CODE` (proxy → `/invite/CODE`). Also `/invite/CODE`. |
| UI | Account → Invite friends: copy link, caps, friend outcomes. Terms: `/referral-terms`. Admin: `/admin/referrals`. |
| Abuse | Self-referral, throwaway domains, device/network heuristics, monthly/lifetime/daily caps; held claims for admin. |
| Code | `src/lib/referrals/*`, `/api/referrals`, `/invite/[code]`, `InvitePanel`. |
| Pending | Email notify when a held claim is approved; Stripe metering N/A (credits are limit extensions). |

## 2) Embeddable widget — live (beta)

| Item | Detail |
|---|---|
| What | Paste a script on any site; iframe loads Keplar Ask. Asks meter to the **publisher's** workspace. |
| Loader | `https://keplar.one/embed.js` (`data-keplar-embed`, theme/size/accent). |
| Frame | `https://keplar.one/embed?id=emb_…` (CSP `frame-ancestors *`; exempt from site-wide DENY). |
| API | `POST /api/embed/ask`, manage `GET/POST /api/embed`, `PATCH/DELETE /api/embed/:id`, public config `GET /api/embed/public/:id`. |
| UI | Account → Embed Ask: create, origin allowlist, copy snippet, revoke. Docs: `/developers#embed`. |
| Models | Free publishers forced to OpenRouter `:free`. Paid may choose `free` or `plan`. |
| Limits | Per-plan widget count + per-widget / IP rate limits (`src/lib/embed/config.ts`). |
| Pending | Stripe metering for embed volume; signed publisher tokens beyond public `emb_` id; custom CSS. |

## 3) Public API — live (beta)

| Item | Detail |
|---|---|
| What | Bearer API keys (`kpl_…`, hash at rest). `POST /api/v1/ask`, `GET /api/v1/usage`, OpenAPI `/api/v1/openapi.json`. |
| Tiers | **Free** 1 key / 2/min / 30/day (**OpenRouter `:free` only**); Lite/Plus/Pro/Business as in `src/lib/api/policy.ts`. |
| UI | Account → Developer API. Docs: `/developers`. |
| Auth | Bearer only (no cookies). Free/paid answers use the same `/api/keplar` pipeline with the key's workspace. |
| Pending | Stripe API metering product; team-level keys; per-key credit caps; official SDK; webhooks. |

## 4) Keplar for Teams — live (beta, Business)

| Item | Detail |
|---|---|
| What | Shared workspaces (`tm_…`). Roles: **Owner**, **Admin**, **Editor** (internal id `member`), **Viewer**. |
| Invite | Draft → send email or one-time link (`/team/join#…`). |
| UI | Account → Team workspace; workspace switcher in Account menu. |
| Enforce | Every opted-in route re-reads membership; removed members get 403 next request. |
| Pending | Team API keys; per-member caps; SSO/SCIM; owner transfer; Stripe seat metering. |

## Deploy notes

- Deploy via `vercel --prod --yes` from a clean worktree at a buildable commit, so other uncommitted work never ships by accident.
- Live: `dpl_23XJeLdu5MkNCGTuct32qtEQPv7W` (2026-10-06 21:20 ET), built from 10d9aac + 527ebcd (embed polish). Previous: `dpl_BhPg2V619gxfLTAeBmRmYkzCanHq` (92ecb40).
- Smoke-tested in prod: /developers, /embed.js (CORP cross-origin, ACAO *), /embed (frame-ancestors), `/?ref=CODE` → 302 /invite/CODE, /api/v1/openapi.json, /team/join, plus auth errors on /api/embed and /api/v1/ask.
- Dark theme remains the default for new visitors (`DEFAULT_THEME_PREF = "dark"`).
- Do not push git remotes from this agent; stage only feature paths.
