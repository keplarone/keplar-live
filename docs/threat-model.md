# Keplar threat model

Written Oct 17, 2026, from the code as it is. Reviewed with every security pass (`docs/security-policy.md` sets the cadence) and
whenever a new surface ships: a new integration, a new agent capability, a new way for Keplar to act on the world. The security
checklist (`docs/security-checklist.md`) maps each control back to the threats here.

## What Keplar is, in security terms

- **keplar.one**: a Next.js application on Vercel (serverless functions plus an edge proxy, `src/proxy.ts`), one Neon Postgres
  database reached over HTTPS, email through Resend, payments through Whop (Keplar One plans) and Stripe Connect (Business sellers),
  model calls through OpenRouter, OpenAI and NVIDIA, and optional connectors (Google, Microsoft, Slack, GitHub, Notion, Linear,
  Plaid, user-supplied MCP servers).
- **It acts on the world.** Business agents can send email, post to Slack, create records in connected tools; Keplar Browser drives
  a headless browser; Studio writes Roblox scripts; Blender Cloud renders on Vercel Sandbox machines; the app builder publishes
  websites and apps on keplar.one subpaths and customers' own domains.
- **It runs other people's content.** Generated sites and apps are served from keplar.one; uploaded files and documents are read
  by models; connected MCP servers return arbitrary text.

## Assets, ranked

1. **Money and credits**: the operator's provider spend; users' plan credits and Studio top-ups; Business sellers' Stripe payouts.
2. **Account access**: sessions, passwords, second factors, passkeys, API keys, connector tokens (which open other services).
3. **Customer content**: chats, memory, documents, generated sites/apps, Business CRM data, leads collected by customer sites.
4. **The integrity of what Keplar publishes**: a customer site or app must never become a phishing or malware host.
5. **Operator control**: kill switches, admin pages, deployment, DNS, the Vercel and Neon accounts.

## Trust boundaries

