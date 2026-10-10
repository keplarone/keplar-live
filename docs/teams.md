# Team workspaces (BETA, Business plan)

Status: **BETA**. Code is real and tested; the policy numbers are proposals marked `TODO(founder approval)` in `src/lib/team/policy.ts`. Nothing is billed per seat: a team is an owner's Business plan, shared.

## Model
- A team is its own tenant (`tm_<16hex>`). Projects, chats and sites created while "working in the team" are stored under the team id, so one query scope = one tenant. Personal data is never copied in.
- Roles: **viewer** (read), **editor** (UI label for internal `member`: +write, ask), **admin** (+delete, publish, invite/remove), **owner** (+promote admins, rename, export, delete team). One owner; no ownership transfer yet.
- Active team = cookie `keplar_team`. Every request re-reads the member row (`currentWorkspace(req, { team })` in `src/lib/create/platform/workspace.ts`): removed members, deleted teams and non-members all get 403 immediately; a lapsed owner plan pauses the team (403 `team_inactive`, owner can still export/delete).
- Routes opted in (shared): projects, chats, sites (CRUD, versions, restore, design, generate, estimate, duplicate, export, activity, qa), publish (admin+), ask. A test pins this list. **Not shared (personal only, gap):** site leads/data/analytics/removal/features/blog/shots/assets/import/enhance/discover, domains, billing, personal memory.

## Invites (drafts)
`POST /api/team/[id]/invites` only saves a draft. The send step is `POST …/invites/[inviteId] {via:"email"|"link"}`: email goes through `sendEmail` (Resend) and says honestly when no provider is configured; link mode returns a one-time link once. Token: 32 random bytes, stored as sha256 only, in the URL fragment (`/team/join#…`), 7-day expiry, single use, tied to the invited address (verified email required). Re-send rotates the token.

## Limits (stated honestly; see `policy.ts`)
Business only; up to 10 members incl. the owner; **one shared pool of 13,500 credits a month for the whole team** (not per member; separate from the owner's personal use; operator can override on the team row); 20 open invites; 20 invite emails/day/team, 3/day/recipient. No per-member caps or per-member usage breakdown yet.

## Audit, export, delete
Audit log (newest 500; visible to admin+): team created/renamed, invite drafted/updated/emailed/link created/revoked/accepted, role changed, removed/left, export downloaded. Owner export: `GET /api/team/[id]/export`. Delete: typed team name, then sites are purged and the team's collections deleted. Account deletion: blocked (409 `team_owned`) while you own a team; otherwise you are removed from every team first.

## Tests
`tests/team.test.ts` (14: roles matrix, invite draft/send/redeem, revocation, tenant isolation, pool, export/delete, opt-in list), `e2e/team.e2e.ts`.

## Pending
Team-level API keys; per-member caps and usage breakdown; leads/analytics/assets/domains in teams; owner transfer; SSO/SCIM; invite-email delivery verified against real Resend (only stubbed here).
