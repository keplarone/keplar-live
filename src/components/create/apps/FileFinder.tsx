"use client";
/**
 * Go to file (Ctrl+P / ⌘P), as in Cursor and VS Code: type part of a path, arrows to move, Enter to open, Esc to close.
 * Matching is a subsequence match ("pgfd" finds pages/feed.js) ranked by how tight and how early it matches, preferring
 * hits in the file name. Only the most recently opened code view answers the shortcut, so two views never both open.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rankPaths } from "./code-nav";
import s from "./studio.module.css";

const stack: symbol[] = [];

/** Ctrl+P / ⌘P opens this view's finder while it is the newest mounted code view. */
export function useGoToFile(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const me = Symbol("code-view");
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(me), 1);
    };
  }, []);
  return [open, setOpen];
}

export function FileFinder({ paths, onPick, onClose }: { paths: string[]; onPick: (p: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useId();
  const hits = useMemo(() => rankPaths(paths, q), [paths, q]);
  const sel = Math.min(idx, Math.max(0, hits.length - 1));
  useEffect(() => { input.current?.focus(); }, []);
  const pick = (p: string | undefined) => { if (p) { onPick(p); onClose(); } };
  return (
    <div className={s.finder} role="dialog" aria-label="Go to file" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <input
        ref={input}
        className={s.finderInput}
        value={q}
        placeholder="Go to file…"
        aria-label="File name"
        role="combobox"
        aria-expanded="true"
        aria-controls={list}
        aria-activedescendant={hits[sel] ? `${list}-${sel}` : undefined}
        onChange={(e) => { setQ(e.target.value); setIdx(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx(Math.min(sel + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(Math.max(sel - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(hits[sel]); }
        }}
        onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) onClose(); }}
      />
      <ul id={list} role="listbox" className={s.finderList} aria-label="Matching files">
        {hits.length ? hits.map((p, i) => (
          <li key={p} id={`${list}-${i}`} role="option" aria-selected={i === sel} className={s.finderItem} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseMove={() => setIdx(i)}>
            <span>{p.slice(p.lastIndexOf("/") + 1)}</span>
            <span className={s.fileDir}>{p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""}</span>
          </li>
        )) : <li className={s.finderEmpty}>No matching files</li>}
      </ul>
    </div>
  );
}
