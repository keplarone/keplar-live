"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import s from "./cursor.module.css";

export type Command = { id: string; label: string; section: string; icon?: React.ReactNode; hint?: string; keywords?: string; run: () => void };

/** Matches every typed word, in any order, against the label, section and keywords (case-insensitive). */
export function matches(c: Pick<Command, "label" | "section" | "keywords">, query: string): boolean {
  const hay = `${c.label} ${c.section} ${c.keywords ?? ""}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/**
 * The workspace's command palette (Ctrl+K or Cmd+K): jump to any place, project or report, or run an action, from the keyboard.
 * A modal dialog with a combobox and a listbox: arrows move, Enter runs, Escape closes and focus returns to where it was.
 */
export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const listId = useId();
  const shown = useMemo(() => commands.filter((c) => matches(c, query)).slice(0, 40), [commands, query]);

  useEffect(() => {
    if (!open) return;
    back.current = document.activeElement as HTMLElement | null;
    queueMicrotask(() => { setQuery(""); setIndex(0); input.current?.focus(); });
    return () => { back.current?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const run = (c: Command | undefined) => { if (!c) return; onClose(); c.run(); };
  const at = Math.min(index, Math.max(0, shown.length - 1));

  return (
    <div className={s.paletteScrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.palette} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className={s.paletteInput}>
          <span aria-hidden="true">›</span>
          <input
            ref={input}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => (shown.length ? (i + 1) % shown.length : 0)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0)); }
              else if (e.key === "Enter") { e.preventDefault(); run(shown[at]); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
              else if (e.key === "Tab") e.preventDefault(); // focus stays in the palette
            }}
            placeholder="Jump to a place, project or report, or run a command"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown[at] ? `${listId}-${shown[at]!.id}` : undefined}
            aria-autocomplete="list"
            aria-label="Command"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {shown.length ? (
          <ul className={s.paletteList} id={listId} role="listbox" aria-label="Commands">
            {shown.map((c, i) => {
              const head = i === 0 || shown[i - 1]!.section !== c.section ? c.section : null;
              return (
                <li key={c.id} role="presentation">
                  {head ? <div className={s.paletteSection} aria-hidden="true">{head}</div> : null}
                  <div id={`${listId}-${c.id}`} role="option" aria-selected={i === at} className={s.paletteOption} onMouseMove={() => setIndex(i)} onClick={() => run(c)}>
                    {c.icon}
                    <span className={s.ellipsis}>{c.label}</span>
                    {c.hint ? <span className={s.paletteHint}>{c.hint}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className={s.paletteEmpty}>Nothing matches “{query}”.</p>}
        <div className={s.paletteFoot} aria-hidden="true"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
      </div>
    </div>
  );
}
