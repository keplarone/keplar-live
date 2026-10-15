import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEdits, buildRevert, deriveDocuments, editOutcome, isRevertLineage, multiEditSchema, parseMultiEdit, parseScriptRead, retryAvailability, retryAvailabilityFor, revertAvailability } from "../src/components/app-ui/studio-mode/code/documents";
import { actionPhases, appendEvent, describeEvent, eventStamper, MAX_EVENTS, type StudioEvent, type StudioEventBody } from "../src/components/app-ui/studio-mode/code/events";
import { diffLines } from "../src/components/app-ui/studio-mode/code/line-diff";

/** A log built the way useStudioAgent builds it: stamped, in order, with the turn number. */
function log(bodies: (StudioEventBody | { turn: number })[]): StudioEvent[] {
  let t = 1000;
  const s = eventStamper(() => (t += 10));
  let turn = 0;
  const out: StudioEvent[] = [];
  for (const b of bodies) {
    if ("turn" in b && !("kind" in b)) { turn = b.turn; continue; }
    out.push(s.stamp(b as StudioEventBody, turn));
  }
  return out;
}

const SRC = `local Players = game:GetService("Players")\n\nlocal function onJoin(player)\n\tprint("hi", player.Name)\nend\n\nPlayers.PlayerAdded:Connect(onJoin)\n`;
const EDIT_ARGS = { studio_id: "s1", file_path: "ServerScriptService.Welcome", edits: [{ old_string: `print("hi", player.Name)`, new_string: `print("Welcome,", player.DisplayName)\n\tplayer:SetAttribute("Joined", os.time())` }] };
const AFTER = SRC.replace(`print("hi", player.Name)`, `print("Welcome,", player.DisplayName)\n\tplayer:SetAttribute("Joined", os.time())`);

/** The full sequence the hook emits for an approved multi_edit, with the page's reads around it. */
function editRun(opts: { afterSource?: string; beforeComplete?: boolean } = {}): StudioEvent[] {
  return log([
    { turn: 1 },
    { kind: "request.sent", surface: "studio", mode: "medium", messages: 3 },
    { kind: "reply.received", latencyMs: 4200, units: 140, usage: { model: "anthropic/claude-opus-5.5", provider: "Anthropic", promptTokens: 9000, cachedTokens: 8000, completionTokens: 300, reasoningTokens: 120, latencyMs: 4000 }, mode: "medium", actions: 2, blocked: 0, done: false, text: "Editing the welcome script." },
    { kind: "action.proposed", action: "a1", callId: "c1", name: "multi_edit", args: EDIT_ARGS, risk: "change", title: "Edit ServerScriptService.Welcome", origin: "model", of: null },
    { kind: "approval.requested", action: "a1" },
    { kind: "script.read", path: "ServerScriptService.Welcome", purpose: "preview", action: "a1", ok: true, source: SRC, complete: true, format: "plain" },
    { kind: "approval.granted", action: "a1", by: "person" },
    { kind: "script.read", path: "ServerScriptService.Welcome", purpose: "before", action: "a1", ok: true, source: SRC, complete: opts.beforeComplete ?? true, format: "plain" },
    { kind: "action.running", action: "a1", name: "multi_edit" },
    { kind: "action.done", action: "a1", name: "multi_edit", ms: 80, result: "Edited 1 place.", image: false },
    { kind: "script.read", path: "ServerScriptService.Welcome", purpose: "after", action: "a1", ok: true, source: opts.afterSource ?? AFTER, complete: true, format: "plain" },
    { kind: "edit.applied", action: "a1", path: "ServerScriptService.Welcome", outcome: (opts.afterSource ?? AFTER) === AFTER ? "applied" : "differs" },
  ]);
}