| Boundary | What crosses it | Control |
|---|---|---|
| Browser → keplar.one | Cookies, JSON bodies, uploads, form posts | Same-origin check on state changes (`src/lib/security/origin.ts`), per-IP and per-account limits, body caps, schema checks per route, session checked against the database on every request (`src/lib/accounts/session-guard.ts`) |
| keplar.one → Neon | SQL over HTTPS with parameters | One credential in Vercel's encrypted env; every row carries its `workspace_id`; the store API scopes every query (`src/lib/create/platform/store.ts`) |
| keplar.one → model providers | Prompts, fenced untrusted text | No credentials or secrets in prompts; secret patterns stripped; provider policy flags; spend caps per request, day, plan |
| Model output → Keplar | JSON plans, code, drafts, tool proposals | Parsed with schemas, never executed as code on the server; code runs only in the browser sandbox or a Vercel Sandbox; actions pass the Firewall and approvals |
| Connected tools → Keplar | Tool descriptions, results, OAuth tokens, webhook calls | Sanitized and fenced as untrusted (`src/lib/mcp/sanitize.ts`), SSRF-pinned fetches (`src/lib/mcp/ssrf.ts`), tokens sealed with AES-GCM, webhooks signature-checked |
| Published site/app → visitor | HTML/CSS (and, for apps, the app's own modules) | Allow-list sanitizer, sandbox CSP with an opaque origin, no third-party script, forms only to Keplar's rate-limited handler, the generated-output checklist (`src/lib/create/output-checklist.ts`) |
| Customer domain → keplar.one | Host header | Only the published site for a verified, active domain is served on a foreign host; nothing else of the app is reachable (`src/proxy.ts`) |
| Operator → production | Merges to `main`, deploys, env changes | Branch ruleset, CI gate, deploy stamp and build guard, admin MFA option, audit log |

## Threat actors

- **Opportunistic attackers**: credential stuffing, bot sign-ups to drain Free, scraping, SSRF probes, uploading malware to host it.
- **Abusive users**: free-trial farming, running up provider spend, publishing phishing or scam sites, prompt-injecting their own
  agents to send spam from Keplar's connectors.
- **Prompt injection by third parties**: a web page, document, email or tool result that tells the model to exfiltrate data or take
  an action the owner did not ask for.
- **A compromised dependency or CI**: a malicious package or a workflow with secrets exposed to a pull request.
- **An insider or a stolen operator credential**: the founder account, a Vercel token, the Neon connection string.

## Threats and how they are met (STRIDE by surface)

### Accounts
- Spoofing: password guessing and stuffing → per IP, IP+email, network+email and per-email ceilings with no hard lockout; identical
  answers for known and unknown addresses; TOTP, passkeys, new-device notices; security events and owner alerts on bursts.
- Session theft → HttpOnly/Secure/SameSite cookies, server-side session rows (revocable, idle and absolute expiry), reauthentication
  for sensitive changes, sign-out-everywhere.
- Account takeover through a linked provider → only provider-verified emails are accepted; linking limited to Google and Microsoft.

### Authorization and tenancy
- IDOR between workspaces → every store call carries the caller's workspace; `tests/authz.test.ts` walks every route anonymously
  and as another user; `tests/account-scope.test.ts` and `tests/share-isolation.test.ts` try cross-tenant reads.
- Privilege escalation to admin → admin is an allow-listed email with a verified session (optionally with MFA), pages answer 404.

### Money
- Forged webhooks or replayed events → signature verification, timestamp window, idempotency by event id, server-side plan ids.
- Double spending credits → atomic conditional upserts, single-writer locks on top-ups, concurrency caps.
- Runaway provider spend → per-request, per-day, per-plan caps; global daily cap and breaker; spike auto-pause; operator kill switches.

### AI and agents
- Prompt injection → untrusted text fenced and sanitized; the model never holds credentials; actions that change the world go through
  the deterministic Firewall and the owner's approval queue; budgets, step caps and deadlines bound every run; everything is logged
  and can be stopped from `/admin`. No filter is perfect: the design limits what a fooled model can do rather than trusting a filter.
- Model-generated code → runs only in the browser sandbox (opaque origin, no network except the pinned Pyodide CDN) or a Vercel
  Sandbox machine; generated sites run no script; generated apps run only their own files under a sandbox CSP.

### Published content
- Hosting phishing or malware → sanitizer and CSP, no password fields or foreign form targets on sites, upload scanning, abuse
  reports with automatic takedown for the worst categories, the `Report` link on every published page, watermark on free plans.
- Customer-domain confusion → strict host handling, HSTS without `includeSubDomains` on customer hosts, ownership verified by TXT record.

### Supply chain and delivery
- Malicious dependency → lockfile pinned to registry.npmjs.org with sha512, `npm ci --ignore-scripts`, dependency review on PRs,
  weekly Dependabot, production audit gate, CodeQL.
- Compromised CI → workflows hold no secrets and run read-only; deploys come from Vercel's Git integration or an operator machine
  with the deploy stamp; the build guard refuses stale or unstamped production builds.

### Operations
- Leaked secret → only in Vercel's encrypted env, never in code (scans on source, CI and build output), rotation runbook, security
  events on secret access.
- Loss of data → Neon point-in-time restore plus the scripted encrypted export; restore drill is an owner task with a date in the runbook.

## What this model does not cover (and says so)

- Physical and endpoint security of the operator's machines and accounts (phishing of the founder is the most likely real-world path;
  the mitigation is hardware-key MFA on GitHub, Vercel, Neon, Whop and Google, which is an owner action listed in `docs/known-gaps.md`).
- Side channels inside shared model providers, and the providers' own retention (disclosed to users, not controlled by Keplar).
- Denial of service beyond Vercel's platform mitigation and Keplar's rate limits: a determined, distributed attack can still cost money
  before the breaker trips.
- Red-team testing with live models and an external penetration test have not been done; both are in the policy calendar.
