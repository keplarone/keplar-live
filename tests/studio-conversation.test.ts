import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  IDEAS,
  MAX_REFS,
  REFS_LIMIT_ERROR,
  STAGE_LABEL,
  actionDot,
  approvalStage,
  approvals,
  canBuild,
  codeActionKeys,
  controls,
  inlineCode,
  mergeRefs,
  placeholder,
  planStates,
  runState,
  safeWaiting,
  sendIcon,
  splitPlan,
  submitsOnKey,
  thinking,
  uploadUrls,
} from "@/components/app-ui/studio-mode/workspace/conversation-model";
import { offerDraft, peekDraft, subscribeDrafts, takeDraft } from "@/components/app-ui/studio-mode/workspace/draft";
import type { Item } from "@/components/app-ui/studio-mode/useStudioAgent";
import type { StudioEvent } from "@/components/app-ui/studio-mode/code/events";
import type { CodeModel } from "@/components/app-ui/studio-mode/code/documents";

const act = (key: string, risk: "read" | "change" | "destructive", status: "waiting" | "running" | "done" | "failed" | "skipped", extra: Partial<Extract<Item, { kind: "action" }>> = {}): Item =>
  ({ kind: "action", key, name: "execute_luau", args: {}, risk, status, ...extra });

test("approval stages distinguish read-only, pending, destructive, approved, applied, declined and failed", () => {
  assert.equal(approvalStage({ risk: "change", status: "waiting" }), "pending");
  assert.equal(approvalStage({ risk: "destructive", status: "waiting" }), "pending-destructive");
  assert.equal(approvalStage({ risk: "change", status: "running" }), "approved");
  assert.equal(approvalStage({ risk: "read", status: "running" }), "running");
  assert.equal(approvalStage({ risk: "change", status: "done" }), "applied");
  assert.equal(approvalStage({ risk: "read", status: "done" }), "done");
  assert.equal(approvalStage({ risk: "change", status: "skipped" }), "declined");
  assert.equal(approvalStage({ risk: "destructive", status: "failed" }), "failed");
  assert.equal(STAGE_LABEL["pending-destructive"], "Needs your approval");
  assert.deepEqual(["waiting", "running", "done", "failed", "skipped"].map((s) => actionDot(s as never)), ["warning", "running", "success", "error", "offline"]);
});

test("approve all safe never includes a destructive step or a revert", () => {
  const items: Item[] = [
    act("a", "change", "waiting"),
    act("b", "destructive", "waiting"),
    act("c", "change", "waiting", { origin: "revert", of: "x" }),
    act("d", "change", "done"),
    act("e", "read", "waiting"),
    { kind: "note", key: "n", text: "hi" },
  ];
  assert.deepEqual(safeWaiting(items).map((x) => x.key), ["a", "e"]);
});

test("auto-approved changes are told apart from the person's approvals, from the real event log", () => {
  const ev = [
    { kind: "approval.granted", action: "a", by: "person" },
    { kind: "approval.granted", action: "b", by: "auto-approve" },
    { kind: "action.running", action: "a", name: "x" },
  ] as unknown as StudioEvent[];
  const m = approvals(ev);
  assert.equal(m.get("a"), "person");
  assert.equal(m.get("b"), "auto-approve");
  assert.equal(m.get("c"), undefined);
});

test("View code is offered only for actions that have a code document", () => {
  const model = {
    documents: [
      { action: "k1", versions: [{ action: "k2" }, { action: null }], changes: [{ action: "k3" }] },
      { action: null, versions: [], changes: [] },
    ],
    changes: [],
    activeId: null,
  } as unknown as CodeModel;
  assert.deepEqual([...codeActionKeys(model)].sort(), ["k1", "k2", "k3"]);
});

test("the thinking line shows only while the model is really working", () => {
  assert.equal(thinking({ running: false, looking: false, items: [] }), null);
  assert.equal(thinking({ running: true, looking: true, items: [] }), "looking");
  assert.equal(thinking({ running: true, looking: false, items: [act("a", "read", "done")] }), "thinking");
  assert.equal(thinking({ running: true, looking: false, items: [act("a", "change", "waiting")] }), null);
  assert.equal(thinking({ running: true, looking: false, items: [act("a", "read", "running")] }), null);
});

