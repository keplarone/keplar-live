import "./setup";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { jsonReq, signIn } from "./helpers/session";
import { usedThisMonth } from "../src/lib/create/platform/compute";
import { workspaceById } from "../src/lib/create/platform/workspace";
import { checkLuau, LUAU_SHA256, MAX_CHECK_BYTES, stopLuauChecker } from "../src/lib/roblox-cloud/luau-check";
import { applyLuau, indexLuau, luauLongString, readLuau, sourcesLuau } from "../src/lib/roblox-cloud/studio-luau";
import { runCloudTool, type ToolState } from "../src/lib/roblox-cloud/tools";
import { addScripts, changes, control, createDraft, markApplied } from "../src/lib/roblox-cloud/api";
import { compact, resumeStale, runSlice, startJob, triggerNext, workerBase } from "../src/lib/roblox-cloud/worker";
import { jobs, type CloudFile } from "../src/lib/roblox-cloud/model";
import { ROBLOX_CLOUD_PROFILE } from "../src/lib/roblox-cloud/prompt";
import { applyChanges, parseJson, startCloudJob, takeSnapshot, type Change } from "../src/lib/roblox-cloud/client";
import { USER_COLLECTIONS } from "../src/lib/privacy/account-data";
import { site } from "../src/lib/site";

after(() => stopLuauChecker());

/* ── the checker ─────────────────────────────────────────────────────────── */

test("the vendored Luau analyzer is the official 0.742 release, unmodified, with its MIT license", () => {
  assert.equal(createHash("sha256").update(readFileSync("vendor/luau/Luau.Web.js")).digest("hex"), LUAU_SHA256);
  assert.match(readFileSync("vendor/luau/LICENSE.txt", "utf8"), /MIT License[\s\S]*Roblox Corporation/);
});

test("Luau check: real syntax and type errors with the script's own line numbers; Roblox globals are known; big scripts say why they are skipped", async () => {
  assert.deepEqual(await checkLuau(`--!strict\nlocal Players = game:GetService("Players")\nlocal function add(n: number): number\n  return n + 1\nend\nPlayers.PlayerAdded:Connect(function(p) print(\`hi {p.Name}\`) end)\ntask.wait(1)\nreturn add`), { checked: true, problems: [] });
  const syntax = await checkLuau(`local function f()\n  if true then\n    print("x")\nend`);
  assert.ok(syntax.checked);
  assert.equal(syntax.problems[0]!.kind, "syntax");
  assert.equal(syntax.problems[0]!.line, 4);
  assert.match(syntax.problems[0]!.message, /'function' at line 1.*'then' at line 2/);
  const typo = await checkLuau("local x = 1\nprnt(x)");
  assert.ok(typo.checked && typo.problems.some((p) => p.line === 2 && /Unknown global 'prnt'/.test(p.message)));
  const strict = await checkLuau(`--!strict\nlocal x: number = "a"\nreturn x`);
  assert.ok(strict.checked && strict.problems[0]!.line === 2 && strict.problems[0]!.kind === "type");
  const big = await checkLuau("local M = {}\n" + "M.x = 1\n".repeat(MAX_CHECK_BYTES / 6));
  assert.equal(big.checked, false);
  assert.ok(await checkLuau("return 1").then((r) => r.checked), "still works after the skipped script");
});

test("every piece of Luau the Studio page runs is valid Luau", async () => {
  const pieces = [indexLuau(), sourcesLuau(1, 50), readLuau("ServerScriptService/Main"),
    applyLuau({ path: "ServerScriptService/Main", status: "changed", className: "Script", next: "print('hi')" }),
    applyLuau({ path: "ReplicatedStorage/Pets/PetConfig", status: "created", className: "ModuleScript", next: "return {}" }),
    applyLuau({ path: "ServerScriptService/Old", status: "created", className: "Script", runContext: "Server", next: "print(1)" }),
    applyLuau({ path: "ServerScriptService/Old#2", status: "deleted", className: "Script", next: null })];
  for (const code of pieces) {
    const r = await checkLuau(code);
    assert.ok(r.checked, "checked");
    assert.deepEqual(r.problems.filter((p) => p.kind === "syntax"), [], code.slice(-200));
  }
  for (const text of ["plain", "has ]] and ]=] inside", "ends with ]", "line\nbreaks\n"]) {
    const lit = luauLongString(text);
    const r = await checkLuau(`local s = ${lit}\nreturn s`);
    assert.ok(r.checked && r.problems.length === 0, lit);
    const close = lit.match(/\](=*)\]$/)![1];
    assert.ok(!text.includes(`]${close}]`), "the closing bracket never appears in the text");
  }
});

