/**
 * Code runner (sandbox): runs JavaScript or Python from an answer or a draft in the person's own browser, never on Keplar's servers.
 *
 * Isolation, layer by layer:
 *  - an <iframe sandbox="allow-scripts"> (no allow-same-origin): an opaque origin with no access to Keplar's cookies, storage or DOM;
 *  - the runner page's own CSP: no network except the pinned Pyodide CDN (to load Python itself), no forms, no frames, no navigation;
 *  - the code runs in a Web Worker inside that frame, terminated on a time limit; the parent also removes the frame if it stops answering;
 *  - output is capped and shown as text (charts as PNG data URLs only).
 */
export const PYODIDE_VERSION = "0.27.7";
export const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
export const RUN_LIMITS = { jsMs: 10_000, pyMs: 60_000, outputChars: 20_000, images: 6, codeChars: 60_000 } as const;

export type RunLang = "javascript" | "python";

/** Fence languages the runner accepts. TypeScript is not compiled, so it is not offered. */
export function runnableLang(lang: string): RunLang | null {
  const l = lang.trim().toLowerCase();
  if (l === "js" || l === "javascript" || l === "mjs" || l === "node") return "javascript";
  if (l === "py" || l === "python" || l === "python3") return "python";
  return null;
}

export const RUNNER_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${PYODIDE_BASE}`,
  "worker-src blob:",
  `connect-src ${PYODIDE_BASE}`,
  "img-src data:",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'self'",
].join("; ");

/** Appends to an output buffer without passing the cap; returns the new text and whether it was cut. */
export function appendCapped(cur: string, add: string, cap: number = RUN_LIMITS.outputChars): { text: string; cut: boolean } {
  if (cur.length >= cap) return { text: cur, cut: true };
  const next = cur + add;
  return next.length > cap ? { text: next.slice(0, cap), cut: true } : { text: next, cut: false };
}

/** Messages the runner frame may send; anything else is ignored. */
export type RunnerMsg =
  | { type: "ready" }
  | { type: "out" | "err"; id: string; text: string }
  | { type: "image"; id: string; src: string }
  | { type: "status"; id: string; text: string }
  | { type: "done"; id: string; ok: boolean; ms: number };

export function parseRunnerMsg(v: unknown): RunnerMsg | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (m.type === "ready") return { type: "ready" };
  if (typeof m.id !== "string") return null;
  if ((m.type === "out" || m.type === "err" || m.type === "status") && typeof m.text === "string") return { type: m.type, id: m.id, text: m.text.slice(0, 4000) };
  if (m.type === "image" && typeof m.src === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(m.src) && m.src.length < 4_000_000) return { type: "image", id: m.id, src: m.src };
  if (m.type === "done") return { type: "done", id: m.id, ok: m.ok === true, ms: typeof m.ms === "number" ? m.ms : 0 };
  return null;
}