test("applyEdits: exact single match, replace_all, ambiguity and not-found are reported like an exact-match editor", () => {
  assert.deepEqual(applyEdits("a b a", [{ old_string: "b", new_string: "c" }]), { ok: true, content: "a c a" });
  assert.deepEqual(applyEdits("a b a", [{ old_string: "a", new_string: "x", replace_all: true }]), { ok: true, content: "x b x" });
  const amb = applyEdits("a b a", [{ old_string: "a", new_string: "x" }]);
  assert.equal(amb.ok, false);
  assert.match(!amb.ok ? amb.error : "", /matches 2 times/);
  const nf = applyEdits("abc", [{ old_string: "q", new_string: "x" }]);
  assert.match(!nf.ok ? nf.error : "", /Edit 1: old_string was not found/);
  // Sequential: the second edit sees the first one's result.
  assert.deepEqual(applyEdits("one", [{ old_string: "one", new_string: "two" }, { old_string: "two", new_string: "three" }]), { ok: true, content: "three" });
  // "$&" in new_string is literal text, not a replacement pattern.
  assert.deepEqual(applyEdits("x", [{ old_string: "x", new_string: "$&$&" }]), { ok: true, content: "$&$&" });
  assert.deepEqual(applyEdits("", [{ old_string: "", new_string: "print(1)" }]), { ok: true, content: "print(1)" });
  assert.equal(applyEdits("x", [{ old_string: "", new_string: "y" }]).ok, false);
});

test("parseMultiEdit: only the known shape; anything else is left for the raw view", () => {
  assert.deepEqual(parseMultiEdit(EDIT_ARGS), { path: "ServerScriptService.Welcome", studioId: "s1", edits: EDIT_ARGS.edits });
  assert.equal(parseMultiEdit({ path: "X", edits: [] }), null);
  assert.equal(parseMultiEdit({ file_path: "X", edits: [{ old: "a", new: "b" }] }), null);
  assert.equal(parseMultiEdit({ file_path: "X", edits: [{ old_string: "a", new_string: "b", replace_all: "yes" }] }), null);
  assert.equal(multiEditSchema([]), "absent");
  assert.equal(multiEditSchema([{ name: "multi_edit", inputSchema: { properties: { file_path: {}, edits: { items: { properties: { old_string: {}, new_string: {} } } } } } }]), "matches");
  assert.equal(multiEditSchema([{ name: "multi_edit", inputSchema: { properties: { script: {}, changes: {} } } }]), "differs");
});

test("parseScriptRead: plain, numbered (consecutive, from 1 = complete), JSON, truncation markers", () => {
  assert.deepEqual(parseScriptRead("print(1)\nprint(2)\n"), { source: "print(1)\nprint(2)\n", complete: true, format: "plain" });
  assert.deepEqual(parseScriptRead("     1\tlocal a = 1\n     2\t\n     3\treturn a"), { source: "local a = 1\n\nreturn a", complete: true, format: "numbered" });
  assert.deepEqual(parseScriptRead("1→x\n2→y"), { source: "x\ny", complete: true, format: "numbered" });
  // Starting at line 40: only part of the script.
  assert.equal(parseScriptRead("40: a\n41: b").complete, false);
  // Not consecutive: plain source that happens to start with numbers.
  assert.equal(parseScriptRead("1: a\n3: b").format, "plain");
  // One line with an ambiguous separator stays plain ("10: 20" could be code-ish text).
  assert.equal(parseScriptRead("10: 20").format, "plain");
  assert.deepEqual(parseScriptRead(JSON.stringify({ source: "return 1", truncated: false })), { source: "return 1", complete: true, format: "json" });
  assert.equal(parseScriptRead(JSON.stringify({ content: "x", truncated: true })).complete, false);
  const cut = parseScriptRead("a\nb\n... (truncated, 300 more lines)");
  assert.deepEqual([cut.source, cut.complete], ["a\nb", false]);
});

test("editOutcome: confirmed only when the re-read equals the proposal (CRLF and a final newline do not count)", () => {
  assert.equal(editOutcome("a\nb", { source: "a\r\nb\n", complete: true, format: "plain" }), "applied");
  assert.equal(editOutcome("a\nb", { source: "a\nc", complete: true, format: "plain" }), "differs");
  assert.equal(editOutcome(null, { source: "a", complete: true, format: "plain" }), "unconfirmed");
  assert.equal(editOutcome("a", null), "unconfirmed");
});

