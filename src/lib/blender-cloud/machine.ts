/**
 * Render machines for Blender Cloud (src/lib/blender-cloud/model.ts): Vercel Sandbox microVMs.
 *
 * The image: a sandbox with Blender (official Linux build, checksum verified) and the software graphics libraries EEVEE needs
 * on a machine without a GPU, saved as a snapshot that never expires. It is built on first use and rebuilt when the recipe
 * below changes. A job machine starts from that snapshot with no network access at all ("deny-all"): the scene can't reach the
 * internet, and the only way in is the exposed port of the agent (vendor/blender-cloud/agent.py), which needs the job's token.
 * Machines are persistent: when a session ends (or Keplar stops one) the files are snapshotted and come back on resume.
 *
 * Everything here goes through the `Machines` interface so the worker can be tested without Vercel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const BLENDER = {
  version: "5.2.2",
  file: "blender-5.2.2-linux-x64.tar.xz",
  sha256: "84098912789dc450e95697c4184fb8a90acbe5111c2ba4aede3fecb57806a168",
  /** download.blender.org refuses scripted downloads; these are its official mirrors (the checksum is verified either way). */
  mirrors: ["https://mirrors.ocf.berkeley.edu/blender/release/Blender5.2/", "https://ftp.nluug.nl/pub/graphics/blender/release/Blender5.2/", "https://mirror.clarkson.edu/blender/release/Blender5.2/"],
} as const;
const PACKAGES = "libx11-6 libxrender1 libxfixes3 libxi6 libxkbcommon0 libsm6 libice6 libxext6 libxxf86vm1 libgl1 libegl1 libgl1-mesa-dri libegl-mesa0 libglx-mesa0";
/** Changing anything here rebuilds the image on the next job. */
export const IMAGE_RECIPE = `blender ${BLENDER.version} ${BLENDER.sha256.slice(0, 12)} | ${PACKAGES}`;

export const JOB_DIR = "/vercel/sandbox/job";
export const AGENT_PORT = 8000;
const SCRIPTS = ["agent.py", "render.py", "encode.py"] as const;

export function installScript(): string {
  const urls = BLENDER.mirrors.map((m) => `${m}${BLENDER.file}`).join(" ");
  return [
    "set -e",
    "cd /tmp",
    `for u in ${urls}; do curl -fsSL --retry 2 -o b.tar.xz "$u" && echo "${BLENDER.sha256}  b.tar.xz" | sha256sum -c - && break; rm -f b.tar.xz; done`,
    "test -s b.tar.xz",
    "sudo mkdir -p /opt/blender",
    "sudo tar -xJf b.tar.xz -C /opt/blender --strip-components=1",
    "rm -f b.tar.xz",
    `sudo DEBIAN_FRONTEND=noninteractive apt-get -qq update >/dev/null`,
    `sudo DEBIAN_FRONTEND=noninteractive apt-get -qq install -y --no-install-recommends ${PACKAGES} >/dev/null`,
    "sudo apt-get clean && sudo rm -rf /var/lib/apt/lists/*",
    "/opt/blender/blender -b --factory-startup --version | head -1",
  ].join("\n");
}

/** The Python files that run on the machine (the agent, the render setup and the video step). Read from vendor/blender-cloud. */
export function machineScripts(root = process.cwd()): { path: string; content: Buffer }[] {
  return SCRIPTS.map((n) => ({ path: `/vercel/sandbox/${n}`, content: readFileSync(path.join(root, "vendor", "blender-cloud", n)) }));
}

export type RunResult = { code: number; out: string };
export interface Machine {
  readonly name: string;
  /** The agent's public address (https://sb-….vercel.run). */
  readonly url: string;
  /** "running" while a session is live; "stopped" after a session ended (its files are kept). */
  readonly status: string;
  readonly session: string;
  run(script: string): Promise<RunResult>;
  /** Starts a long-running shell script and returns at once. */
  spawn(script: string): Promise<void>;
  write(files: { path: string; content: Buffer }[]): Promise<void>;
  stop(): Promise<void>;
  remove(): Promise<void>;
}
export interface Machines {
  create(o: { name: string; snapshotId: string; vcpus: number; sessionMinutes: number; keepDays: number; jobId: string }): Promise<Machine>;
  /** The machine by name, or null when it no longer exists. `resume` starts a new session when the last one ended. */
  get(name: string, resume: boolean): Promise<Machine | null>;
  /** Builds the image and returns its snapshot id (takes about a minute). */
  buildImage(): Promise<{ snapshotId: string; blender: string }>;
  /** Machines Keplar created, for the clean-up of ones whose job is gone. */
  listNames(): Promise<string[]>;
  /** Deletes an image that a newer one replaced. */
  dropImage(snapshotId: string): Promise<void>;
}