/* ── the tools ───────────────────────────────────────────────────────────── */

function state(sources: Record<string, string>): ToolState {
  const files = new Map<string, CloudFile>(Object.entries(sources).map(([path, base], i) => [path, { id: `f${i}`, workspaceId: "ws", jobId: "j", path, className: "ModuleScript", base, baseHash: "h" } as CloudFile]));
  return { files, tree: "ServerScriptService\n  Shop [Script]", jobId: "j", workspaceId: "ws", dirty: new Set() };
}

test("tools: read ranges, search, exact single edits with an immediate check, create, delete and plan", async () => {
  const st = state({ "ServerScriptService/Shop": "local price = 10\nlocal function buy()\n  print(price)\nend\nreturn buy", "ReplicatedStorage/Util": "return {}" });
  assert.match((await runCloudTool(st, "list_scripts", {})).text, /2 scripts/);
  assert.match((await runCloudTool(st, "read_script", { path: "ServerScriptService/Shop", from: 2, to: 3 })).text, /lines 2-3 of 5 \(more below: read from 4\)\n {3}2 {2}local function buy\(\)\n {3}3 {4}print\(price\)/);
  assert.match((await runCloudTool(st, "search_scripts", { query: "price" })).text, /2 matches:\nServerScriptService\/Shop:1: local price = 10/);
  assert.match((await runCloudTool(st, "read_script", { path: "ServerScriptService/Shopp" })).text, /Did you mean: ServerScriptService\/Shop/);

  assert.match((await runCloudTool(st, "edit_script", { path: "ServerScriptService/Shop", old_string: "price", new_string: "cost" })).text, /matches 2 times/);
  assert.match((await runCloudTool(st, "edit_script", { path: "ServerScriptService/Shop", old_string: "nope", new_string: "x" })).text, /not found/);
  const broken = await runCloudTool(st, "edit_script", { path: "ServerScriptService/Shop", old_string: "end\nreturn buy", new_string: "return buy" });
  assert.equal(broken.effects.edited, "ServerScriptService/Shop");
  assert.match(broken.text, /1 problem[\s\S]*syntax/, "the check result comes back with the edit");
  await runCloudTool(st, "edit_script", { path: "ServerScriptService/Shop", old_string: "return buy", new_string: "end\nreturn buy" });
  assert.equal(st.files.get("ServerScriptService/Shop")!.next, undefined, "back to the original = unchanged");

  const made = await runCloudTool(st, "create_script", { path: "ServerScriptService/Pets/PetService", class_name: "ModuleScript", source: "local M = {}\nreturn M" });
  assert.match(made.text, /Created[\s\S]*no problems/);
  assert.match((await runCloudTool(st, "create_script", { path: "bad path", class_name: "Script", source: "" })).text, /not a valid path/);
  assert.match((await runCloudTool(st, "delete_script", { path: "ReplicatedStorage/Util", reason: "unused" })).text, /Marked .* for deletion/);
  assert.equal(st.files.get("ReplicatedStorage/Util")!.next, null);
  assert.match((await runCloudTool(st, "check_scripts", {})).text, /PetService: no problems/);
  const plan = await runCloudTool(st, "update_plan", { steps: [{ title: "Fix shop", status: "done" }, { title: "Pets", status: "doing" }, { title: "", status: "x" }] });
  assert.deepEqual(plan.effects.plan, [{ title: "Fix shop", status: "done" }, { title: "Pets", status: "doing" }]);
  assert.equal((await runCloudTool(st, "http_get", {})).text, "http_get is not a Roblox Cloud tool.");
});

/* ── the whole job, with a scripted Opus 5.5 ─────────────────────────────── */

