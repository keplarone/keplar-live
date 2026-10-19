# Activity center

The business work page (`/work`, `BusinessWorkspace` home) shows pending `biz_approvals` as an activity center: a count and the newest rows. The rows already live in that collection. This does not add a table.

`GET /api/business/approvals` still returns the newest 60 approvals for the Approvals screen. It also returns `pendingCount`, the number of rows whose status is `pending`, counted before that page is cut. Each successful read logs `approvals.activity` with that count only (no recipient, subject, body, or tool arguments).

The center (`src/components/business-app/ActivityCenter.tsx`) asks for those rows and keeps a one-line label (`src/lib/business/activity.ts`). A label names the kind of action. It does not include a message body, spreadsheet cells, or tool arguments. Review opens the existing Approvals screen, which is where the decision is made.

The center is white with graphite ink, Inter, and no glow. Button press and hover timing come from `src/styles/motion.css`.
