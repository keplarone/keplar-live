/**
 * The code runner frame (src/lib/sandbox/runner.ts). Served under /apps/ because that prefix is outside the app CSP in next.config.ts;
 * this page sets its own, stricter CSP. Loaded only inside <iframe sandbox="allow-scripts"> by CodeRunner.tsx. Static: no user data.
 */
import { PYODIDE_BASE, RUN_LIMITS, RUNNER_CSP } from "@/lib/sandbox/runner";

export const dynamic = "force-static";

const WORKER = String.raw`
const post = (m) => self.postMessage(m);
let id = "";
const fmt = (a) => a.map((x) => { try { return typeof x === "string" ? x : JSON.stringify(x, null, 2) ?? String(x); } catch { return String(x); } }).join(" ");
self.onmessage = async (e) => {
  const { lang, code } = e.data; id = e.data.id;
  const t0 = Date.now();
  try {
    if (lang === "javascript") {
      const c = { log: (...a) => post({ type: "out", id, text: fmt(a) + "\n" }), info: (...a) => post({ type: "out", id, text: fmt(a) + "\n" }), warn: (...a) => post({ type: "err", id, text: fmt(a) + "\n" }), error: (...a) => post({ type: "err", id, text: fmt(a) + "\n" }) };
      self.console = Object.assign(self.console || {}, c);
      const fn = new Function("console", "return (async () => {\n" + code + "\n})()");
      const r = await fn(c);
      if (r !== undefined) post({ type: "out", id, text: fmt([r]) + "\n" });
    } else {
      post({ type: "status", id, text: "Loading Python (first run downloads about 10 MB)..." });
      importScripts("${PYODIDE_BASE}pyodide.js");
      const py = await loadPyodide({ indexURL: "${PYODIDE_BASE}" });
      py.setStdout({ batched: (s) => post({ type: "out", id, text: s + "\n" }) });
      py.setStderr({ batched: (s) => post({ type: "err", id, text: s + "\n" }) });
      if (/\bimport\b|\bfrom\b/.test(code)) { post({ type: "status", id, text: "Loading packages..." }); await py.loadPackagesFromImports(code, { messageCallback: (m) => post({ type: "status", id, text: String(m).slice(0, 200) }), errorCallback: (m) => post({ type: "status", id, text: String(m).slice(0, 200) }) }); }
      const usesPlot = /matplotlib/.test(code);
      if (usesPlot) await py.runPythonAsync("import matplotlib\nmatplotlib.use('AGG')");
      post({ type: "status", id, text: "Running..." });
      const r = await py.runPythonAsync(code);
      if (r !== undefined && r !== null) post({ type: "out", id, text: String(r) + "\n" });
      if (usesPlot) {
        const imgs = py.runPython("import io, base64\nimport matplotlib.pyplot as _plt\n_out = []\nfor _n in _plt.get_fignums()[:${RUN_LIMITS.images}]:\n    _b = io.BytesIO(); _plt.figure(_n).savefig(_b, format='png', dpi=110, bbox_inches='tight'); _out.append(base64.b64encode(_b.getvalue()).decode())\n_plt.close('all')\n_out").toJs();
        for (const b of imgs) post({ type: "image", id, src: "data:image/png;base64," + b });
      }
    }
    post({ type: "done", id, ok: true, ms: Date.now() - t0 });
  } catch (err) {
    post({ type: "err", id, text: String(err && err.message ? err.message : err) + "\n" });
    post({ type: "done", id, ok: false, ms: Date.now() - t0 });
  }
};`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Keplar code runner</title></head><body><script>
const WORKER_SRC = ${JSON.stringify(WORKER)};
let worker = null, timer = null;
const stop = () => { if (worker) { worker.terminate(); worker = null; } if (timer) { clearTimeout(timer); timer = null; } };
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const m = e.data || {};
  if (m.type === "stop") { stop(); return; }
  if (m.type !== "run" || typeof m.code !== "string" || typeof m.id !== "string") return;
  stop();
  worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
  worker.onmessage = (ev) => { parent.postMessage(ev.data, "*"); if (ev.data && ev.data.type === "done") stop(); };
  worker.onerror = (ev) => { parent.postMessage({ type: "err", id: m.id, text: String(ev.message || "Error") + "\\n" }, "*"); parent.postMessage({ type: "done", id: m.id, ok: false, ms: 0 }, "*"); stop(); };
  const limit = m.lang === "python" ? ${RUN_LIMITS.pyMs} : ${RUN_LIMITS.jsMs};
  timer = setTimeout(() => { stop(); parent.postMessage({ type: "err", id: m.id, text: "Stopped: the time limit (" + limit / 1000 + " s) was reached.\\n" }, "*"); parent.postMessage({ type: "done", id: m.id, ok: false, ms: limit }, "*"); }, limit);
  worker.postMessage({ id: m.id, lang: m.lang, code: m.code.slice(0, ${RUN_LIMITS.codeChars}) });
});
parent.postMessage({ type: "ready" }, "*");
</script></body></html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": RUNNER_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=3600",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  });
}
