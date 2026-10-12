import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jsonReq, signIn } from "./helpers/session";
import { usedThisMonth } from "../src/lib/create/platform/compute";
import { workspaceById, type Workspace } from "../src/lib/create/platform/workspace";
import { cleanup, control, createJob, download, downloaded, ensureImage, startJob, validateReport, validateSettings } from "../src/lib/blender-cloud/api";
import { agentScript, clockSeconds, encodeScript, frameArg, IMAGE_RECIPE, installScript, JOB_DIR, killScript, parsePoll, pollScript, readLog, renderScript, type Machine, type Machines } from "../src/lib/blender-cloud/machine";
import { frameList, frameOf, jobs, jobView, machineSpec, RENDER_CREDIT_RATE, system, SYSTEM_WS, usdPerMachineMinute, type RenderJob } from "../src/lib/blender-cloud/model";
import { monthKey, remainingFrames, resumeStale, runSlice, unitsPerMinute } from "../src/lib/blender-cloud/worker";
import { USER_COLLECTIONS, isRetained } from "../src/lib/privacy/account-data";
import { featureForPath } from "../src/lib/cost/features";

// The tests share one store: lift the shared caps so simulated minutes in one test don't refuse the next (the capacity test sets its own).
process.env.KEPLAR_RENDER_MONTHLY_HOURS = "1000";
process.env.KEPLAR_RENDER_CONCURRENT = "100";

/* ── a fake render machine: renders two frames per look, can lose its session, keeps files when stopped ── */

type FakeState = { status: string; session: number; files: Map<string, number>; scene: number | null; pending: number[]; exit: number | null; video: "none" | "running" | "done"; vexit: number | null; failWith?: string; perPoll: number; scripts: string[]; written: Map<string, string>; removed: boolean; spawned: string[] };

function fakeMachines() {
  const all = new Map<string, FakeState>();
  const created: { name: string; snapshotId: string; vcpus: number }[] = [];
  let builds = 0;
  const dropped: string[] = [];
  const machine = (name: string): Machine => {
    const st = all.get(name)!;
    const poll = () => {
      if (st.pending.length && st.status === "running") {
        if (st.failWith) { st.pending = []; st.exit = 1; }
        else for (const f of st.pending.splice(0, st.perPoll)) st.files.set(`frame_${String(f).padStart(5, "0")}.png`, 1000 + f);
        if (!st.pending.length && st.exit === null) st.exit = 0;
      }
      if (st.video === "running") { st.files.set("video.mp4", 5000); st.video = "done"; st.vexit = 0; }
      const names = [...st.files.keys()].sort();
      const log = st.failWith ? [`00:01.00  render | Error: ${st.failWith}`] : [`00:02.10  render | Fra: ${names.length} | Remaining: 00:10.00 | Mem: 60M | Sample 64/128`, "00:03.00  render | Time: 00:12.50 (Saving: 00:00.10)"];
      return ["@@OUT", ...names, "@@SIZES", ...names.map((n) => `${st.files.get(n)} out/${n}`), "@@ALIVE", ...(st.pending.length ? ["1"] : []), "@@EXIT", ...(st.exit === null ? [] : [String(st.exit)]), "@@VEXIT", ...(st.vexit === null ? [] : [String(st.vexit)]), "@@SCENE", ...(st.scene ? [String(st.scene)] : []), "@@LOG", ...log, "@@VLOG"].join("\n");
    };
    return {
      name, url: `https://sb-${name}.vercel.run`, status: st.status, session: `s${st.session}`,
      async run(script) {
        st.scripts.push(script.slice(0, 40));
        if (script === pollScript()) return { code: 0, out: poll() };
        if (script === killScript()) { st.pending = []; return { code: 0, out: "" }; }
        return { code: 0, out: "" };
      },
      async spawn(script) {
        st.spawned.push(script);
        if (script.includes("render.py")) {
          const arg = /-f '([^']+)'/.exec(script)![1];
          st.pending = arg.split(",").flatMap((p) => { const r = /^(-?\d+)\.\.(-?\d+)$/.exec(p); if (!r) return [Number(p)]; const out: number[] = []; for (let f = Number(r[1]); f <= Number(r[2]); f++) out.push(f); return out; });
          st.exit = null;
        }
        if (script.includes("encode.py")) { st.video = "running"; st.vexit = null; }
      },
      async write(files) { for (const f of files) st.written.set(f.path, f.content.toString()); },
      async stop() { st.status = "stopped"; st.pending = []; },
      async remove() { st.removed = true; all.delete(name); },
    };
  };
  const machines: Machines = {
    async create(o) {
      created.push({ name: o.name, snapshotId: o.snapshotId, vcpus: o.vcpus });
      all.set(o.name, { status: "running", session: 1, files: new Map(), scene: null, pending: [], exit: null, video: "none", vexit: null, perPoll: 2, scripts: [], written: new Map(), removed: false, spawned: [] });
      return machine(o.name);
    },
    async get(name, resume) {
      const st = all.get(name);
      if (!st) return null;
      if (resume && st.status !== "running") { st.status = "running"; st.session += 1; }
      return machine(name);
    },
    async buildImage() { builds++; return { snapshotId: `snap_fake_${builds}`, blender: "5.2.2" }; },
    async listNames() { return [...all.keys()]; },
    async dropImage(id) { dropped.push(id); },
  };
  return { machines, all, created, dropped, builds: () => builds, state: (name: string) => all.get(name)! };
}