test("diffLines: counts, changed ranges in the new text, pure deletions", () => {
  const d = diffLines(SRC, AFTER);
  assert.equal(d.added, 2);
  assert.equal(d.removed, 1);
  assert.deepEqual(d.changed, [{ from: 4, to: 5 }]);
  const del = diffLines("a\nb\nc", "a\nc");
  assert.deepEqual([del.added, del.removed, del.changed, del.deletedAt], [0, 1, [], [2]]);
  assert.deepEqual(diffLines("same", "same").ops, [{ op: "equal", a: 1, b: 1, count: 1 }]);
  // Large middles fall back to "all replaced" with exact counts.
  const big = Array.from({ length: 3000 }, (_, i) => `l${i}`).join("\n");
  const big2 = Array.from({ length: 3000 }, (_, i) => `m${i}`).join("\n");
  const r = diffLines(big, big2);
  assert.deepEqual([r.added, r.removed], [3000, 3000]);
});

test("documents: a multi_edit goes proposed -> applying -> applied, with the true before, the proposal and the confirmed content", () => {
  const ev = editRun();
  // While waiting for approval (preview read done): proposed, with the proposal and the changed lines highlighted.
  const waiting = deriveDocuments(ev.slice(0, 5));
  const wd = waiting.documents[0]!;
  assert.equal(wd.id, "script:ServerScriptService.Welcome");
  assert.deepEqual(wd.crumbs, ["ServerScriptService", "Welcome"]);
  assert.equal(wd.language, "luau");
  assert.equal(wd.status, "proposed");
  assert.equal(wd.changes[0]!.awaitingApproval, true);
  assert.equal(wd.changes[0]!.beforeFrom, "preview");
  assert.equal(wd.content, AFTER);
  assert.deepEqual(wd.activeLines, [{ from: 4, to: 5 }]);
  assert.equal(waiting.activeId, wd.id);

  // Running: applying (still the proposal on screen).
  const running = deriveDocuments(ev.slice(0, 8)).documents[0]!;
  assert.equal(running.status, "applying");
  assert.equal(running.changes[0]!.beforeFrom, "before");

  // After the confirming read.
  const done = deriveDocuments(ev);
  const d = done.documents[0]!;
  const c = d.changes[0]!;
  assert.equal(d.status, "applied");
  assert.equal(c.before, SRC);
  assert.equal(c.after, AFTER);
  assert.equal(c.applied, AFTER);
  assert.deepEqual([c.added, c.removed], [2, 1]);
  assert.equal(d.content, AFTER);
  assert.deepEqual(d.activeLines, []);
  assert.equal(c.revert.ok, true);
  assert.equal(c.retry.ok, false);
  // Versions record which action produced each content.
  assert.deepEqual(d.versions.map((v) => [v.label, v.action, v.actionName]), [["before", "a1", "multi_edit"], ["proposed", "a1", "multi_edit"], ["before", "a1", "multi_edit"], ["proposed", "a1", "multi_edit"], ["applied", "a1", "multi_edit"]]);
  assert.ok(d.diagnostics.some((x) => x.severity === "info" && x.message === "Edited 1 place."));
  // The changes list.
  assert.deepEqual(done.changes.map((x) => [x.kind, x.target, x.status, x.added, x.removed]), [["script", "ServerScriptService.Welcome", "applied", 2, 1]]);
});

