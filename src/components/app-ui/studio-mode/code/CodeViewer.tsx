"use client";
/**
 * Read-only code view (CodeMirror, loaded on first mount). Until the editor has loaded, the same text is shown as plain
 * preformatted text, so nothing is hidden or invented while it loads.
 */
import { useEffect, useRef, useState } from "react";
import type { DocLanguage } from "./documents";
import type { LineRange } from "./line-diff";
import type { ViewerHandle } from "./cm";
import s from "./code.module.css";

export type CodeViewerProps = {
  content: string;
  language: DocLanguage;
  /** Lines to mark as actively changing (1-based, inclusive); the first one is scrolled into view when they change. */
  activeLines?: LineRange[];
  wrap?: boolean;
  /** Accessible name of the code region. */
  label?: string;
  className?: string;
};

export function CodeViewer({ content, language, activeLines = [], wrap = false, label, className }: CodeViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<ViewerHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ content, language, activeLines, wrap, label });
  useEffect(() => { latest.current = { content, language, activeLines, wrap, label }; });
  const activeKey = activeLines.map((r) => `${r.from}-${r.to}`).join(",");

  useEffect(() => {
    let dead = false;
    import("./cm").then((m) => {
      if (dead || !host.current) return;
      handle.current = m.createViewer(host.current, latest.current);
      setReady(true);
    }).catch((e: unknown) => { if (!dead) setError(e instanceof Error ? e.message : "The code view could not load."); });
    return () => { dead = true; handle.current?.destroy(); handle.current = null; };
  }, []);

  useEffect(() => {
    handle.current?.update(latest.current);
  }, [content, language, activeKey, wrap, ready]);

  return (
    <div className={`${s.editor} ${className ?? ""}`} data-ready={ready ? "true" : "false"}>
      <div ref={host} style={{ height: "100%" }} />
      {ready ? null : <pre className={s.fallback} style={{ position: "absolute", inset: 0 }} aria-label={label}>{error ? `${error}\n\n${content}` : content}</pre>}
    </div>
  );
}