type Call = { name: string; args: Record<string, unknown> };
/** A fake OpenRouter that answers each turn with the next scripted list of tool calls, as Opus 5.5, and records what it was sent. */
function scriptedModel(turns: Call[][], opts: { model?: string; usd?: number } = {}) {
  const seen: Record<string, unknown>[] = [];
  let i = 0;
  const f = (async (_u: string, init: RequestInit) => {
    seen.push(JSON.parse(String(init.body)));
    const calls = turns[Math.min(i, turns.length - 1)]!;
    i++;
    return new Response(JSON.stringify({
      model: opts.model ?? "anthropic/claude-opus-5.5", provider: "Anthropic",
      choices: [{ finish_reason: calls.length ? "tool_calls" : "stop", message: { content: `Turn ${i}.`, tool_calls: calls.map((c, k) => ({ id: `t${i}_${k}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) } }],
      usage: { prompt_tokens: 12_000, completion_tokens: 800, cost: opts.usd ?? 0.02, prompt_tokens_details: { cached_tokens: 9_000 } },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, seen, turns: () => i };
}

const SHOP = "local Remotes = game.ReplicatedStorage.Remotes\nRemotes.Buy.OnServerEvent:Connect(function(player, item)\n  wait(1)\n  print(player, item)\nend)";

async function draft(label: string, extra: Record<string, unknown> = {}) {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const u = await signIn(`${label}@example.com`, "plus");
  const ws = (await workspaceById(u.workspaceId))!;
  const job = await createDraft(ws, { place: { id: "studio-1", name: "Pet Sim" }, goal: "Make the shop remote safe and modern.", mode: "until_done", maxUnits: 3000, maxMinutes: 60, tree: "ReplicatedStorage\n  Remotes [Folder]", ...extra });
  await addScripts(ws, job, [{ path: "ServerScriptService/Shop", className: "Script", source: SHOP }, { path: "ReplicatedStorage/Config", className: "ModuleScript", source: "return { Price = 10 }" }]);
  return { u, ws, job: (await jobs().get(ws.id, job.id))! };
}

test("an overnight job end to end: baseline, plan, edits checked by Luau, a report built from the snapshot, real cost charged, reviewable changes", async () => {
  const { ws, job } = await draft("cloud-e2e");
  const triggered: string[] = [];
  const started = await startJob(job, { trigger: async (j) => { triggered.push(j.id); } });
  assert.equal(started.status, "queued");
  assert.deepEqual(triggered, [job.id], "the first slice is started right away");
  assert.equal(started.baseline!.problems, 0);
  const opening = String((started.messages[0] as { content: string }).content);
  assert.match(opening, /Pet Sim \(2 scripts/);
  assert.match(opening, /Make the shop remote safe/);

  const model = scriptedModel([
    [{ name: "update_plan", args: { steps: [{ title: "Validate the Buy remote", status: "doing" }] } }, { name: "read_script", args: { path: "ServerScriptService/Shop" } }],
    [{ name: "edit_script", args: { path: "ServerScriptService/Shop", old_string: "function(player, item)\n  wait(1)", new_string: "function(player, item)\n  if typeof(item) ~= \"string\" then return end\n  task.wait(1)" } }],
    [{ name: "update_plan", args: { steps: [{ title: "Validate the Buy remote", status: "done" }] } }, { name: "finish", args: { summary: "The Buy remote now validates its input.", done: ["ServerScriptService/Shop: type check on item, task.wait"], unresolved: [], testing: ["Buy an item: it still works"] } }],
  ]);
  const before = await usedThisMonth(ws);
  const r = await runSlice(ws.id, job.id, { fetch: model.f, trigger: async () => { throw new Error("must not hand over: it finished"); } });
  assert.deepEqual(r, { status: "done", turns: 3 });

  const sent = model.seen[0] as { model: string; messages: { role: string; content: unknown }[]; tools: { function: { name: string } }[] };
  assert.equal(sent.model, "anthropic/claude-opus-5.5", "Opus 5.5 only");
  assert.match(JSON.stringify(sent.messages[0]), /working overnight on the person's game/);
  assert.deepEqual(sent.tools.map((t) => t.function.name).sort(), ["check_scripts", "create_script", "delete_script", "edit_script", "finish", "list_scripts", "read_script", "read_tree", "roblox_docs", "search_scripts", "update_plan"]);

  const done = (await jobs().get(ws.id, job.id))!;
  assert.equal(done.status, "done");
  assert.equal(done.usage.turns, 3);
  assert.equal(done.usage.cachedTokens, 27_000);
  assert.ok(done.usage.units > 0 && (await usedThisMonth(ws)) - before === done.usage.units, "each turn charged at its real cost");
  assert.deepEqual(done.plan, [{ title: "Validate the Buy remote", status: "done" }]);
  assert.deepEqual(done.report!.files, [{ path: "ServerScriptService/Shop", status: "changed", plus: 2, minus: 1 }]);
  assert.deepEqual(done.report!.checks, { before: 0, after: 0, unchecked: 0 });
  assert.equal(done.report!.summary, "The Buy remote now validates its input.");

  const list = await changes(ws, done);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.base, SHOP);
  assert.match(list[0]!.next!, /typeof\(item\) ~= "string"/);
  assert.deepEqual(await markApplied(ws, done, ["ServerScriptService/Shop"]), { applied: 1 });
  assert.equal((await changes(ws, done))[0]!.applied, true);
});

test("a slice that runs out of time checkpoints and hands over; the next slice resumes from the saved conversation", async () => {
  const { ws, job } = await draft("cloud-chain");
  await startJob(job, { trigger: async () => {} });
  let t = 1_000_000;
  const model = scriptedModel([[{ name: "read_tree", args: {} }], [{ name: "finish", args: { summary: "Done.", done: [], unresolved: [], testing: [] } }]]);
  const handed: string[] = [];
  // Each turn moves the clock 120 s; the slice limit is 200 s, so the first slice stops after two turns.
  const r1 = await runSlice(ws.id, job.id, { fetch: model.f, now: () => (t += 60_000), sliceMs: 200_000, trigger: async (j) => { handed.push(j.id); } });
  assert.equal(r1.status, "running");
  assert.deepEqual(handed, [job.id]);
  const mid = (await jobs().get(ws.id, job.id))!;
  assert.ok(mid.messages.length >= 3, "the conversation was checkpointed");
  const r2 = await runSlice(ws.id, job.id, { fetch: model.f, trigger: async () => {} });
  assert.equal(r2.status, "done");
  assert.equal((await jobs().get(ws.id, job.id))!.slices, 2);
});

test("stops on its own: budget, repeated failures, no progress, an answer from another model; and pause, resume and stop by the person", async () => {
  // Budget: a turn must leave room, so a 300-credit job with 200 used stops before the next turn.
  const a = await draft("cloud-budget", { maxUnits: 300 });
  await startJob(a.job, { trigger: async () => {} });
  await jobs().update(a.ws.id, a.job.id, { usage: { turns: 3, units: 200, usd: 0.3, promptTokens: 0, cachedTokens: 0, completionTokens: 0 } });
  assert.equal((await runSlice(a.ws.id, a.job.id, { fetch: scriptedModel([[]]).f })).status, "stopped");
  assert.match((await jobs().get(a.ws.id, a.job.id))!.stopReason!, /budget of 300 credits/);

  // No progress: only reads, turn after turn.
  const b = await draft("cloud-stall");
  await startJob(b.job, { trigger: async () => {} });
  assert.equal((await runSlice(b.ws.id, b.job.id, { fetch: scriptedModel([[{ name: "list_scripts", args: {} }]]).f })).status, "stopped");
  assert.match((await jobs().get(b.ws.id, b.job.id))!.stopReason!, /without an edit or plan progress/);

  // A different model answering: blocked, not used, not charged.
  const c = await draft("cloud-mismatch");
  await startJob(c.job, { trigger: async () => {} });
  const before = await usedThisMonth(c.ws);
  assert.equal((await runSlice(c.ws.id, c.job.id, { fetch: scriptedModel([[]], { model: "openai/gpt-5" }).f })).status, "blocked");
  assert.match((await jobs().get(c.ws.id, c.job.id))!.stopReason!, /did not come from Claude Opus 5.5/);
  assert.equal(await usedThisMonth(c.ws), before);

  // Pause, resume, stop.
  const d = await draft("cloud-control");
  await startJob(d.job, { trigger: async () => {} });
  await control(d.ws, (await jobs().get(d.ws.id, d.job.id))!, "pause");
  assert.equal((await runSlice(d.ws.id, d.job.id, { fetch: scriptedModel([[]]).f })).status, "paused");
  const resumed = await control(d.ws, (await jobs().get(d.ws.id, d.job.id))!, "resume");
  assert.equal(resumed.status, "queued");
  await control(d.ws, resumed, "stop");
  assert.equal((await runSlice(d.ws.id, d.job.id, { fetch: scriptedModel([[]]).f })).status, "stopped");
  await assert.rejects(control(d.ws, (await jobs().get(d.ws.id, d.job.id))!, "resume"), /Only a paused job/);
});

test("one slice at a time per job (lease), and a job whose slice died is picked up again", async () => {
  const { ws, job } = await draft("cloud-lease");
  await startJob(job, { trigger: async () => {} });
  await jobs().update(ws.id, job.id, { leaseId: "someone-else", leaseUntil: new Date(Date.now() + 60_000).toISOString() });
  assert.equal((await runSlice(ws.id, job.id, { fetch: scriptedModel([[]]).f })).status, "busy");
  // The other slice died: its lease expired and the heartbeat is old.
  await jobs().update(ws.id, job.id, { status: "running", leaseUntil: new Date(Date.now() - 1000).toISOString(), heartbeatAt: new Date(Date.now() - 10 * 60_000).toISOString() });
  const resumed: string[] = [];
  assert.ok((await resumeStale({ trigger: async (j) => { resumed.push(j.id); } })) >= 1);
  assert.ok(resumed.includes(job.id));
});

test("drafts: validated goal, budget, time and snapshot; one running job per account; Free is not allowed", async () => {
  const { ws } = await draft("cloud-rules");
  const base = { place: { name: "P" }, goal: "Fix the bugs in my game.", maxUnits: 3000, maxMinutes: 60 };
  await assert.rejects(createDraft(ws, { ...base, goal: "hi" }), /Describe what Keplar should work on/);
  await assert.rejects(createDraft(ws, { ...base, maxUnits: 50 }), /budget between 300 and 20000/);
  await assert.rejects(createDraft(ws, { ...base, maxMinutes: 5000 }), /time limit/);
  const j = await createDraft(ws, base);
  await assert.rejects(addScripts(ws, j, [{ path: "../etc/passwd", className: "Script", source: "" }]), /invalid path/);
  await assert.rejects(addScripts(ws, j, [{ path: "ServerScriptService/X", className: "Part", source: "" }]), /class must be/);
  const running = await createDraft(ws, base);
  await jobs().update(ws.id, running.id, { status: "running" });
  await assert.rejects(createDraft(ws, base), /already running/);

  const free = await signIn("cloud-free@example.com", "free");
  const res = await (await import("../src/app/api/roblox-cloud/jobs/route")).GET(jsonReq(free.cookie, "/api/roblox-cloud/jobs", "GET"));
  assert.equal(res.status, 402);
  assert.equal(USER_COLLECTIONS.includes("roblox_cloud_jobs") && USER_COLLECTIONS.includes("roblox_cloud_files"), true, "deleted and exported with the account");
});

test("routes: the owner creates, uploads, starts and reads a job; another account can't see it; the worker only answers Keplar itself", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  delete process.env.CRON_SECRET;
  const u = await signIn("cloud-routes@example.com", "pro");
  const jobsRoute = await import("../src/app/api/roblox-cloud/jobs/route");
  const created = await jobsRoute.POST(jsonReq(u.cookie, "/api/roblox-cloud/jobs", "POST", { place: { id: "s", name: "Obby" }, goal: "Add a checkpoint system.", mode: "checkpoint", maxUnits: 1000, maxMinutes: 30, tree: "Workspace" }));
  assert.equal(created.status, 201);
  const { job } = (await created.json()) as { job: { id: string; status: string } };
  assert.equal(job.status, "draft");
  const ctx = { params: Promise.resolve({ id: job.id }) };
  const up = await (await import("../src/app/api/roblox-cloud/jobs/[id]/scripts/route")).POST(jsonReq(u.cookie, `/api/roblox-cloud/jobs/${job.id}/scripts`, "POST", { scripts: [{ path: "ServerScriptService/Checkpoints", className: "Script", source: "print('cp')" }] }), ctx);
  assert.deepEqual(await up.json(), { scripts: 1, bytes: 11 });
  const start = await (await import("../src/app/api/roblox-cloud/jobs/[id]/start/route")).POST(jsonReq(u.cookie, `/api/roblox-cloud/jobs/${job.id}/start`, "POST"), ctx);
  assert.equal(start.status, 200);
  assert.equal(((await start.json()) as { job: { status: string } }).job.status, "queued");

  const other = await signIn("cloud-other@example.com", "pro");
  const one = await import("../src/app/api/roblox-cloud/jobs/[id]/route");
  assert.equal((await one.GET(jsonReq(other.cookie, `/api/roblox-cloud/jobs/${job.id}`, "GET"), ctx)).status, 404);
  const mine = await one.GET(jsonReq(u.cookie, `/api/roblox-cloud/jobs/${job.id}`, "GET"), ctx);
  const view = ((await mine.json()) as { job: Record<string, unknown> }).job;
  assert.equal(view.messages, undefined, "the conversation never leaves the server");

  const worker = await import("../src/app/api/roblox-cloud/worker/route");
  const ask = (auth?: string) => worker.POST(new Request("https://keplar.one/api/roblox-cloud/worker", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ jobId: job.id, workspaceId: u.workspaceId }) }));
  assert.equal((await ask("Bearer anything")).status, 401, "no CRON_SECRET: nobody can call it");
  process.env.CRON_SECRET = "cron-test-secret";
  assert.equal((await ask("Bearer wrong")).status, 401);
  await control((await workspaceById(u.workspaceId))!, (await jobs().get(u.workspaceId, job.id))!, "stop");
  assert.equal((await ask("Bearer cron-test-secret")).status, 202);
  delete process.env.CRON_SECRET;
});

test("hand-over: the next slice is called on Keplar's own worker route with CRON_SECRET, never anywhere else", async () => {
  assert.equal(workerBase({ VERCEL_ENV: "production" }), site.url.replace(/\/$/, ""), "production uses the site's own URL (keplar.one in a production build)");
  assert.equal(workerBase({ VERCEL_URL: "keplar-abc.vercel.app" }), "https://keplar-abc.vercel.app");
  assert.equal(workerBase({ KEPLAR_INTERNAL_URL: "http://localhost:3199/" }), "http://localhost:3199");
  const seen: { url: string; auth: string | null }[] = [];
  const f = (async (url: string, init: RequestInit) => { seen.push({ url, auth: new Headers(init.headers).get("authorization") }); return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
  await triggerNext({ id: "rc_1", workspaceId: "ws_1" }, { fetch: f, env: { VERCEL_ENV: "production", CRON_SECRET: "s3" } });
  assert.deepEqual(seen, [{ url: `${site.url.replace(/\/$/, "")}/api/roblox-cloud/worker`, auth: "Bearer s3" }]);
  await triggerNext({ id: "rc_1", workspaceId: "ws_1" }, { fetch: f, env: { VERCEL_ENV: "production" } });
  assert.equal(seen.length, 1, "no secret: no call");
});

test("long conversations are compacted: old tool results shortened, old reasoning dropped, the opening and recent turns kept", () => {
  const msgs: unknown[] = [{ role: "user", content: "opening" }];
  for (let i = 0; i < 40; i++) msgs.push({ role: "assistant", content: "x", reasoning_details: [{ t: "r".repeat(100) }] }, { role: "tool", tool_call_id: `t${i}`, content: "y".repeat(10_000) });
  const out = compact(msgs, 50_000) as { role: string; content: string; reasoning_details?: unknown }[];
  assert.equal(out[0]!.content, "opening");
  assert.match(out[2]!.content, /older result shortened/);
  assert.equal(out[1]!.reasoning_details, undefined);
  assert.equal(out[out.length - 1]!.content.length, 10_000, "recent results kept whole");
  assert.equal(ROBLOX_CLOUD_PROFILE.lockedModel, true);
});

/* ── the Studio page side ────────────────────────────────────────────────── */

/** A fake Studio: answers the index, sources and read calls from an in-memory place, and records applied changes. */
function fakeStudio(scripts: { path: string; className: string; source: string }[]) {
  const applied: string[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    assert.equal(name, "execute_luau");
    const code = String(args.code);
    const text = code.includes("table.insert(scripts, { i = i") ? JSON.stringify({ place: "Pet Sim", tree: "Workspace", scripts: scripts.map((s, i) => ({ i: i + 1, path: s.path, className: s.className, bytes: s.source.length })) })
      : code.includes("for i = ") ? (() => { const [, a, b] = /for i = (\d+), math\.min\(#list, (\d+)\)/.exec(code)!; return JSON.stringify(scripts.slice(Number(a) - 1, Number(b)).map((s, k) => ({ i: Number(a) + k, path: s.path, source: s.source }))); })()
      : code.includes("CHS:TryBeginRecording") ? (applied.push(/local path = "([^"]+)"/.exec(code)![1]!), "ok")
      : (() => { const p = /resolve\("([^"]+)"\)/.exec(code)![1]; const s = scripts.find((x) => x.path === p); return JSON.stringify(s ? { missing: false, source: s.source } : { missing: true }); })();
    return { ok: true as const, result: { content: [{ type: "text", text }] } };
  };
  return { bridge: { call }, applied };
}

test("snapshot: every script is read in batches, then uploaded and started through the API", async () => {
  const big = "x".repeat(900_000);
  const scripts = [{ path: "ServerScriptService/A", className: "Script", source: big }, { path: "ServerScriptService/B", className: "Script", source: big }, { path: "ReplicatedStorage/C", className: "ModuleScript", source: "return 1" }];
  const { bridge } = fakeStudio(scripts);
  const progress: number[] = [];
  const snap = await takeSnapshot(bridge, "studio-1", (d) => progress.push(d));
  assert.equal(snap.scripts.length, 3);
  assert.deepEqual(progress, [1, 3], "two Studio calls: the big scripts don't share one");
  const calls: string[] = [];
  const api = async (path: string) => { calls.push(path); return new Response(JSON.stringify(path.endsWith("/jobs") ? { job: { id: "rc_x" } } : {}), { status: 200 }); };
  await startCloudJob(snap, { placeId: "1", goal: "g", mode: "until_done", maxUnits: 1000, maxMinutes: 60 }, undefined, api);
  assert.deepEqual(calls, ["/api/roblox-cloud/jobs", "/api/roblox-cloud/jobs/rc_x/scripts", "/api/roblox-cloud/jobs/rc_x/start"], "about 2.2 MB fits in one upload batch");
  assert.deepEqual(parseJson<{ a: number }>('Result: {"a":1}'), { a: 1 });
});

test("apply: only picked changes are written; a script edited in Studio since the snapshot is skipped, never overwritten", async () => {
  const { bridge, applied } = fakeStudio([{ path: "ServerScriptService/Shop", className: "Script", source: "old" }, { path: "ServerScriptService/Edited", className: "Script", source: "changed by the person" }]);
  const ch = (path: string, status: Change["status"], base: string, next: string | null): Change => ({ path, status, className: "Script", next, base, baseHash: "", applied: false });
  const res = await applyChanges(bridge, "studio-1", [
    ch("ServerScriptService/Shop", "changed", "old", "new"),
    ch("ServerScriptService/Edited", "changed", "what Keplar saw", "Keplar's version"),
    ch("ServerScriptService/New", "created", "", "print(1)"),
    ch("ServerScriptService/Shop", "created", "", "x"),
  ]);
  assert.deepEqual(res.map((r) => r.result), ["applied", "conflict", "applied", "conflict"]);
  assert.match(res[1]!.detail!, /edited in Studio after the snapshot/);
  assert.deepEqual(applied, ["ServerScriptService/Shop", "ServerScriptService/New"]);
});