test("revert eligibility: busy, differs, partial before, later edits, already reverted", () => {
  assert.equal(deriveDocuments(editRun(), { busy: true }).documents[0]!.changes[0]!.revert.reason, "Wait for the current run to finish.");
  assert.match(deriveDocuments(editRun({ afterSource: "something else" })).documents[0]!.changes[0]!.revert.reason, /did not match/);
  assert.match(deriveDocuments(editRun({ beforeComplete: false })).documents[0]!.changes[0]!.revert.reason, /full content right before/);

  // The script was read later and no longer matches what this edit left.
  const changedSince = [...editRun(), ...log([{ turn: 2 }, { kind: "script.read", path: "ServerScriptService.Welcome", purpose: "model", action: "a9", ok: true, source: "-- someone else edited\n", complete: true, format: "plain" }])];
  assert.match(deriveDocuments(changedSince).documents[0]!.changes[0]!.revert.reason, /changed since/);

  // Revert built from the change: whole content as left -> exact before-content, same studio, always a change at least.
  const c = deriveDocuments(editRun()).documents[0]!.changes[0]!;
  const r = buildRevert(c)!;
  assert.deepEqual(r, { name: "multi_edit", risk: "change", args: { studio_id: "s1", file_path: "ServerScriptService.Welcome", edits: [{ old_string: AFTER, new_string: SRC }] } });
  // Applying the revert to the applied content gives back the exact before-content.
  assert.deepEqual(applyEdits(AFTER, r.args.edits as { old_string: string; new_string: string }[]), { ok: true, content: SRC });
  // Reverting to an empty script is destructive (the server's own rule for new_string "").
  assert.equal(buildRevert({ ...c, before: "" })!.risk, "destructive");
  assert.equal(buildRevert({ ...c, risk: "destructive" })!.risk, "destructive");

  // After the revert itself is applied: the original says "Already reverted"; the revert is revertable.
  const base = editRun();
  let t = base[base.length - 1]!.at;
  const s = eventStamper(() => (t += 10));
  const more: StudioEvent[] = ([
    { kind: "action.proposed", action: "r1", callId: null, name: "multi_edit", args: r.args, risk: "change", title: "Edit ServerScriptService.Welcome", origin: "revert", of: "a1" },
    { kind: "approval.requested", action: "r1" },
    { kind: "script.read", path: "ServerScriptService.Welcome", purpose: "preview", action: "r1", ok: true, source: AFTER, complete: true, format: "plain" },
  ] as StudioEventBody[]).map((b) => s.stamp(b, 2));
  const pending = deriveDocuments([...base, ...more]).documents[0]!;
  assert.equal(pending.changes[0]!.revert.reason, "A revert is already pending.");
  assert.equal(pending.changes[1]!.origin, "revert");
  assert.equal(pending.changes[1]!.after, SRC);
  const finished = ([
    { kind: "approval.granted", action: "r1", by: "person" },
    { kind: "script.read", path: "ServerScriptService.Welcome", purpose: "before", action: "r1", ok: true, source: AFTER, complete: true, format: "plain" },
    { kind: "action.running", action: "r1", name: "multi_edit" },
    { kind: "action.done", action: "r1", name: "multi_edit", ms: 50, result: "ok", image: false },
    { kind: "script.read", path: "ServerScriptService.Welcome", purpose: "after", action: "r1", ok: true, source: SRC, complete: true, format: "plain" },
    { kind: "edit.applied", action: "r1", path: "ServerScriptService.Welcome", outcome: "applied" },
  ] as StudioEventBody[]).map((b) => s.stamp(b, 2));
  const after = deriveDocuments([...base, ...more, ...finished]).documents[0]!;
  assert.equal(after.changes[0]!.revert.reason, "Already reverted.");
  assert.equal(after.changes[1]!.revert.ok, true);
  assert.equal(after.content, SRC);
});

test("documents: execute_luau and Blender python become numbered command documents; failures become diagnostics", () => {
  const ev = log([
    { turn: 1 },
    { kind: "action.proposed", action: "x1", callId: "c1", name: "execute_luau", args: { code: "local p = Instance.new('Part')\np.Parent = workspace" }, risk: "change", title: "Run Luau in Studio", origin: "model", of: null },
    { kind: "approval.granted", action: "x1", by: "auto-approve" },
    { kind: "action.running", action: "x1", name: "execute_luau" },
    { kind: "action.proposed", action: "x2", callId: "c2", name: "execute_luau", args: { code: "error('boom')" }, risk: "change", title: "Run Luau in Studio", origin: "model", of: null },
  ]);
  const mid = deriveDocuments(ev);
  assert.deepEqual(mid.documents.map((d) => [d.path, d.kind, d.language, d.status]), [["Command 1 · execute_luau", "command", "luau", "applying"], ["Command 2 · execute_luau", "command", "luau", "proposed"]]);
  assert.deepEqual(mid.documents[0]!.activeLines, [{ from: 1, to: 2 }]);
  assert.equal(mid.activeId, "cmd:x2");
  const end = deriveDocuments([...ev, ...log([{ kind: "action.done", action: "x1", name: "execute_luau", ms: 30, result: "", image: false }, { kind: "action.running", action: "x2", name: "execute_luau" }, { kind: "action.failed", action: "x2", name: "execute_luau", ms: 5, error: "boom at line 1" }])]);
  const [d1, d2] = end.documents;
  assert.equal(d1!.status, "applied");
  assert.equal(d2!.status, "failed");
  assert.deepEqual(d2!.diagnostics.map((x) => [x.severity, x.message]), [["error", "boom at line 1"]]);
  const e2 = end.changes.find((x) => x.id === "x2")!;
  assert.equal(e2.retry.ok, true);
  assert.equal(e2.revert.ok, false);

  const py = deriveDocuments(log([{ kind: "action.proposed", action: "p1", callId: "c", name: "python", args: { code: "import bpy" }, risk: "change", title: "Run Python in Blender", origin: "model", of: null }]), { surface: "blender" });
  assert.deepEqual([py.documents[0]!.language, py.documents[0]!.crumbs[0]], ["python", "Blender"]);
});