test("a reply's numbered plan is split out; live states only for the run's current plan", () => {
  const text = "Here is the plan:\n1. Build the map\n2. **Add** lava\n\n3. Checkpoints\nStarting now.";
  const parts = splitPlan(text);
  assert.deepEqual(parts, [
    { type: "text", text: "Here is the plan:" },
    { type: "plan", steps: ["Build the map", "Add lava", "Checkpoints"] },
    { type: "text", text: "Starting now." },
  ]);
  // Two numbered lines are not a plan (parsePlan needs three): kept as text.
  assert.deepEqual(splitPlan("1. a\n2. b"), [{ type: "text", text: "1. a\n2. b" }]);
  const live = [{ text: "Build the map", state: "done" }, { text: "Add lava", state: "doing" }, { text: "Checkpoints", state: "next" }] as const;
  assert.deepEqual(planStates(["Build the map", "Add lava", "Checkpoints"], live), ["done", "doing", "next"]);
  assert.equal(planStates(["Other", "Add lava", "Checkpoints"], live), null);
  assert.equal(planStates(["Build the map", "Add lava"], live), null);
});

test("references keep today's limit and wording", () => {
  assert.equal(MAX_REFS, 8);
  assert.equal(REFS_LIMIT_ERROR, "Up to 8 reference images per request (a video counts as 6 frames).");
  assert.deepEqual(mergeRefs(["a"], ["b", "c"]), { refs: ["a", "b", "c"], error: "" });
  const full = mergeRefs(["1", "2", "3", "4", "5"], ["6", "7", "8", "9", "10", "11"]);
  assert.equal(full.refs.length, 8);
  assert.equal(full.error, REFS_LIMIT_ERROR);
});

test("Enter sends, Shift+Enter is a newline, never while running or composing", () => {
  assert.equal(submitsOnKey({ key: "Enter", shiftKey: false }, false), true);
  assert.equal(submitsOnKey({ key: "Enter", shiftKey: true }, false), false);
  assert.equal(submitsOnKey({ key: "Enter", shiftKey: false }, true), false);
  assert.equal(submitsOnKey({ key: "Enter", shiftKey: false, isComposing: true }, false), false);
  assert.equal(submitsOnKey({ key: "a", shiftKey: false }, false), false);
  assert.equal(canBuild("  ", 0, { running: false, playing: false }), false);
  assert.equal(canBuild("", 1, { running: false, playing: false }), true);
  assert.equal(canBuild("go", 0, { running: false, playing: true }), false);
});

test("run controls: Build/Stop/End run and Play test/Pause/Continue from the real run state", () => {
  const idle = { running: false, paused: false, playing: false, items: [] as unknown[] };
  let c = controls(idle, true, false);
  assert.equal(c.play, null); // no play test before anything was built
  assert.deepEqual(c.build, { action: "build", label: "Build", icon: "build", primary: true, disabled: true });
  c = controls({ ...idle, items: [1] }, true, true);
  assert.equal(c.play?.label, "Play test");
  assert.equal(c.build.disabled, false);
  c = controls({ ...idle, items: [1], playing: true }, true, true);
  assert.equal(c.play?.label, "Stop test");
  assert.equal(c.play?.pressed, true);
  assert.equal(c.build.disabled, true);
  assert.equal(c.build.title, "Stop the play test, then build");
  assert.equal(controls({ ...idle, items: [1] }, false, true).play, null); // Blender: no play test
  c = controls({ ...idle, running: true }, true, false);
  assert.equal(c.play?.label, "Pause");
  assert.equal(c.play?.icon, "pause");
  assert.equal(c.build.label, "Stop");
  assert.equal(c.build.icon, "stop");
  c = controls({ ...idle, running: true, paused: true }, true, false);
  assert.equal(c.play?.disabled, true);
  c = controls({ ...idle, paused: true }, true, false);
  assert.equal(c.play?.label, "Continue");
  assert.equal(c.play?.primary, true);
  assert.equal(c.build.label, "End run");
  assert.equal(c.build.primary, false);
});