const REPORT = { file: "castle.blend", blender: "5.1.2", engine: "CYCLES", frameStart: 1, frameEnd: 6, frameCurrent: 1, fps: 24, resX: 1920, resY: 1080, resPercent: 50, samples: 128, objects: 12, missing: [], warnings: [] };
const SETTINGS = { engine: "CYCLES", frameStart: 1, frameEnd: 6, frameStep: 1, resPercent: 50, format: "PNG", video: true };

async function account(label: string, plan: "plus" | "lite" | "free" = "plus"): Promise<Workspace> {
  const u = await signIn(`${label}@example.com`, plan);
  return (await workspaceById(u.workspaceId))!;
}

async function uploadedJob(label: string, fake = fakeMachines(), extra: Record<string, unknown> = {}) {
  const ws = await account(label);
  const handed: string[] = [];
  const { job, upload } = await createJob(ws, { report: REPORT, settings: SETTINGS, maxUnits: 5000, maxMinutes: 240, sceneBytes: 4_000_000, ...extra }, { machines: fake.machines });
  fake.state(job.machine!.name).scene = 4_000_000;
  const started = await startJob(ws, job, { machines: fake.machines, trigger: async (j) => { handed.push(j.id); } });
  return { ws, job: started, upload, fake, handed };
}

const quick = (fake: ReturnType<typeof fakeMachines>, t: { now: number }, extra = {}) => ({ machines: fake.machines, now: () => (t.now += 60_000), sleep: async () => {}, trigger: async () => {}, sliceMs: 30 * 60_000, pollMs: 1, ...extra });

/* ── pure helpers ─────────────────────────────────────────────────────────── */

test("frames: lists, Blender's -f argument and output names", () => {
  assert.deepEqual(frameList({ frameStart: 1, frameEnd: 10, frameStep: 3 }), [1, 4, 7, 10]);
  assert.equal(frameArg([1, 2, 3, 4, 7, 9, 10, 11, 20]), "1..4,7,9..11,20");
  assert.equal(frameArg([5, 6]), "5,6");
  assert.equal(frameOf("frame_00012.png"), 12);
  assert.equal(frameOf("frame_00012.exr"), 12);
  assert.equal(frameOf("video.mp4"), null);
  assert.equal(frameOf("../frame_1.png"), null);
});

test("Blender's log: frame, progress, frame times and real errors (EGL notices are not errors)", () => {
  const r = readLog([
    "EGL Error (0x3009): EGL_BAD_MATCH: Arguments are inconsistent",
    "00:24.251  render           | Fra: 3 | Remaining: 00:23.07 | Mem: 67M | Sample 65/128",
    "00:38.692  render           | Time: 00:38.25 (Saving: 00:00.21)",
  ]);
  assert.equal(r.frame, 3);
  assert.match(r.progress, /Remaining: 00:23.07 · Sample 65\/128/);
  assert.deepEqual(r.times, [38.25]);
  assert.equal(r.error, null);
  assert.equal(readLog(["00:00.20  blend | Error: Cannot read file '/vercel/sandbox/job/scene.blend': not a blend file"]).error, "Error: Cannot read file '/vercel/sandbox/job/scene.blend': not a blend file");
  assert.equal(readLog(["Killed"]).error, "The render machine ran out of memory.");
  assert.equal(clockSeconds("01:02:03.5"), 3723.5);
});

