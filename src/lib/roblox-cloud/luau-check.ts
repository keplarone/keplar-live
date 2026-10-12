/**
 * Deterministic Luau checks for Roblox Cloud: Luau's own parser and type checker (the official WebAssembly build in
 * vendor/luau, release 0.742), run in a worker thread so a crash or a hang in the checker never takes the job down with it.
 *
 * What it checks: syntax, unknown globals (typos such as `prnt`) and the type errors Luau finds in the script's own mode
 * (`--!strict`, `--!nonstrict` or the default). Roblox's built-in globals are declared as `any` first, so `game`, `Instance`
 * or `Vector3` are not reported, but Roblox API types are not checked: that needs Roblox Studio. Scripts over 28 KB are not
 * checked here (the build's string limit) and say so.
 */
import { Worker } from "node:worker_threads";
import path from "node:path";

export const LUAU_VERSION = "0.742";
export const LUAU_SHA256 = "b3f74781394ca5b8a5bf8075821cb9af3e93b5b53fd2e9383ce87c8d0452a5d2";
export const LUAU_FILE = () => path.join(process.cwd(), "vendor", "luau", "Luau.Web.js");
/** The build copies source onto a fixed stack; it crashes between 32 and 60 KB, so stay well under. */
export const MAX_CHECK_BYTES = 28 * 1024;
const CHECK_TIMEOUT_MS = 10_000;

/** Roblox engine globals, declared as `any` on one line ahead of the script so the analyzer knows they exist. */
export const ROBLOX_GLOBALS = [
  "game", "workspace", "Workspace", "script", "plugin", "shared", "settings", "UserSettings", "version", "printidentity", "stats", "Stats",
  "Instance", "Vector2", "Vector3", "Vector2int16", "Vector3int16", "CFrame", "Color3", "ColorSequence", "ColorSequenceKeypoint",
  "NumberSequence", "NumberSequenceKeypoint", "NumberRange", "UDim", "UDim2", "Rect", "Region3", "Region3int16", "Ray", "RaycastParams",
  "OverlapParams", "TweenInfo", "Enum", "BrickColor", "PhysicalProperties", "Axes", "Faces", "Font", "DateTime", "Random", "PathWaypoint",
  "Content", "SharedTable", "Path2DControlPoint", "RotationCurveKey", "FloatCurveKey", "DockWidgetPluginGuiInfo", "CatalogSearchParams",
  "task", "wait", "spawn", "delay", "tick", "time", "elapsedTime", "warn", "gcinfo",
] as const;

export type LuauProblem = { line: number; message: string; kind: "syntax" | "type" };
export type LuauResult = { checked: true; problems: LuauProblem[] } | { checked: false; reason: string };

const SYNTAX = /^(Expected (?!this to be|type )|Incomplete statement|Malformed|Unfinished|Statement spans|Unexpected|Unknown escape)/;

/** The script as the analyzer sees it: leading `--!` directives first (they must stay on top), then the globals line. */
export function withPrelude(source: string): { text: string; preludeLine: number } {
  const lines = source.split("\n");
  let i = 0;
  while (i < lines.length && /^\s*--!/.test(lines[i]!)) i++;
  const prelude = `local ${ROBLOX_GLOBALS.map((g) => `${g}: any`).join(", ")}`;
  return { text: [...lines.slice(0, i), prelude, ...lines.slice(i)].join("\n"), preludeLine: i + 1 };
}

/** Maps the analyzer's "N: message" lines back to the script's own line numbers. */
export function parseOutput(out: string, preludeLine: number): LuauProblem[] {
  const problems: LuauProblem[] = [];
  for (const raw of out.split("\n")) {
    const m = /^(\d+): (.+)$/.exec(raw.trim());
    if (!m) continue;
    const at = Number(m[1]);
    if (at === preludeLine) continue; // never about the person's code
    const shift = (n: number) => (n > preludeLine ? n - 1 : n);
    // Messages name other lines too ("to close 'function' at line 2"): map those back as well.
    const message = m[2]!.trim().replace(/\bline (\d+)\b/g, (_, n: string) => `line ${shift(Number(n))}`);
    problems.push({ line: shift(at), message, kind: SYNTAX.test(message) ? "syntax" : "type" });
  }
  return problems;
}

const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const M = require(workerData.file);
const ready = new Promise((res) => { if (M.calledRun) res(); else M.onRuntimeInitialized = res; });
parentPort.on("message", async ({ id, text }) => {
  await ready;
  try { parentPort.postMessage({ id, out: M.ccall("checkScript", "string", ["string"], [text]) }); }
  catch (e) { parentPort.postMessage({ id, crashed: String(e && e.message || e) }); }
});
`;

type Pending = { resolve: (r: { out?: string; crashed?: string }) => void; timer: NodeJS.Timeout };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function drop(reason: string) {
  const w = worker;
  worker = null;
  for (const [, p] of pending) { clearTimeout(p.timer); p.resolve({ crashed: reason }); }
  pending.clear();
  void w?.terminate().catch(() => undefined);
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(WORKER, { eval: true, workerData: { file: LUAU_FILE() }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
  w.on("message", (m: { id: number; out?: string; crashed?: string }) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    p.resolve(m);
    // After a crash the WebAssembly memory may be corrupt: start a fresh checker for the next script.
    if (m.crashed) drop("the checker crashed on an earlier script");
  });
  w.on("error", (e) => drop(`checker error: ${e instanceof Error ? e.message : "unknown"}`));
  w.on("exit", () => { if (worker === w) drop("the checker stopped"); });
  w.unref();
  worker = w;
  return w;
}

/** Checks one script. Never throws: a script that can't be checked says why. */
export async function checkLuau(source: string): Promise<LuauResult> {
  if (Buffer.byteLength(source, "utf8") > MAX_CHECK_BYTES) return { checked: false, reason: `over ${MAX_CHECK_BYTES / 1024} KB, so it is not checked in the cloud; Studio checks it when you apply` };
  const { text, preludeLine } = withPrelude(source);
  let w: Worker;
  try { w = getWorker(); } catch (e) { return { checked: false, reason: `the Luau checker could not start (${e instanceof Error ? e.message : "error"})` }; }
  const id = ++seq;
  const r = await new Promise<{ out?: string; crashed?: string }>((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); drop("timed out"); resolve({ crashed: "the checker took too long" }); }, CHECK_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, text });
  });
  if (r.crashed !== undefined) return { checked: false, reason: r.crashed };
  return { checked: true, problems: parseOutput(r.out ?? "", preludeLine) };
}

/** Stops the checker thread (tests). */
export function stopLuauChecker() { drop("stopped"); }
