"use client";

import { useEffect, useRef, useState } from "react";
import { appendCapped, parseRunnerMsg, RUN_LIMITS, type RunLang } from "@/lib/sandbox/runner";
import { Button } from "@/components/kit";
import s from "./parity.module.css";

export { runnableLang } from "@/lib/sandbox/runner";

type Out = { text: string; err: boolean };

/**
 * Run button + output for a JavaScript or Python snippet. The code runs in a sandboxed frame in this browser
 * (src/lib/sandbox/runner.ts); nothing is sent to Keplar's servers. Python (via Pyodide) can draw matplotlib charts.
 */
export function CodeRunner({ code, lang, compact = false, autoRun = false }: { code: string; lang: RunLang; compact?: boolean; autoRun?: boolean }) {
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<Out[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const runId = useRef("");
  const total = useRef("");
  const guard = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = () => {
    if (guard.current) clearTimeout(guard.current);
    guard.current = null;
    frameRef.current?.remove();
    frameRef.current = null;
    runId.current = "";
  };
  useEffect(() => teardown, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const m = parseRunnerMsg(e.data);
      if (!m) return;
      if (m.type === "ready") {
        frameRef.current.contentWindow?.postMessage({ type: "run", id: runId.current, lang, code }, "*");
        return;
      }
      if (m.id !== runId.current) return;
      if (m.type === "status") setStatus(m.text);
      else if (m.type === "out" || m.type === "err") {
        const r = appendCapped(total.current, m.text);
        const added = r.text.slice(total.current.length);
        total.current = r.text;
        if (added) setOut((o) => [...o, { text: added, err: m.type === "err" }]);
        if (r.cut) setStatus("Output was cut at 20,000 characters.");
      } else if (m.type === "image") setImages((im) => (im.length < RUN_LIMITS.images ? [...im, m.src] : im));
      else if (m.type === "done") {
        setRunning(false);
        setStatus((st) => (st.startsWith("Output was cut") ? st : m.ok ? `Finished in ${(m.ms / 1000).toFixed(2)} s.` : "Stopped with an error."));
        teardown();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [code, lang]);

  const run = () => {
    teardown();
    setOut([]);
    setImages([]);
    total.current = "";
    setStatus("Starting the sandbox...");
    setRunning(true);
    runId.current = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");
    f.setAttribute("aria-hidden", "true");
    f.setAttribute("tabindex", "-1");
    f.title = "Code runner";
    f.style.display = "none";
    f.src = "/apps/code-runner";
    document.body.appendChild(f);
    frameRef.current = f;
    // Backstop if the frame itself hangs: it enforces its own limit, this one is a little longer.
    const limit = (lang === "python" ? RUN_LIMITS.pyMs : RUN_LIMITS.jsMs) + 5000;
    guard.current = setTimeout(() => { setRunning(false); setStatus("Stopped: the sandbox stopped responding."); teardown(); }, limit);
  };
  const stop = () => { setRunning(false); setStatus("Stopped."); teardown(); };
  const started = useRef(false);
  useEffect(() => { if (autoRun && !started.current) { started.current = true; run(); } });

  return (
    <div className={s.runner} data-code-runner="" data-compact={compact ? "" : undefined}>
      <div className={s.row}>
        {running
          ? <Button size="sm" variant="secondary" onClick={stop}>Stop</Button>
          : <Button size="sm" variant="secondary" onClick={run} aria-label={`Run this ${lang === "python" ? "Python" : "JavaScript"} in a sandbox`}>Run</Button>}
        <span className={s.muted}>{lang === "python" ? "Python" : "JavaScript"} · runs in a sandbox in this browser, with no access to your account or the network</span>
      </div>
      {out.length || images.length || status ? (
        <div className={s.runOut} aria-live="polite">
          {out.length ? <pre>{out.map((o, i) => <span key={i} data-err={o.err ? "" : undefined}>{o.text}</span>)}</pre> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- in-memory PNG data URLs from the sandbox, nothing to optimize */}
          {images.map((src, i) => <img key={i} src={src} alt={`Chart ${i + 1} drawn by the code`} />)}
          {status ? <p className={s.muted}>{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