test("the poll output is read section by section, empty sections included", () => {
  const p = parsePoll(["@@OUT", "frame_00001.png", "video.mp4", "@@SIZES", "187095 out/frame_00001.png", "32598 out/video.mp4", "@@ALIVE", "@@EXIT", "0", "@@VEXIT", "@@SCENE", "113077", "@@LOG", "x | Fra: 1 | Sample 1/2", "@@VLOG"].join("\n"));
  assert.deepEqual(p.files, ["frame_00001.png", "video.mp4"]);
  assert.equal(p.sizes.get("video.mp4"), 32598);
  assert.equal(p.alive, false);
  assert.equal(p.exit, 0);
  assert.equal(p.videoExit, null);
  assert.equal(p.sceneBytes, 113077);
});

test("machine scripts: Blender runs with the scene's scripts off, the agent is started only once, checksummed install", () => {
  const r = renderScript([1, 2, 3]);
  assert.match(r, /--disable-autoexec/);
  assert.match(r, /--python-exit-code 3 --python \/vercel\/sandbox\/render\.py -f '1\.\.3'/);
  assert.match(r, /echo \$\? > render\.exit/);
  assert.match(encodeScript(), /--factory-startup --python-exit-code 3 --python \/vercel\/sandbox\/encode\.py/);
  assert.match(agentScript(), /curl -fs -m 2 http:\/\/127\.0\.0\.1:8000\/health >\/dev\/null \|\| exec python3/);
  assert.match(installScript(), /sha256sum -c -/);
  assert.match(IMAGE_RECIPE, /^blender 5\.2\.2 /);
  const agent = readFileSync("vendor/blender-cloud/agent.py", "utf8");
  assert.match(agent, /compare_digest/);
  assert.match(agent, /NAME = re\.compile\(r"\^\[A-Za-z0-9_.-\]\{1,80\}\$"\)/, "download names can't leave the out folder");
  assert.doesNotMatch(agent, /subprocess|os\.system|eval\(|exec\(/, "the agent only moves files");
  const render = readFileSync("vendor/blender-cloud/render.py", "utf8");
  assert.match(render, /scene\.cycles\.device = "CPU"/);
  assert.match(render, /OPENIMAGEDENOISE/);
});

test("settings and scene report are validated and capped", () => {
  assert.throws(() => validateSettings({ ...SETTINGS, engine: "OCTANE" }), /Cycles, EEVEE or Workbench/);
  assert.throws(() => validateSettings({ ...SETTINGS, frameEnd: 9999 }), /at most 2,500 frames/);
  assert.throws(() => validateSettings({ ...SETTINGS, frameEnd: 0 }), /last frame/);
  assert.equal(validateSettings({ ...SETTINGS, format: "OPEN_EXR" }).video, false, "no video from EXR frames");
  assert.equal(validateSettings({ ...SETTINGS, frameEnd: 1 }).video, false, "no video from one frame");
  assert.equal(validateSettings({ ...SETTINGS, samples: "" }).samples, undefined);
  assert.throws(() => validateReport({}), /saved \.blend/);
  assert.equal(validateReport({ ...REPORT, missing: Array(99).fill("x") }).missing.length, 40);
});

test("pricing: machine minutes at the documented Sandbox rates times the credit rate", () => {
  assert.equal(Math.round(usdPerMachineMinute(4) * 60 * 1000) / 1000, 0.682);
  assert.equal(RENDER_CREDIT_RATE, 1.5);
  assert.equal(Math.round(unitsPerMinute(4) * 10) / 10, 8.5);
  assert.equal(machineSpec().vcpus, 4);
  assert.equal(machineSpec().sessionMinutes, 44);
});

/* ── jobs ─────────────────────────────────────────────────────────────────── */

test("a new job builds the image once, starts a locked-down machine, and hands out upload access (never in the job view)", async () => {
  const fake = fakeMachines();
  const ws = await account("bc-create");
  const { job, upload } = await createJob(ws, { report: REPORT, settings: SETTINGS, maxUnits: 2000, maxMinutes: 60, sceneBytes: 1_000_000 }, { machines: fake.machines });
  assert.equal(job.status, "uploading");
  assert.equal(fake.builds(), 1);
  assert.equal(fake.created[0].snapshotId, "snap_fake_1");
  assert.match(upload.url, /^https:\/\/sb-blender-br-/);
  assert.match(upload.token, /^[a-f0-9]{48}$/);
  const st = fake.state(job.machine!.name);
  assert.equal(st.written.get(`${JOB_DIR}/token`), upload.token);
  assert.deepEqual(JSON.parse(st.written.get(`${JOB_DIR}/settings.json`)!), { ...SETTINGS, fps: 24 });
  for (const f of ["agent.py", "render.py", "encode.py"]) assert.ok(st.written.has(`/vercel/sandbox/${f}`), f);
  assert.doesNotMatch(JSON.stringify(jobView(job)), new RegExp(upload.token), "the token stays out of the job view");
  // One running job per account; the image is reused.
  await assert.rejects(createJob(ws, { report: REPORT, settings: SETTINGS, maxUnits: 2000, maxMinutes: 60, sceneBytes: 1 }, { machines: fake.machines }), /already running/);
  assert.equal(await ensureImage(fake.machines), "snap_fake_1");
  assert.equal(fake.builds(), 1);
  // A new recipe (a newer Blender) rebuilds the image and deletes the old one.
  await system().update(SYSTEM_WS, "image", { recipe: "blender 5.1.0 old" });
  assert.equal(await ensureImage(fake.machines), "snap_fake_2");
  assert.deepEqual(fake.dropped, ["snap_fake_1"]);
  await control(ws, (await jobs().get(ws.id, job.id))!, "stop", { machines: fake.machines });
  assert.equal((await jobs().get(ws.id, job.id))!.status, "stopped");
});

test("start waits for the upload; then the render runs to the end, is charged by machine time, makes a video and stops the machine", async () => {
  const fake = fakeMachines();
  const ws = await account("bc-run");
  const { job } = await createJob(ws, { report: REPORT, settings: SETTINGS, maxUnits: 5000, maxMinutes: 240, sceneBytes: 4_000_000 }, { machines: fake.machines });
  await assert.rejects(startJob(ws, job, { machines: fake.machines, trigger: async () => {} }), /hasn't finished uploading/);
  fake.state(job.machine!.name).scene = 4_000_000;
  const handed: string[] = [];
  const queued = await startJob(ws, job, { machines: fake.machines, trigger: async (j) => { handed.push(j.id); } });
  assert.equal(queued.status, "queued");
  assert.deepEqual(handed, [job.id]);

  const before = await usedThisMonth(ws);
  const t = { now: Date.now() };
  const r = await runSlice(ws.id, job.id, quick(fake, t));
  assert.equal(r.status, "done");
  const done = (await jobs().get(ws.id, job.id))!;
  assert.deepEqual(done.done, [1, 2, 3, 4, 5, 6]);
  assert.ok(done.outputs.some((o) => o.name === "video.mp4"));
  assert.match(done.stopReason!, /6 frames and a video/);
  assert.equal(done.machineState, "stopped");
  assert.equal(fake.state(job.machine!.name).status, "stopped");
  assert.ok(done.usage.machineMinutes > 0 && done.usage.units > 0);
  assert.equal(done.usage.units, Math.ceil(done.usage.machineMinutes * unitsPerMinute(4)));
  assert.equal((await usedThisMonth(ws)) - before, done.usage.units, "charged to the account's credits");
  assert.ok(((await system().get(SYSTEM_WS, monthKey(t.now)))?.minutes ?? 0) >= done.usage.machineMinutes, "counted in this month's shared machine time");
  assert.match(fake.state(job.machine!.name).spawned.find((s) => s.includes("render.py"))!, /-f '1\.\.6'/);
});

test("a machine session that ends mid-render continues on a new session with only the missing frames", async () => {
  const { ws, job, fake } = await uploadedJob("bc-session");
  const st = fake.state(job.machine!.name);
  st.perPoll = 1;
  const t = { now: Date.now() };
  let polls = 0;
  const r = await runSlice(ws.id, job.id, quick(fake, t, { sleep: async () => { polls++; if (polls === 3) { st.status = "stopped"; st.pending = []; } } }));
  assert.equal(r.status, "done");
  const done = (await jobs().get(ws.id, job.id))!;
  assert.equal(done.restarts, 1);
  assert.deepEqual(done.done, [1, 2, 3, 4, 5, 6]);
  const renders = st.spawned.filter((s) => s.includes("render.py"));
  assert.equal(renders.length, 2);
  assert.doesNotMatch(renders[1], /-f '1\.\./, "the frames already on the machine are not rendered again");
  assert.ok(done.log.some((l) => /session ended/.test(l.text)));
  assert.equal(st.session, 2);
});

test("stops at the budget and the time limit, keeping the frames already rendered", async () => {
  const fake = fakeMachines();
  const a = await uploadedJob("bc-budget", fake, { maxUnits: 100 });
  fake.state(a.job.machine!.name).perPoll = 1;
  const t = { now: Date.now() };
  assert.equal((await runSlice(a.ws.id, a.job.id, quick(fake, t, { now: () => (t.now += 6 * 60_000) }))).status, "stopped");
  const ja = (await jobs().get(a.ws.id, a.job.id))!;
  assert.match(ja.stopReason!, /budget of 100 credits/);
  assert.ok(ja.usage.units <= 100 + Math.ceil(unitsPerMinute(4) * 6));
  assert.ok(ja.done.length < 6);

  const fake2 = fakeMachines();
  const b = await uploadedJob("bc-time", fake2, { maxMinutes: 5 });
  fake2.state(b.job.machine!.name).perPoll = 1;
  assert.equal((await runSlice(b.ws.id, b.job.id, quick(fake2, { now: Date.now() }, { now: (() => { let n = Date.now(); return () => (n += 3 * 60_000); })() }))).status, "stopped");
  assert.match((await jobs().get(b.ws.id, b.job.id))!.stopReason!, /time limit/);
});

test("pause stops the machine and keeps the frames; resume renders only the rest; stop ends it", async () => {
  const { ws, job, fake } = await uploadedJob("bc-pause");
  const st = fake.state(job.machine!.name);
  st.perPoll = 1;
  const t = { now: Date.now() };
  let n = 0;
  await runSlice(ws.id, job.id, quick(fake, t, { sleep: async () => { if (++n === 3) await control(ws, (await jobs().get(ws.id, job.id))!, "pause", { machines: fake.machines }); } }));
  let j = (await jobs().get(ws.id, job.id))!;
  assert.equal(j.status, "paused");
  assert.equal(st.status, "stopped");
  const kept = j.done.length;
  assert.ok(kept >= 1 && kept < 6);
  const handed: string[] = [];
  j = await control(ws, j, "resume", { machines: fake.machines, trigger: async (x) => { handed.push(x.id); } });
  assert.equal(j.status, "queued");
  assert.deepEqual(handed, [job.id]);
  assert.equal((await runSlice(ws.id, job.id, quick(fake, t))).status, "done");
  assert.equal(st.spawned.filter((s) => s.includes("render.py")).length, 2);
  assert.deepEqual(remainingFrames((await jobs().get(ws.id, job.id))!), []);
  await assert.rejects(control(ws, (await jobs().get(ws.id, job.id))!, "pause"), /Only a running render/);
});

test("a Blender error ends the job as failed with Blender's own message", async () => {
  const fake = fakeMachines();
  const { ws, job } = await uploadedJob("bc-fail", fake);
  fake.state(job.machine!.name).failWith = "Cannot read file '/vercel/sandbox/job/scene.blend': not a blend file";
  assert.equal((await runSlice(ws.id, job.id, quick(fake, { now: Date.now() }))).status, "failed");
  const j = (await jobs().get(ws.id, job.id))!;
  assert.match(j.stopReason!, /Cannot read file .* No frames were rendered\./);
});

test("download wakes the stopped machine and hands out access; done stops it again", async () => {
  const { ws, job, fake } = await uploadedJob("bc-download");
  await runSlice(ws.id, job.id, quick(fake, { now: Date.now() }));
  const st = fake.state(job.machine!.name);
  assert.equal(st.status, "stopped");
  const d = await download(ws, (await jobs().get(ws.id, job.id))!, { machines: fake.machines });
  assert.equal(st.status, "running");
  assert.equal(d.files.length, 7);
  assert.equal(d.token, job.machine!.token);
  assert.ok(st.spawned.includes(agentScript()), "the agent is started for the download");
  const after = await downloaded(ws, (await jobs().get(ws.id, job.id))!, { machines: fake.machines });
  assert.equal(st.status, "stopped");
  assert.ok(after.downloadedAt);
});

test("capacity: the monthly machine-time cap and the machines-at-once cap refuse new jobs plainly", async () => {
  const fake = fakeMachines();
  const ws = await account("bc-capacity");
  const now = Date.now();
  await system().increment(SYSTEM_WS, monthKey(now), { minutes: 60 * 1000 }, { id: monthKey(now), workspaceId: SYSTEM_WS, minutes: 0 });
  await assert.rejects(createJob(ws, { report: REPORT, settings: SETTINGS, maxUnits: 2000, maxMinutes: 60, sceneBytes: 1 }, { machines: fake.machines }), /used all of this month's machine time/);
  await system().update(SYSTEM_WS, monthKey(now), { minutes: 0 });
});

test("clean-up: abandoned uploads end, expired renders and stray machines are deleted, stale watchers restart", async () => {
  const fake = fakeMachines();
  const ws = await account("bc-cleanup");
  const { job } = await createJob(ws, { report: REPORT, settings: SETTINGS, maxUnits: 2000, maxMinutes: 60, sceneBytes: 1 }, { machines: fake.machines });
  const later = Date.now() + 31 * 60_000;
  await fake.machines.create({ name: "blender-orphan", snapshotId: "x", vcpus: 4, sessionMinutes: 44, keepDays: 3, jobId: "gone" });
  const r1 = await cleanup({ machines: fake.machines, now: () => later });
  assert.ok(r1.stopped >= 1 && r1.orphans >= 1);
  assert.equal((await jobs().get(ws.id, job.id))!.status, "failed");
  assert.equal(fake.all.has("blender-orphan"), false);
  const r2 = await cleanup({ machines: fake.machines, now: () => later + 4 * 864e5 });
  assert.ok(r2.expired >= 1);
  assert.equal(await jobs().get(ws.id, job.id), null);
  assert.equal(fake.all.has(job.machine!.name), false, "its machine and files are deleted with it");

  const { ws: ws2, job: j2 } = await uploadedJob("bc-stale");
  await jobs().update(ws2.id, j2.id, { heartbeatAt: new Date(Date.now() - 5 * 60_000).toISOString(), leaseUntil: undefined });
  const handed: string[] = [];
  assert.ok((await resumeStale({ trigger: async (x) => { handed.push(x.id); } })) >= 1);
  assert.ok(handed.includes(j2.id));
});

test("routes: Lite and up only, same-origin writes, and the account's data rules", async () => {
  const free = await signIn("bc-free@example.com", "free");
  const { GET } = await import("../src/app/api/blender-cloud/jobs/route");
  const res = await GET(jsonReq(free.cookie, "/api/blender-cloud/jobs", "GET"));
  assert.ok(res.status === 402 || res.status === 403, `free plan is refused (${res.status})`);
  assert.match(JSON.stringify(await res.json()), /Lite, Plus and Pro/);
  assert.ok((USER_COLLECTIONS as readonly string[]).includes("blender_cloud_jobs"));
  assert.ok(isRetained("system_blender_cloud"), "the shared image and capacity rows are system data");
  assert.equal(featureForPath("/api/blender-cloud/worker"), "agents");
  const cron = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  assert.ok(cron.crons.some((c) => c.path === "/api/cron/blender-cloud" && /^\d+ \d+ \* \* \*$/.test(c.schedule)), "daily cron (Hobby allows daily only)");
  assert.match(readFileSync("next.config.ts", "utf8"), /"\/api\/blender-cloud\/jobs": \["\.\/vendor\/blender-cloud\/\*\*"\]/);
});

test("job view: no token, frames and estimate", () => {
  const j = { id: "br_x", workspaceId: "w", createdAt: "", updatedAt: "", expiresAt: "", file: "a.blend", report: REPORT, settings: SETTINGS, maxUnits: 1, maxMinutes: 1, status: "rendering", machine: { name: "n", url: "u", token: "SECRET", vcpus: 4 }, done: [1, 2], frameSeconds: [10, 20], restarts: 0, slices: 1, usage: { units: 1, usd: 0, machineMinutes: 1 }, outputs: [], log: [] } as unknown as RenderJob;
  const v = jobView(j);
  assert.doesNotMatch(JSON.stringify(v), /SECRET/);
  assert.deepEqual(v.frames, { total: 6, done: 2, current: null, secondsPerFrame: 15 });
});