type SandboxModule = typeof import("@vercel/sandbox");
let sdk: Promise<SandboxModule> | null = null;
const load = () => (sdk ??= import("@vercel/sandbox"));

function wrap(sb: InstanceType<SandboxModule["Sandbox"]>): Machine {
  const session = (() => { try { return sb.currentSession().sessionId; } catch { return ""; } })();
  return {
    name: sb.name,
    url: (() => { try { return sb.domain(AGENT_PORT); } catch { return ""; } })(),
    status: sb.status,
    session,
    async run(script) {
      const r = await sb.runCommand({ cmd: "bash", args: ["-lc", script] });
      return { code: r.exitCode ?? -1, out: (await r.output("both")).slice(-40_000) };
    },
    async spawn(script) {
      await sb.runCommand({ cmd: "bash", args: ["-lc", script], detached: true });
    },
    async write(files) {
      await sb.writeFiles(files);
    },
    async stop() {
      await sb.stop();
    },
    async remove() {
      await sb.delete();
      // A deleted sandbox keeps its saved snapshots until they expire: delete them too, so the scene and frames are really gone.
      const { Snapshot } = await load();
      for await (const s of await Snapshot.list({ name: sb.name })) {
        const id = (s as { id?: string }).id;
        if (id) await Snapshot.get({ snapshotId: id }).then((snap) => snap.delete()).catch(() => undefined);
      }
    },
  };
}

const notFound = (e: unknown) => /not.?found|404|does not exist/i.test(e instanceof Error ? `${e.message} ${(e as { status?: number }).status ?? ""}` : String(e));

