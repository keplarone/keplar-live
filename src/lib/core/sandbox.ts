/**
 * Runs short JavaScript that Keplar's own models wrote to check a calculation or test a function. Not a general code
 * runner for people (that is the code-execution feature); this exists so Core can verify math and code by executing it.
 *
 * Isolation, layered: a separate worker thread with small heap limits, killed after the time limit; inside it a fresh
 * V8 context with no host objects at all (no require, process, fetch, timers or file system), string-to-code generation
 * (eval, new Function) and WebAssembly switched off, and a synchronous time limit that also covers promise callbacks.
 * Output is text only, capped.
 */
import { Worker } from "node:worker_threads";

export type RunResult = { ok: boolean; logs: string; result?: string; error?: string; ms: number };

const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");
let logs = "", result, error;
try {
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: "afterEvaluate" });
  vm.runInContext("var __out=[];var __fmt=function(a){try{return typeof a==='string'?a:(typeof a==='bigint'?a.toString()+'n':JSON.stringify(a))}catch(e){return String(a)}};var console={log:function(){__out.push(Array.prototype.map.call(arguments,__fmt).join(' '))}};console.error=console.log;console.warn=console.log;console.info=console.log;", ctx);
  try {
    const v = vm.runInContext(workerData.code, ctx, { timeout: workerData.timeoutMs, breakOnSigint: false });
    if (v !== undefined) result = vm.runInContext("__fmt", ctx)(v);
  } catch (e) {
    error = String((e && e.message) || e).slice(0, 600);
  }
  logs = String(vm.runInContext("__out.join('\\\\n')", ctx));
} catch (e) {
  error = String((e && e.message) || e).slice(0, 600);
}
parentPort.postMessage({ logs: logs.slice(0, 8000), result: result === undefined ? undefined : String(result).slice(0, 2000), error });
`;

/** Runs `code` and resolves with what it printed. Never throws. */
export function runJs(code: string, timeoutMs = 1500): Promise<RunResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: Omit<RunResult, "ms">) => {
      if (settled) return;
      settled = true;
      clearTimeout(kill);
      void worker.terminate().catch(() => undefined);
      resolve({ ...r, ms: Date.now() - started });
    };
    let worker: Worker;
    try {
      worker = new Worker(WORKER, { eval: true, workerData: { code: String(code).slice(0, 20_000), timeoutMs }, resourceLimits: { maxOldGenerationSizeMb: 48, maxYoungGenerationSizeMb: 8, codeRangeSizeMb: 8, stackSizeMb: 2 }, env: {}, stdout: true, stderr: true });
    } catch (e) {
      resolve({ ok: false, logs: "", error: `Sandbox unavailable: ${e instanceof Error ? e.message : "error"}`, ms: 0 });
      return;
    }
    const kill = setTimeout(() => done({ ok: false, logs: "", error: "Timed out." }), timeoutMs + 1500);
    worker.once("message", (m: { logs: string; result?: string; error?: string }) => done({ ok: !m.error, logs: m.logs, result: m.result, error: m.error }));
    worker.once("error", (e) => done({ ok: false, logs: "", error: e instanceof Error ? e.message.slice(0, 300) : "Sandbox error." }));
    worker.once("exit", (c) => done({ ok: false, logs: "", error: c ? `Stopped (exit ${c}).` : "Stopped." }));
  });
}
