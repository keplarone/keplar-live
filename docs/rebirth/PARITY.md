# Feature-parity matrix (Project Rebirth)

Source of truth for the reconstruction: every existing feature, its current state, its known defects, and its disposition.
Nothing is removed without a row here saying why. Status: **Real** = calls real services and stores data; **Beta** = works with
stated limits; **Soon** = labelled coming soon; **Unwired** = code exists but no one can reach it.
Disposition: **Keep** (meets the bar; covered by tests), **Improve** (keep, fix listed defects), **Rebuild**, **Consolidate**,
**Decide** (needs an owner decision), **Blocked** (needs external access or infrastructure).

| Area | Feature | Routes / code | Status | Known defects (audit ID) | Tests | Disposition |
|---|---|---|---|---|---|---|
| Marketing | Home (English) | `/`, `sky/SkyHome.tsx` | Real (demo labelled) | Mobile LCP 5.5 s / TBT 1.1 s (BASELINE); hard-coded colours; UI v2 sky backdrop back (UX-9) | overhaul-landing, home e2e | Improve |
| Marketing | Home (other languages) | `/[locale]`, `home/MonolithHome.tsx` | Real | Older design than English home; 48 colour literals | i18n | Consolidate with English home |
| Marketing | Features, pricing, roadmap, changelog, status | `/features`, `/pricing`, … | Real | Office files and links marked "soon" but work; "no web lookups" copy wrong (UX-6) | product-facts, changelog | Improve (copy) |
| Marketing | SEO/content pages | `/answers`, `/blogs`, `/guides`, `/vs`, … | Real (static) | — | seo*, kb-content | Keep |
| Marketing | Shared answers | `/r/[token]`, `/c/[token]`, `/sp/[token]` | Real | — | growth-share, share-* , e2e | Keep |
| Marketing | Enterprise / agents pages | `(marketing)/enterprise`, `/agents` | Unwired (redirected) | Dead pages | — | Decide (delete or restore) |
| Marketing | Contact, inquiry, feedback, help | `/contact`, `/inquire`, `/feedback`, `/help` | Real | Help copy says provider buttons show "Coming soon" (they're hidden) | inquire, support | Improve (copy) |
| Accounts | Email/password, magic link, Google/Microsoft, passkeys, 2FA | `/signin`, `/signup`, `/two-factor`, … | Real | AUTH-1…12 | password-auth, magic-link, mfa-*, passkeys* | Improve (security) |
| Accounts | Onboarding | `/welcome` | Real | — | onboarding | Keep |
| Accounts | Account, sessions, data export/delete, API keys, embed | `/account`, `account/*` | Real | AUTH-5, AUTH-10 | privacy, account-scope, api-keys | Improve |
| Chat | Multi-model ask, debate, voice | `/app/ask`, `KeplarApp.tsx`, `api/keplar` | Real (debate, voice Beta) | No heading structure in a chat; duplicate ids in limit cards (UX-10); PERF-1 | core-*, answer-*, debate, voice e2e | Improve |
| Chat | Attachments (images, video, PDF, Office, audio, links, zip) | `Composer.tsx`, `lib/attachments/*` | Real | Marketing under-claims | attachments-parsers, link-ssrf | Keep |
| Chat | Web retrieval, Deep Research, Live Research | `orchestration/*`, desktop bridge | Beta (flagged) | — | sourcing, deep-research, live-research | Keep |
| Chat | Memory, projects, history, search, export | `lib/memory`, `ProjectWorkspace.tsx` | Real | PERF-1, PERF-2 | memory, projects, chat-* | Improve (performance) |
| Chat | Chat tools (MCP in Ask) | `ChatTools.tsx`, `api/mcp/chat` | Real (paid) | "Manage" leaves the app (UX-1); AI-3, AI-4 | mcp-chat* | Improve |
| Create | App builder | `/app/create`, `create/apps/*`, `api/apps/*` | Real | AZ-3 (app admin), AZ-5 (draft viewers) | app-builder*, app-runtime* | Improve (security) |
| Create | Site builder, templates, remix | `SiteBuilder.tsx`, `api/sites/*`, `/templates` | Real | AZ-1 (takedown), PERF-7 | site-*, templates | Improve |
| Create | Live collaboration, critic, deploy | `/app/create/live/[id]`, `api/collab`, `api/deploy` | Real | Collab long-poll load (PERF) | collab-crdt, deploy-* | Improve |
| Create | Images and video | `ImageStudio.tsx`, `VideoStudio.tsx`, `api/images`, `api/create/media` | Real | REL-1 (media jobs not durable); AZ-4 (blob path) | images, higgsfield-* | Improve |
| Create | Slides | `/app/slides` | Real | UX-3 (presenter keyboard); deck-list errors swallowed | slides | Improve |
| Create | Study | `/app/study` | Real | — | study | Keep |
| Create | Mobile app builder | `create/mobile/*` | Beta | — | mobile-creator | Keep |
| Create | Domains, deployments | `DomainPanel.tsx`, `/app/deployments` | Beta / Real | PERF-6; no tests for DeploymentsView | domains* | Improve |
| Studio | Keplar Studio (Roblox, Blender) | `/app/studio`, `app-ui/studio-mode/*` | Beta (desktop app required) | AI-7 (Blender auto-approve) | studio-* (22 files) | Improve |
| Studio | Roblox Cloud, Blender Cloud | `api/roblox-cloud`, `api/blender-cloud` | Beta | Stuck-job recovery daily only (REL-3) | roblox-cloud, blender-cloud | Improve |
| Space Studio | Site, download, backend | `/space-studio`, `api/space-studio/*` | Real | Headline rotation never pauses (WCAG 2.2.2); "0.1" copy in status section | space-studio, space-host | Improve |
| Business | Storefront, account, ChatGPT app | `/biz`, `business-site/*` | Real | Revenue Guard sold but not built (UX-5); example tile shows invented citations | business-plans, chatgpt* | Decide (Revenue Guard) |
| Business | Workspace, dashboard, projects, canvas, computer, analyst | `/biz/work`, `business-app/*` | Real | PERF-3; canvas pointer-only; `window.confirm`; AI-6 | business-workspace* | Improve |
| Business | CRM, orders, inbox, audit | `api/business/*` | Real | PERF-5; AZ-7 | business-* | Improve |
| Business | Banking (Plaid, Stripe) | `api/business/banks` | Real, not tried with live accounts | AZ-2 (viewers see bank data) | banks-* | Improve; Blocked for live verification |
| Business | Payments (Stripe Connect) | `api/business/payments*` | Real | AZ-2 (Editors can onboard payouts) | business-payments | Improve (security) |
| Business | Agents and approvals | `AgentsPanel`, `api/business/{agents,approvals}` | Real | AI-1, AI-2, AI-9, AI-10, AZ-2 | agents-*, scheduler | Improve (security) |
| Business | Teams | `api/team`, TeamPanel | Beta | AZ-2 | team, business-team, e2e | Improve |
| Business | MCP / connectors | `McpConnections.tsx`, `api/mcp`, `api/business/connectors` | Real, not tried with live accounts | Only reachable from Business and hidden `/app/wants` | mcp-*, connectors-* | Improve; Blocked for live verification |
| Agents | Keplar Browser | `/app/browser`, `lib/browser/*` | Built, never run live | UX-2 (unreachable); IN-1 (fixed); AI-5 | browser-agent | Improve (wire into app) |
| Agents | Keplar Wants | `/app/wants`, `lib/wants/*` | Real (production uses existing pipeline) | UX-2; stale page description; AI-13 | wants-* (7) | Improve (wire into app) |
| Agents | `/app/agents`, `/approvals`, `/business` in Keplar One | `KeplarApp.tsx:1352-1388` | Unwired (redirected to Business) | MCP OAuth return opens an embedded Business view | app-tabs e2e (stale) | Consolidate |
| Developers | Public API, extension, embed | `/developers`, `api/v1`, `extension/`, `/embed` | Beta | Store-submission status contradicts docs | api-keys, extension, embed, api e2e | Improve (docs) |
| Admin | Admin console | `/admin/*` | Real | AZ-6; `window.confirm` | admin-mfa, ops | Improve |
| Desktop | Download page and desktop sign-in | `/download`, `/desktop/connect` | Real | AUTH-6 | desktop-download, desktop-auth* | Improve |
| Desktop | Keplar One desktop app | keplar-desktop | Real (0.2.3) | DSK-1…20 | 213 unit + e2e | Improve; DSK-2 Blocked on signing certificates |