/** The real machines (Vercel Sandbox). Credentials come from the deployment's OIDC token, so no key is stored anywhere. */
export const sandboxMachines: Machines = {
  async create(o) {
    const { Sandbox } = await load();
    const sb = await Sandbox.create({
      name: o.name,
      source: { type: "snapshot", snapshotId: o.snapshotId },
      resources: { vcpus: o.vcpus },
      timeout: o.sessionMinutes * 60_000,
      ports: [AGENT_PORT],
      networkPolicy: "deny-all",
      persistent: true,
      snapshotExpiration: (o.keepDays + 1) * 864e5,
      keepLastSnapshots: { count: 1, deleteEvicted: true },
      tags: { app: "keplar", kind: "blender-render", job: o.jobId },
    });
    return wrap(sb);
  },
  async get(name, resume) {
    const { Sandbox } = await load();
    try {
      return wrap(await Sandbox.get({ name, ...(resume ? { resume: true } : {}) }));
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  },
  async buildImage() {
    const { Sandbox } = await load();
    const sb = await Sandbox.create({ resources: { vcpus: 4 }, timeout: 20 * 60_000, persistent: false, tags: { app: "keplar", kind: "blender-image" } });
    try {
      const r = await sb.runCommand({ cmd: "bash", args: ["-lc", installScript()] });
      const out = (await r.output("both")).trim();
      if (r.exitCode !== 0 || !out.includes(`Blender ${BLENDER.version}`)) throw new Error(`The Blender image did not build: ${out.slice(-300)}`);
      const snap = await sb.snapshot({ expiration: 0 });
      return { snapshotId: snap.snapshotId, blender: BLENDER.version };
    } catch (e) {
      await sb.stop().catch(() => undefined);
      throw e;
    }
  },
  async listNames() {
    const { Sandbox } = await load();
    const names: string[] = [];
    for await (const s of await Sandbox.list({ tags: { kind: "blender-render" } })) names.push((s as { name: string }).name);
    return names;
  },
  async dropImage(snapshotId) {
    const { Snapshot } = await load();
    await Snapshot.get({ snapshotId }).then((s) => s.delete()).catch(() => undefined);
  },
};

/** Frame numbers as Blender's -f list: "1..24,30,32" (consecutive runs become ranges). */
export function frameArg(frames: number[]): string {
  const sorted = [...new Set(frames)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}..${sorted[j]}` : sorted.slice(i, j + 1).join(","));
    i = j + 1;
  }
  return parts.join(",");
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Starts the agent on its port unless it already runs (each new session needs it again). */
export const agentScript = () => `curl -fs -m 2 http://127.0.0.1:${AGENT_PORT}/health >/dev/null || exec python3 /vercel/sandbox/agent.py ${AGENT_PORT}`;

/**
 * The render: Blender in the background on the uploaded scene, its scripts off (--disable-autoexec), the settings applied by
 * render.py, then the frames in `frames`. Its log and exit code land in the job folder for the worker to read.
 * Software OpenGL (Mesa) through EGL lets EEVEE render without a GPU.
 */
export function renderScript(frames: number[]): string {
  return [
    `cd ${JOB_DIR}`,
    "rm -f render.exit",
    `( EGL_PLATFORM=surfaceless KEPLAR_RENDER_CFG=${JOB_DIR}/settings.json /opt/blender/blender -b scene.blend --disable-autoexec --gpu-backend opengl --python-exit-code 3 --python /vercel/sandbox/render.py -f ${q(frameArg(frames))} > render.log 2>&1; echo $? > render.exit )`,
  ].join("\n");
}

/** Joins the rendered frames into out/video.mp4 (encode.py). */
export function encodeScript(): string {
  return [
    `cd ${JOB_DIR}`,
    "rm -f encode.exit",
    `( KEPLAR_RENDER_CFG=${JOB_DIR}/settings.json /opt/blender/blender -b --factory-startup --python-exit-code 3 --python /vercel/sandbox/encode.py > encode.log 2>&1; echo $? > encode.exit )`,
  ].join("\n");
}

export const killScript = () => "pkill -f /opt/blender/blender || true";

/** One look at the job folder: the output files, the exit codes, and the useful end of Blender's log. */
export const pollScript = () =>
  [
    `cd ${JOB_DIR} 2>/dev/null || exit 0`,
    'echo "@@OUT"; ls -1 out 2>/dev/null',
    'echo "@@SIZES"; for f in out/*; do [ -f "$f" ] && stat -c "%s %n" "$f"; done 2>/dev/null',
    'echo "@@ALIVE"; pgrep -x blender >/dev/null && echo 1',
    'echo "@@EXIT"; cat render.exit 2>/dev/null',
    'echo "@@VEXIT"; cat encode.exit 2>/dev/null',
    'echo "@@SCENE"; test -f scene.blend && stat -c %s scene.blend',
    "echo \"@@LOG\"; tail -c 8000 render.log 2>/dev/null | tr '\\r' '\\n' | grep -E 'Fra:|Saved:|Time:|rror|Killed|Unable|Warning: (Unable|Cannot)' | tail -n 40",
    "echo \"@@VLOG\"; tail -c 2000 encode.log 2>/dev/null | grep -E 'rror|Saved|Append' | tail -n 5",
  ].join("\n");

export type Poll = { files: string[]; sizes: Map<string, number>; alive: boolean; exit: number | null; videoExit: number | null; sceneBytes: number | null; log: string[]; videoLog: string[] };

export function parsePoll(out: string): Poll {
  const sections = new Map<string, string[]>();
  let cur = "";
  for (const raw of out.split(/\r?\n/)) {
    const head = /^@@([A-Z]+)$/.exec(raw.trim());
    if (head) { cur = head[1]; sections.set(cur, []); continue; }
    if (cur && raw.trim()) sections.get(cur)!.push(raw.trim());
  }
  const sec = (name: string) => sections.get(name) ?? [];
  const num = (v: string | undefined) => (v !== undefined && /^-?\d+$/.test(v) ? Number(v) : null);
  const sizes = new Map<string, number>();
  for (const l of sec("SIZES")) {
    const m = /^(\d+) out\/(.+)$/.exec(l);
    if (m) sizes.set(m[2], Number(m[1]));
  }
  return { files: sec("OUT"), sizes, alive: sec("ALIVE")[0] === "1", exit: num(sec("EXIT")[0]), videoExit: num(sec("VEXIT")[0]), sceneBytes: num(sec("SCENE")[0]), log: sec("LOG"), videoLog: sec("VLOG") };
}

/** "00:38.25" or "01:02:03.5" -> seconds. */
export function clockSeconds(s: string): number | null {
  const m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
}

/** From Blender's log: the frame being rendered and its progress, each finished frame's time, and the last error. */
export function readLog(lines: string[]): { frame: number | null; progress: string; times: number[]; error: string | null } {
  let frame: number | null = null, progress = "", error: string | null = null;
  const times: number[] = [];
  for (const l of lines) {
    const fra = /Fra:\s*(-?\d+)/.exec(l);
    if (fra) {
      frame = Number(fra[1]);
      const tail = l.split("|").map((p) => p.trim()).filter((p) => p && !/^Fra:|^Mem:|^\d\d:\d\d/.test(p) && !/^render$/.test(p));
      progress = tail.join(" · ").slice(0, 120);
    }
    const t = /\bTime:\s*([\d:.]+)/.exec(l);
    if (t && /Saving/.test(l)) { const s = clockSeconds(t[1]); if (s !== null) times.push(s); }
    if (/Killed/.test(l)) error = "The render machine ran out of memory.";
    // EGL notices come from software OpenGL starting up and are harmless.
    else if (/Error|rror:|Unable|Cannot/.test(l) && !/Warning:|EGL/.test(l)) error = l.replace(/^\d\d:\d\d[.\d]*\s+\w+\s+\|\s*/, "").slice(0, 200);
  }
  return { frame, progress, times, error };
}