test("composer texts and icon states follow the run", () => {
  const base = { running: false, playing: false, items: [] as unknown[], looking: false, paused: false, finished: false, current: 0, plan: [] as unknown[] };
  assert.equal(placeholder(base, "roblox"), "Describe what to build or change…");
  assert.equal(placeholder({ ...base, running: true }, "roblox"), "Keplar is working. You can pause or stop.");
  assert.equal(placeholder({ ...base, playing: true }, "roblox"), "Play-testing. Note what to change, then stop the test and build.");
  assert.equal(placeholder({ ...base, items: [1] }, "blender"), "Change something or add to it…");
  assert.equal(runState({ ...base, running: true, current: 3, plan: [1, 2, 3, 4] }, "roblox"), "Step 3 of 4");
  assert.equal(runState({ ...base, running: true }, "roblox"), "Planning");
  assert.equal(runState({ ...base, running: true, looking: true }, "blender"), "Reading the scene");
  assert.equal(runState({ ...base, paused: true }, "roblox"), "Paused");
  assert.equal(runState({ ...base, running: true, pending: 1 }, "roblox"), "Waiting for approval");
  assert.equal(sendIcon({ running: true, finished: false, paused: false }), "working");
  assert.equal(sendIcon({ running: false, finished: true, paused: false }), "complete");
  assert.equal(sendIcon({ running: false, finished: false, paused: false }), "send");
});

test("inline code, upload lists and ideas", () => {
  assert.equal(inlineCode({ name: "execute_luau", args: { code: "print(1)" } }), "print(1)");
  assert.equal(inlineCode({ name: "python", args: { code: "x=1" } }), "x=1");
  assert.equal(inlineCode({ name: "multi_edit", args: { code: "x" } }), null);
  assert.deepEqual(uploadUrls({ name: "upload_image", args: { imagePaths: ["https://a/b.png", 3] } }), ["https://a/b.png"]);
  assert.equal(IDEAS.roblox.length, 4);
  assert.equal(IDEAS.blender.length, 4);
});

test("drafts fill the composer once per environment", () => {
  let calls = 0;
  const off = subscribeDrafts(() => calls++);
  offerDraft("roblox", "A lava obby");
  const d = peekDraft("roblox");
  assert.equal(d?.text, "A lava obby");
  assert.equal(peekDraft("blender"), null);
  offerDraft("roblox", "newer");
  takeDraft("roblox", d!.id); // a stale take leaves the newer draft
  assert.equal(peekDraft("roblox")?.text, "newer");
  takeDraft("roblox", peekDraft("roblox")!.id);
  assert.equal(peekDraft("roblox"), null);
  off();
  assert.equal(calls, 2);
});

test("conversation sources keep the approval safety rules and test-facing labels", () => {
  const conv = readFileSync("src/components/app-ui/studio-mode/workspace/Conversation.tsx", "utf8");
  const comp = readFileSync("src/components/app-ui/studio-mode/workspace/Composer.tsx", "utf8");
  // Enter never approves a destructive step.
  assert.match(conv, /if \(destructive && e\.key === "Enter"\) e\.preventDefault\(\)/);
  assert.match(conv, /"Approve this change" : "Approve"/);
  assert.match(conv, /aria-label="Ideas to start from"/);
  assert.match(conv, /aria-live="polite"/);
  assert.match(comp, /aria-label=\{`Remove reference \$\{i \+ 1\}`\}/);
  assert.match(comp, /accept="image\/\*,video\/\*" multiple/);
  assert.match(comp, /void a\.playTest\(!a\.playing\)/);
  // No fake streaming or timers in the conversation.
  assert.doesNotMatch(conv + comp, /setInterval|typewriter/);
  // Design-system only: no ad-hoc colours, glass or gradients in the module.
  const css = readFileSync("src/components/app-ui/studio-mode/workspace/conversation.module.css", "utf8");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|gradient|blur\(|backdrop/i);
});
