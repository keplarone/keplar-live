"use client";

import { useState } from "react";
import s from "./kb.module.css";

/** Copies a code block. Falls back to a hidden textarea where the async clipboard API is unavailable. */
export function CopyButton({ text, label = "code" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button type="button" className={s.copy} onClick={copy} aria-label={done ? `Copied ${label}` : `Copy ${label}`}>
      {done ? "Copied" : "Copy"}
      <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{done ? "Copied to clipboard" : ""}</span>
    </button>
  );
}
