import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activityLabel, activityView } from "@/lib/business/activity";
import { approvals } from "@/lib/business/repo";
import { signIn, call } from "./helpers/session";
import type { Approval } from "@/lib/business/types";

const BODY = "SECRET_BODY_MARKER";
const ARG = "SECRET_ARG_MARKER";

test("activity lines name the action and leave out bodies, cells, and tool arguments", () => {
  assert.equal(activityLabel({ type: "email.send", to: "pat@example.com", subject: "Hello" }), "Email to pat@example.com: Hello");
  assert.equal(activityLabel({ type: "slack.post", channel: "#ops" }), "Slack message to #ops");
  assert.equal(activityLabel({ type: "social.schedule", network: "LinkedIn" }), "LinkedIn post");
  assert.equal(activityLabel({ type: "gcal.event", title: "Standup" }), "Calendar event: Standup");
  assert.equal(activityLabel({ type: "github.issue", repo: "keplarone/keplar-live" }), "GitHub issue in keplarone/keplar-live");
  assert.equal(activityLabel({ type: "sheets.append", sheet: "Leads" }), "Add a row to Leads");
  assert.equal(activityLabel({ type: "mcp.call", tool: "search", serverName: "Docs" }), "Call search on Docs");
  assert.equal(activityLabel({ type: "mcp.call" }), "Connected app call");
  assert.equal(activityLabel({ type: "other" }), "Action waiting for approval");
  assert.equal(activityLabel(undefined), "Action waiting for approval");

  const view = activityView({
    pendingCount: 4,
    approvals: [
      { id: "old", status: "pending", createdAt: "2026-10-01T00:00:00.000Z", agentName: "Daily brief", action: { type: "email.send", to: "a@example.com", subject: "Old", body: BODY } },
      { id: "sent", status: "sent", createdAt: "2026-10-18T00:00:00.000Z", agentName: "You", action: { type: "slack.post", channel: "#x", text: BODY } },
      { id: "new", status: "pending", createdAt: "2026-10-17T00:00:00.000Z", agentName: "Ask", action: { type: "mcp.call", tool: "search", serverName: "Docs", args: { q: ARG } } },
      { id: "sheet", status: "pending", createdAt: "2026-10-16T00:00:00.000Z", agentName: "Agent", action: { type: "sheets.append", sheet: "Leads", row: [ARG] } },
      { id: "exec", status: "executing", createdAt: "2026-10-19T00:00:00.000Z", action: { type: "email.send", to: "b@example.com", body: BODY } },
    ],
  }, 2);
  assert.equal(view.count, 4, "the API count covers pending rows that are older than this page");
  assert.deepEqual(view.items.map((item) => item.id), ["new", "sheet"]);
  const packed = JSON.stringify(view);
  assert.equal(packed.includes(BODY), false);
  assert.equal(packed.includes(ARG), false);
  assert.equal(view.items[0]?.label, "Call search on Docs");
});

test("a missing or nonsense pending count falls back to the pending rows in hand", () => {
  const rows = [{ id: "a", status: "pending", createdAt: "2026-10-02T00:00:00.000Z", action: { type: "slack.post", channel: "#a" } }];
  assert.equal(activityView({ approvals: rows }).count, 1);
  assert.equal(activityView({ approvals: rows, pendingCount: -1 }).count, 1);
  assert.equal(activityView({ approvals: rows, pendingCount: Number.NaN }).count, 1);
  assert.equal(activityView({ approvals: "nope", pendingCount: 3 }).count, 3);
  assert.equal(activityView(null).count, 0);
});

test("the work page activity center reads existing approvals and does not add a table", () => {
  const home = readFileSync("src/components/business-app/Home.tsx", "utf8");
  const center = readFileSync("src/components/business-app/ActivityCenter.tsx", "utf8");
  const route = readFileSync("src/app/api/business/approvals/route.ts", "utf8");
  const css = readFileSync("src/components/business-app/activity.module.css", "utf8");
  const page = readFileSync("src/app/(business-app)/biz/work/page.tsx", "utf8");
  assert.match(page, /BusinessWorkspace/);
  assert.match(home, /<ActivityCenter /);
  assert.match(center, /\/api\/business\/approvals/);
  assert.match(center, /x-keplar-activity/);
  assert.match(route, /pendingCount/);
  assert.match(route, /approvals\.activity/);
  assert.doesNotMatch(`${center}\n${route}\n${readFileSync("src/lib/business/activity.ts", "utf8")}`, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
  assert.match(css, /--font-business/);
  assert.match(css, /background:\s*var\(--kb-glass-solid\)/);
  assert.match(css, /color:\s*var\(--kb-ink\)/);
  assert.match(css, /:global\(\.m-skeleton\)\.skel[\s\S]*background:\s*var\(--kb-surface-2\)/);
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /#(?:fff|ffffff|17171a|d9dce2|f4f4f5|3a3d44|26282d)\b/i);
  const shadows = [...rules.matchAll(/box-shadow:\s*([^;]+)/g)].map((m) => m[1]!.trim());
  assert.ok(shadows.length > 0 && shadows.every((value) => value === "none"));
  assert.doesNotMatch(rules, /gradient|text-shadow|drop-shadow/);
  assert.match(readFileSync("docs/architecture/activity-center.md", "utf8"), /biz_approvals/);
});

test("GET /api/business/approvals reports the full pending count and logs only that count", async () => {
  const { cookie, workspaceId } = await signIn(`activity-${Date.now()}@example.com`, "business");
  const base = { workspaceId, agentId: "owner", runId: "run_activity", decidedAt: null as string | null };
  const pending: Approval = {
    ...base,
    id: `apr_act_${workspaceId}_p`,
    action: { type: "email.send", connector: "gmail", to: "pat@example.com", subject: "Hello", body: BODY },
    status: "pending",
    createdAt: "2026-10-18T00:00:00.000Z",
  };
  const sent: Approval = {
    ...base,
    id: `apr_act_${workspaceId}_s`,
    action: { type: "slack.post", connector: "slack", channel: "#ops", text: BODY },
    status: "sent",
    decidedAt: "2026-10-19T00:00:00.000Z",
    createdAt: "2026-10-19T00:00:00.000Z",
  };
  await approvals().insert(pending);
  await approvals().insert(sent);

  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
    orig.apply(console, args);
  };
  try {
    const anonymous = await (await import("@/app/api/business/approvals/route")).GET(call(null, "/api/business/approvals"));
    assert.notEqual(anonymous.status, 200);
    const res = await (await import("@/app/api/business/approvals/route")).GET(call(cookie, "/api/business/approvals"));
    assert.equal(res.status, 200);
    const body = await res.json() as { pendingCount: number; approvals: { id: string; status: string; agentName: string }[] };
    assert.equal(body.pendingCount, 1);
    assert.equal(body.approvals.filter((row) => row.status === "pending").length, 1);
    assert.equal(body.approvals.find((row) => row.status === "pending")?.agentName, "You");
    const logged = lines.filter((line) => line.includes("approvals.activity"));
    assert.equal(logged.length, 1);
    assert.match(logged[0]!, /"pending":1/);
    assert.equal(logged[0]!.includes(BODY), false);
    assert.equal(logged[0]!.includes("pat@example.com"), false);
  } finally {
    console.log = orig;
  }
});
