# Competitor parity: Grok, ChatGPT, Claude → Keplar One

Updated 2026-10-06 (ET); browser agent and screen sharing rows 2026-10-12. One table for every user-facing capability found in public sources for Grok (xAI), ChatGPT (OpenAI) and Claude (Anthropic), and what Keplar has for it.
Every Keplar feature is built independently: no source code, copy text, names, icons or layouts are taken from these products. Keplar uses its own names, its own voice and its own dark UI. Every answer is still cross-checked by several models.

**Status values:**
- **Built (stage n)**: shipped by this parity track.
- **Already had**: in Keplar before this work.
- **Covered by other track**: owned by a parallel executor (multimodal reading, Teams, public API and embed, Create).
- **Blocked**: the code exists behind a provider abstraction, and a key or a decision is missing (env var named).
- **Planned (stage n)**: next stages.
- **Gap**: not code-portable.

Sources were all checked 2026-10-06 and answered HTTP 200 from the box, except the Grok links, which come from `docs/grok-gap-list.md`.

- **Grok:** https://x.ai/grok · https://x.ai/news/grok-connectors · https://docs.x.ai/grok/connectors · https://x.ai/pricing (more in docs/grok-gap-list.md)
- **ChatGPT:**
  - Memory: https://help.openai.com/en/articles/8590148-memory-faq · https://help.openai.com/en/articles/10303002-how-does-memory-use-past-conversations
  - Tasks: https://help.openai.com/en/articles/10291617-tasks-in-chatgpt
  - Canvas: https://openai.com/index/introducing-canvas/
  - Projects: https://help.openai.com/en/articles/10169521-projects-in-chatgpt
  - Temporary chat: https://help.openai.com/en/articles/8914046-temporary-chat-faq
  - Custom instructions: https://help.openai.com/en/articles/8096356-custom-instructions-for-chatgpt
  - Study mode: https://help.openai.com/en/articles/11780217-chatgpt-study-mode-faq
  - Connectors: https://help.openai.com/en/articles/11487775-connectors-in-chatgpt
  - Shared links: https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq
  - Record: https://help.openai.com/en/articles/11487532-chatgpt-record
  - Voice: https://help.openai.com/en/articles/8400625-voice-mode-faq
  - GPTs: https://help.openai.com/en/articles/8554397-creating-a-gpt
  - Data analysis: https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt
  - Deep research: https://help.openai.com/en/articles/10500283-deep-research-faq
  - Agent: https://help.openai.com/en/articles/11752874-chatgpt-agent
  - Search: https://help.openai.com/en/articles/9237897-chatgpt-search
  - File uploads: https://help.openai.com/en/articles/8555545-file-uploads-faq
- **Claude:**
  - Projects: https://support.claude.com/en/articles/9517075-what-are-projects · https://support.claude.com/en/articles/9519189-project-visibility-and-sharing
  - Artifacts: https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
  - Personalization: https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features
  - Chat search and memory: https://support.claude.com/en/articles/11817273-using-claude-s-chat-search-and-memory-to-build-on-previous-context · https://www.anthropic.com/news/memory
  - Research: https://support.claude.com/en/articles/11088861-using-research-on-claude-ai
  - Integrations: https://support.claude.com/en/articles/11176164-pre-built-integrations-using-remote-mcp · https://www.anthropic.com/news/integrations
  - Analysis tool: https://www.anthropic.com/news/analysis-tool
  - Voice: https://support.claude.com/en/articles/11101966-using-voice-mode-on-claude-mobile-apps
  - Web search: https://support.claude.com/en/articles/10684626-enabling-and-using-web-search
  - File creation: https://www.anthropic.com/news/create-files
  - Browser extension: https://www.anthropic.com/news/claude-for-chrome

Items whose public page did not resolve during this pass (Claude incognito chats, Claude styles article, ChatGPT Pulse) are marked "source unconfirmed" and were built from the shared, well-documented behavior only.

## Highest impact first

