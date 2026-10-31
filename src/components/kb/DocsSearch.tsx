"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import s from "./kb.module.css";

type Entry = { p: string; t: string; d: string; s: string; h: string; k: string };

const score = (e: Entry, terms: string[]) => {
  let total = 0;
  for (const w of terms) {
    const t = e.t.toLowerCase();
    let hit = 0;
    if (t.includes(w)) hit += t.startsWith(w) ? 6 : 4;
    if (e.k.toLowerCase().includes(w)) hit += 3;
    if (e.h.toLowerCase().includes(w)) hit += 2;
    if (e.d.toLowerCase().includes(w)) hit += 1;
    if (!hit) return 0; // every word must match somewhere
    total += hit;
  }
  return total;
};

/** Client-side docs search over a small static index (title, description, headings, keywords). Loaded on first focus. */
export function DocsSearch() {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = () => {
    if (index) return;
    fetch("/docs/search-index.json").then((r) => r.json()).then(setIndex).catch(() => setIndex([]));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        box.current?.querySelector("input")?.focus();
      }
    };
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as globalThis.Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDoc); };
  }, []);

  const terms = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const results = index && terms.length
    ? index.map((e) => ({ e, v: score(e, terms) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8).map((x) => x.e)
    : [];

  return (
    <div className={s.searchWrap} ref={box} role="search">
      <input
        className={s.searchInput}
        data-o="kb searchInput"
        type="search"
        role="combobox"
        value={q}
        placeholder="Search docs   ( / )"
        aria-label="Search the docs"
        aria-controls={`${id}-r`}
        aria-expanded={open && terms.length > 0}
        autoComplete="off"
        onFocus={() => { load(); setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && results[active]) { router.push(results[active].p); setOpen(false); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && terms.length > 0 ? (
        <ul className={s.results} id={`${id}-r`}>
          {!index ? <li className={s.none}>Loading…</li> : results.length ? results.map((r, i) => (
            <li key={r.p}>
              <a href={r.p} data-active={i === active} onClick={(ev) => { ev.preventDefault(); router.push(r.p); setOpen(false); }}>
                <em>{r.s}</em>
                <span style={{ display: "block" }}>{r.t}</span>
                <small>{r.d.length > 110 ? `${r.d.slice(0, 108)}…` : r.d}</small>
              </a>
            </li>
          )) : <li className={s.none}>No pages match “{q}”. Try a shorter word, such as “routing” or “credits”.</li>}
        </ul>
      ) : null}
    </div>
  );
}