test("documents: unknown multi_edit shapes show the raw arguments; other changes are listed as objects", () => {
  const m = deriveDocuments(log([
    { kind: "action.proposed", action: "u1", callId: "c", name: "multi_edit", args: { script: "X", patch: "@@" }, risk: "change", title: "Edit a script", origin: "model", of: null },
    { kind: "action.proposed", action: "i1", callId: "c2", name: "insert_asset", args: { assetName: "Tree" }, risk: "change", title: "Insert Tree", origin: "model", of: null },
    { kind: "action.proposed", action: "s1", callId: "c3", name: "script_read", args: { target_file: "A" }, risk: "read", title: "Read A", origin: "model", of: null },
  ]));
  assert.equal(m.documents.length, 1);
  assert.equal(m.documents[0]!.kind, "raw");
  assert.equal(m.documents[0]!.language, "json");
  assert.deepEqual(JSON.parse(m.documents[0]!.content), { script: "X", patch: "@@" });
  assert.match(m.documents[0]!.note ?? "", /shown exactly as sent/);
  // Reads are not changes.
  assert.deepEqual(m.changes.map((c) => [c.id, c.kind]), [["u1", "object"], ["i1", "object"]]);
});

test("model script_read results become read-only documents with the real source", () => {
  const m = deriveDocuments(log([{ turn: 1 }, { kind: "script.read", path: "ReplicatedStorage/Config", purpose: "model", action: "k1", ok: true, source: "return { speed = 16 }", complete: true, format: "plain" }]));
  assert.deepEqual([m.documents[0]!.status, m.documents[0]!.content, m.documents[0]!.title], ["read", "return { speed = 16 }", "Config"]);
  const failed = deriveDocuments(log([{ kind: "script.read", path: "A", purpose: "before", action: "k", ok: false, error: "not found" }]));
  assert.equal(failed.documents[0]!.diagnostics[0]!.severity, "warning");
});

test("events: stamping, bounded append, phases and labels carry only real facts", () => {
  const s = eventStamper(() => 5);
  const e1 = s.stamp({ kind: "run.resumed" }, 3);
  assert.deepEqual(e1, { kind: "run.resumed", id: 1, at: 5, turn: 3 });
  let l: StudioEvent[] = [];
  for (let i = 0; i < MAX_EVENTS + 5; i++) l = appendEvent(l, s.stamp({ kind: "run.resumed" }, 0));
  assert.equal(l.length, MAX_EVENTS);
  assert.equal(l[0]!.id, 7);
  const ev = editRun();
  assert.equal(actionPhases(ev).get("a1"), "done");
  const reply = describeEvent(ev.find((e) => e.kind === "reply.received")!);
  assert.equal(reply.detail, "4.2 s · 140 credits · 9,000 in (8,000 cached) · 300 out · 2 actions");
  assert.equal(describeEvent(ev.find((e) => e.kind === "edit.applied")!).label, "Edit confirmed");
  assert.equal(retryAvailability("failed", false).ok, true);
  assert.equal(retryAvailability("done", false).ok, false);
});

