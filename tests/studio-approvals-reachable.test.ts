import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (p: string) => readFileSync(join(process.cwd(), "src/components/app-ui/studio-mode", p), "utf8");

test("overlay: auto-approve can always be turned back off (control-center details), not only while something waits", () => {
  const cc = src("workspace/ControlCenter.tsx");
  assert.match(cc, /\{compact \? \(/);
  assert.match(cc, /<Switch checked=\{a\.autoApprove\} onCheckedChange=\{a\.setAuto\} label="Auto-approve safe changes" \/>/);
});

test("destructive steps are never a plain Approve in the code panel or a diff", () => {
  const panel = src("code/CodePanel.tsx");
  assert.match(panel, /risk === "destructive"/);
  assert.match(panel, /destructive \? "Approve this change" : "Approve"/);
  assert.match(panel, /destructive=\{destructive\}/);
  const diff = src("code/DiffView.tsx");
  assert.match(diff, /p\.destructive \? "Approve this change" : "Approve"/);
  assert.match(src("workspace/Inspector.tsx"), /destructive=\{pick\.c\.risk === "destructive"\}/);
});

test("Cloud, add-on and top-up nav entries sit behind the workspace gates", () => {
  const ws = src("workspace/Workspace.tsx");
  assert.match(ws, /!\(bridge && allowed\) \? null : isBlender/);
  assert.match(ws, /bridge && allowed \? <NavEntry[^\n]*label="Auto top-up"/);
});
