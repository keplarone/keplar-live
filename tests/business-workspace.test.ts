import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testWorkspace } from "./helpers/workspace";
import { addTask, cleanLayout, DEFAULT_LAYOUT, updateTask, WIDGETS } from "@/lib/business/workspace-data";

test("dashboard layout: known widgets only, each once, valid sizes; missing ones come back at the end", () => {
  assert.deepEqual(cleanLayout(null), DEFAULT_LAYOUT);
  const out = cleanLayout([{ id: "usage", size: "l" }, { id: "usage", size: "s" }, { id: "evil", size: "l" }, { id: "revenue", size: "xxl" }]);
  assert.deepEqual(out.slice(0, 2), [{ id: "usage", size: "l" }, { id: "revenue", size: "m" }]);
  assert.equal(out.length, WIDGETS.length);
  assert.equal(new Set(out.map((x) => x.id)).size, WIDGETS.length);
});

test("tasks: need a title, start as to do, valid status and due dates only", async () => {
  const ws = await testWorkspace("biz-tasks", "plus");
  await assert.rejects(addTask(ws.id, "p1", { title: "   " }), /title/);
  const t = await addTask(ws.id, "p1", { title: "  Ship\nthe launch  page ", due: "2026-11-02" });
  assert.equal(t.title, "Ship the launch page");
  assert.equal(t.status, "todo");
  assert.equal(t.due, "2026-11-02");
  assert.equal((await addTask(ws.id, "p1", { title: "x", due: "tomorrow" })).due, null);
  assert.equal((await updateTask(ws.id, t.id, { status: "done" })).status, "done");
  await assert.rejects(updateTask(ws.id, t.id, { status: "archived" }), /todo, doing or done/);
  await assert.rejects(updateTask(ws.id, "tk_missing", { status: "done" }), /not found/);
});

test("workspace APIs need an active Business plan; the summary uses only the account's own numbers", () => {
  const gate = readFileSync("src/lib/business/require.ts", "utf8");
  assert.match(gate, /hasBusinessAccess\(ws\.plan, ws\.admin\)/);
  for (const f of ["src/app/api/business/layout/route.ts", "src/app/api/business/tasks/route.ts", "src/app/api/business/tasks/[id]/route.ts", "src/app/api/business/summary/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /requireBusiness\(req\)/, f);
  }
  const summary = readFileSync("src/app/api/business/summary/route.ts", "utf8");
  assert.match(summary, /never invent figures/);
  assert.match(summary, /assertSameOrigin\(req\)/);
});

test("desktop: a Business account opening the ask page goes to /app/work unless it chose Keplar One (?stay=1)", () => {
  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(app, /state\.ledger\.plan === "business"/);
  assert.match(app, /get\("stay"\) === "1"/);
  assert.match(app, /data-desktop"\) !== "1"/);
  assert.match(app, /window\.location\.replace\("\/app\/work"\)/);
  const ws = readFileSync("src/components/business-app/BusinessWorkspace.tsx", "utf8");
  assert.doesNotMatch(ws, /study|skill/i, "no Study or Skills in Business");
});