| Capability | Found in | Keplar name | Status | Blocker + env var |
|---|---|---|---|---|
| Projects (chats, files, instructions grouped) | ChatGPT (Projects), Claude (Projects), Grok (Projects/Workspaces) | Projects | Already had (`/app/projects`, project files, memory, export) | — |
| Memory across chats, view, edit, delete | ChatGPT (Memory FAQ), Claude (memory), Grok (memory) | Memory | Already had (editable, deletable, erase-all, Free plan withholds memory from free hosts) | — |
| Custom instructions / response styles | ChatGPT (custom instructions), Claude (personalization, styles: source unconfirmed), Grok (customize) | **Answer preferences** (Account > Personalization): About you, How to answer, styles Standard/Brief/Teaching/Formal/Plain language/Custom, master switch, clear | **Built (stage 1)** | — |
| Side document / code workspace | ChatGPT (canvas), Claude (artifacts), Grok (Studio, discontinued) | **Side draft**: open any answer as a draft; edit, preview, versions + restore, revise all or only a selection with Keplar, apply the revision back, copy, download, run code | **Built (stage 1)** | — |
| Scheduled tasks | ChatGPT (Tasks), Grok (Tasks/Automations) | **Scheduled question** agent (Agents > Add agent): your question answered by the full panel on your cron/time zone and delivered to your Keplar inbox with the agreement level and cited sources | **Built (stage 1)** (Plus+; Free and Lite can't schedule) | — |
| Connectors (read/write apps, MCP) | ChatGPT (connectors), Claude (integrations, remote MCP), Grok (connectors) | Connected apps + MCP | Already had (Gmail send, Calendar create, Slack post, GitHub issue, any remote MCP server). Read/search connectors for Drive/Gmail/Docs are a **Gap** | Live use needs `GOOGLE_CONNECT_CLIENT_ID`/secret with Google sensitive-scope verification, `SLACK_CLIENT_ID`, `GITHUB_CONNECT_CLIENT_ID` (founder setup) |
| Study / learning mode | ChatGPT (study mode), Grok (unconfirmed) | Study | Already had (`/app/study`, placement quiz, flashcards, exam plan, Study chip) | — |
| Custom assistants | ChatGPT (GPTs), Claude (project instructions + knowledge), Grok (companions/skills) | **Specialists**: name, instructions, reference notes, up to 4 starters; pick per chat; 3 on Free, 30 on paid; notes withheld from free hosts | **Built (stage 1)**; a chat's Specialist syncs across devices (stage 4) | — |
| Temporary / incognito / private chat | ChatGPT (temporary chat), Claude (incognito: source unconfirmed), Grok (private chat) | **Private chat** | **Built (stage 1)**: never saved in the browser or the account, the server reads and writes no memory and learns nothing from it, kept out of lists, search and titles, gone when you leave | — |
| Shared links to whole chats | ChatGPT (shared links), Claude (artifact/project sharing), Grok (share) | **Share chat**: pick turns, "Hide personal details" (emails, phones, long numbers), hide your own words, preview, revoke; Account > Shared links lists every link | **Built (stage 1)** (answer links already had) | — |
| Visible reasoning / extended thinking | ChatGPT (reasoning), Claude (extended thinking), Grok (Think) | **Reason** chip: step-by-step framing, more reasoning effort, thorough panel on paid plans, and a "how this answer was checked" list built only from real run data (panel, agreement %, disagreements, reviewer checks, sources) | **Built (stage 1)** | — |
| Code execution / data analysis / charts | ChatGPT (data analysis), Claude (analysis tool), Grok (code execution) | **Run** (code runner): JavaScript and Python (Pyodide) in a sandboxed frame in your own browser; matplotlib charts as images; no account or network access; time limits | **Built (stage 1)** (Run on every JS/Python code block and on code drafts); stage 2: package-loading messages go to the status line, code drafts get a shorter editor so output stays in view | — |
| Web search with citations | ChatGPT (search), Claude (web search), Grok (search) | Web + source check | Already had (flag-gated) | `KEPLAR_RETRIEVAL_ENABLED=true` (not set; founder cost decision) |
| Deep research | ChatGPT (deep research), Claude (Research), Grok (DeepSearch) | Deep Research | Already had (flag-gated, paid) | `KEPLAR_RETRIEVAL_ENABLED=true` |
| Model choice | ChatGPT (model picker), Claude (model selector), Grok (Fast/Auto/Expert/Heavy) | Strategy (Automatic/Fastest/Balanced/Most thorough) + routing options | Already had (Free stays on OpenRouter `:free` models) | — |
| Image generation and editing | ChatGPT, Grok (Imagine) | Create image / reference image | Already had | — |
| Video generation | ChatGPT (Sora), Grok (Imagine) | Create > Video | Already had (beta) | — |
| File uploads, documents, links, video | ChatGPT (file uploads), Claude, Grok | Attach | Covered by other track (multimodal reading) | — |
| Chat history search | ChatGPT, Claude (chat search) | Search (⌘K) + History | Already had | — |
| Voice conversation | ChatGPT (voice mode), Claude (voice mode), Grok (voice) | Talk (push-to-talk + read aloud); **Talk live** (real-time duplex voice) | Already had (browser push-to-talk); **Built (stage 2), off until switched on**: Talk live above the composer for signed-in paid plans; the browser's WebRTC offer goes through `/api/voice/realtime` (server key never leaves the server, hashed safety id, 12 calls/hour, 10-minute calls), live transcript, labelled "one model, not cross-checked", transcript opens as a side draft | `KEPLAR_REALTIME_VOICE=openai` + `OPENAI_API_KEY` (optional `KEPLAR_REALTIME_MODEL`, default gpt-realtime; `KEPLAR_REALTIME_VOICE_NAME`, default marin). Per-minute cost and audio privacy are a founder decision; no per-minute metering yet |
| Camera capture in the composer | ChatGPT, Claude, Grok mobile | Camera | Already had: the composer's attach picker accepts images, so phones offer "take photo" directly | — |
| Real-time X posts | Grok | Posts on X | **Built (stage 2), blocked on key**: provider `lib/providers/x-posts.ts` (X API v2 recent search, author/link/metrics, no reposts) + `POST /api/x/search` (signed-in, paid, 30/hour, 503 `not_configured` without the token; never fakes posts). Stage 3: a **Posts on X** button under answers (editable search prefilled from the question, posts with handle/time/metrics/link, labelled "not checked by the panel", open as a draft to check with Keplar); hidden unless switched on | `X_BEARER_TOKEN` (X API pay-per-use, about $0.005 per post read) |
| Meeting / record mode → notes | ChatGPT (Record) | **Record notes** | **Built (stage 3)**: on a new chat, live transcript through the browser's speech service with timestamps (up to 2 hours), then it opens as a side draft with a one-line prompt to turn it into notes, decisions and action items. Keplar keeps only the text, in the browser | — (browser Web Speech; unsupported browsers get no button) |
| Agent with a browser / computer | ChatGPT (agent), Claude (Chrome extension), Grok (Bot) | **Keplar Browser** (`/app/browser`) + Agent (business workflows with approvals) | **Built (2026-10-12)**: an isolated, signed-out serverless Chromium per task; the model takes one action at a time from a numbered page snapshot; every step saved with its address and the newest screenshot; public web only (SSRF checks on every request and redirect hop); stops before buying, sending, deleting, accepting terms or signing in; keeps running after the tab closes; Stop any time. Control of the person's own computer is a **Gap** (see docs/capability-audit.md) | Needs live models in the deployment |
| Share your screen with the assistant | ChatGPT (screen share in voice, mobile), Claude (Chrome extension sees tabs) | **Share screen** (attach menu) | **Built (2026-10-12)** on the web: the browser's own picker, a frame only at start and on Capture, unchanged screens not re-sent, Stop / browser bar / 15 minutes end it. Desktop apps: **Blocked** until they add a display-media handler with a source picker | — |
| Create files (docs, sheets, slides) | Claude (create files), ChatGPT (canvas export) | Slides, Create, Side draft download | Already had / Covered by other track (Create) | — |
| Specialist sharing / directory | ChatGPT (GPT store) | **Specialist links** | **Built (stage 3)**: Settings > Specialists > Share makes a /sp/<token> link to a snapshot (reference notes only if you tick it); the public page shows everything before "Add to my specialists" copies it into the visitor's account; views and copies counted; revoke in Settings > Shared links; 180-day expiry; rate-limited views, report link. **Built (stage 4)**: the public **Specialist directory** at /specialists (owner asks to list, automatic screen, admin approval at /admin/specialists, categories and search, withdraw any time) | `OPENAI_MODERATION_API_KEY` for the live moderation check (an admin approves every listing either way) |
| Location-aware answers | Grok (location in thinking), ChatGPT (approximate location) | **Your location** (Answer preferences) | **Built (stage 3)**: typed city or region (or "Use my time zone"); used only when place matters; withheld on Free like "About you"; Keplar never reads device location | — |
| Event-triggered automations | Grok (Automations), ChatGPT (agent tasks) | **Event responders** | **Built (stage 4)**: an agent template that starts on a secret per-agent webhook or an email to its own address; records to the inbox, drafts a reply or summary; every outbound action waits for approval (auto-send refused); allow-listed senders | `KEPLAR_INBOUND_EMAIL=postmark` + `_DOMAIN` + `_SECRET` and MX; Gmail/Slack connectors to send approved drafts |
| Kids mode with a parent PIN | Grok (kids mode) | **Family mode** | **Built (stage 4)**: parent PIN (scrypt, lockout, fresh-sign-in reset); age-appropriate rules lead every answer on the account incl. API and Embed; optional homework guidance; Private chat, Talk live and Posts on X hidden and refused server-side | — |
| One-tap image templates | Grok (Imagine templates) | Image presets | Covered by other track (Create) | — |
| Team workspaces, admin | ChatGPT Team/Enterprise, Claude Team, Grok Business | Teams (beta) | Covered by other track | — |
| Public API, embed | All three (APIs) | Developer API, Embed Ask | Covered by other track; **built-in tools added (stage 4)**: `tools` on `/api/v1/ask` (reason, debate, web_search, deep_research, read_url, x_search) with a per-tool outcome report | — |
| Native mobile apps | All three | PWA | Gap (non-code: store accounts) | — |
| Proactive daily updates | ChatGPT (Pulse; source unconfirmed) | Daily brief + Scheduled question | Already had / Built (stage 1) | — |

Per-product view: every row lists which products have it, so filter the "Found in" column for one product.