test("useStudioAgent: events map to the real moments in the run loop; no invented streaming", () => {
  const src = readFileSync("src/components/app-ui/studio-mode/useStudioAgent.ts", "utf8");
  // Request / reply around the real fetch.
  assert.match(src, /emit\(\{ kind: "request\.sent"[\s\S]{0,200}const res = await fetch\(blender \? "\/api\/blender\/agent" : "\/api\/studio\/agent"/);
  assert.match(src, /const latencyMs = Date\.now\(\) - t0;/);
  // Approval: registered before the preview read, granted by the person or auto-approve, declined by person or stop.
  assert.match(src, /new Promise<boolean>\(\(resolve\) => decisions\.current\.set\(k, resolve\)\);\s*emit\(\{ kind: "approval\.requested"/);
  assert.match(src, /by: flags\.current\.stop \? "stop" : "person"/);
  assert.match(src, /emit\(\{ kind: "approval\.granted", action: k, by: "auto-approve" \}\)/);
  // Reverts always ask; destructive always asks; Blender Python always asks; changes ask unless auto-approve (blender/agent.ts#needsApproval).
  assert.match(src, /const needsYes = needsApproval\(a, \{ revert: origin === "revert", auto: flags\.current\.auto, blender \}\);/);
  // A retry of a revert keeps the revert's rule; a second click cannot start a second page action.
  assert.match(src, /const ask = isRevertLineage\(eventsRef\.current, actionKey\);/);
  assert.match(src, /if \(!bridge \|\| running \|\| pageBusy\.current\) return \{ outcome: "skipped" \};\s*pageBusy\.current = true;/);
  // Blender's scene summary count ("12 objects:") is read with a real digit class.
  assert.match(src, /\/\(\\d\+\) objects:\//);
  // The page's own reads around an edit.
  assert.match(src, /await readScript\(edit\.path, "before", k, studioId\)/);
  assert.match(src, /await readScript\(edit\.path, "after", k, studioId\)/);
  // No fake streaming or timers that simulate progress.
  assert.doesNotMatch(src, /setInterval|typewriter|stream/i);
  // Existing behaviour kept (other tests pin more of it).
  assert.match(src, /The person skipped this step\. Do not retry it unchanged; ask or try another approach\./);
});

test("retry: offered once per failure; a retry of a revert is still a revert (always asks)", () => {
  const fail = (k: string, origin: "model" | "revert" | "retry", of: string | null): StudioEventBody[] => [
    { kind: "action.proposed", action: k, callId: null, name: "multi_edit", args: EDIT_ARGS, risk: "change", title: "Edit", origin, of },
    { kind: "action.running", action: k, name: "multi_edit" },
    { kind: "action.failed", action: k, name: "multi_edit", ms: 3, error: "old_string was not found" },
  ];
  const ev = log([{ turn: 1 }, ...fail("r1", "revert", "a0")]);
  assert.equal(retryAvailabilityFor(ev, "r1", false).ok, true);
  assert.equal(isRevertLineage(ev, "r1"), true);
  // Retrying it: the original no longer offers Retry; the retry is still in the revert's lineage.
  const ev2 = [...ev, ...log([{ turn: 1 }, ...fail("t1", "retry", "r1")])];
  assert.equal(retryAvailabilityFor(ev2, "r1", false).reason, "Already retried.");
  assert.equal(retryAvailabilityFor(ev2, "t1", false).ok, true);
  assert.equal(isRevertLineage(ev2, "t1"), true);
  // A declined retry gives the Retry back to the original.
  const declined = [...ev, ...log([{ turn: 1 }, { kind: "action.proposed", action: "t2", callId: null, name: "multi_edit", args: EDIT_ARGS, risk: "change", title: "Edit", origin: "retry", of: "r1" }, { kind: "approval.declined", action: "t2", by: "person" }])];
  assert.equal(retryAvailabilityFor(declined, "r1", false).ok, true);
  // A model action's retry is not a revert.
  assert.equal(isRevertLineage(log([...fail("m1", "model", null), ...fail("m2", "retry", "m1")]), "m2"), false);
  assert.equal(deriveDocuments(ev2).changes.find((x) => x.id === "r1")!.retry.reason, "Already retried.");
});

test("revert eligibility: a later edit counts as later even when it shares the millisecond", () => {
  const c = deriveDocuments(editRun()).documents[0]!.changes[0]!;
  const later = { ...c, id: "a2", action: "a2", at: c.at, status: "applied" as const, of: null };
  assert.match(revertAvailability(c, [c, later], null, false).reason, /later change/);
  // An earlier change with the same timestamp does not block it.
  assert.equal(revertAvailability(c, [later, c], c.applied, false).ok, true);
});
