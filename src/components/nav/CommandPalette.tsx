"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OPEN_PALETTE_EVENT, rankCommands, staticCommands, type Command } from "@/lib/nav/commands";
import s from "./CommandPalette.module.css";
import { lockScroll } from "@/lib/ui/scroll-lock";
import { usePresence } from "@/components/motion/usePresence";

type DocEntry = { p: string; t: string; d: string; k: string };

/** Headings with an id on the current page: the "jump to section" part of the palette. */
function pageSections(): Command[] {
  const main = document.getElementById("main") ?? document.body;
  return [...main.querySelectorAll<HTMLElement>("h2[id], h3[id], section[id][aria-labelledby], [data-section][id]")]
    .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
    .slice(0, 40)
    .map((el) => {
      const label = (el.matches("h2,h3") ? el.textContent : document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? el.dataset.section ?? el.id) ?? el.id;
      return { id: `sec:${el.id}`, label: label.trim().slice(0, 80) || el.id, href: `#${el.id}`, group: "On this page" as const };
    })
    .filter((c) => c.label);
}

/**
 * Cmd/Ctrl-K command palette: pages, features, docs, settings, and the current page's sections.
 * WAI-ARIA combobox + listbox in a modal dialog: focus moves in on open, Tab is trapped, Escape closes, focus returns to the opener.
 * The docs index loads only on first open; nothing is fetched or rendered until then.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [docs, setDocs] = useState<Command[] | null>(null);
  const [sections, setSections] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();
  const titleId = useId();
  const presence = usePresence(open); // stays mounted while the exit plays (scrim fades, panel pops back to 96%)

  const show = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setSections(pageSections());
    setQ("");
    setActive(0);
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    const el = opener.current;
    opener.current = null;
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        // The /app shell has its own Cmd+K (search your chats); the site palette stays out so two dialogs never stack.
        if (!open && document.querySelector("[data-own-search]")) return;
        e.preventDefault();
        if (open) hide();
        else show();
      }
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, [open, show, hide]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const release = lockScroll();
    if (docs === null) {
      fetch("/docs/search-index.json")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: DocEntry[]) => setDocs(rows.slice(0, 400).map((d) => ({ id: `doc:${d.p}`, label: d.t, href: d.p, group: "Docs" as const, hint: d.d?.slice(0, 90), keywords: d.k }))))
        .catch(() => setDocs([]));
    }
    return release;
  }, [open, docs]);

  const all = useMemo(() => [...sections, ...staticCommands(), ...(docs ?? [])], [sections, docs]);
  const results = useMemo(() => rankCommands(all, q, q ? 30 : 60), [all, q]);
  const clamped = Math.min(active, Math.max(0, results.length - 1));

  const go = useCallback((c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    opener.current = null;
    if (c.href.startsWith("#")) {
      const el = document.getElementById(c.href.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        el.focus({ preventScroll: true });
        history.replaceState(null, "", c.href);
      }
      return;
    }
    router.push(c.href);
  }, [router]);

  if (!presence.mounted) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); hide(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (results.length ? (Math.min(i, results.length - 1) + 1) % results.length : 0)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (results.length ? (Math.min(i, results.length - 1) - 1 + results.length) % results.length : 0)); return; }
    if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); setActive(0); return; }
    if (e.key === "End" && e.ctrlKey) { e.preventDefault(); setActive(Math.max(0, results.length - 1)); return; }
    if (e.key === "Enter") { e.preventDefault(); go(results[clamped]); return; }
    if (e.key === "Tab") {
      // Focus trap: the only tabbable things are the input and the close button.
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>("input,button") ?? [])];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  };

  const heads = results.map((c, i) => (i === 0 || results[i - 1].group !== c.group ? c.group : null));
  const activeId = results[clamped] ? `${listId}-${clamped}` : undefined;
  return (
    <div className={s.backdrop} data-o="CommandPalette backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) hide(); }} {...presence.motion("fade")} inert={presence.closing || undefined}>
      <div ref={dialogRef} className={s.dialog} data-o="CommandPalette dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} {...presence.motion("pop", false)} style={{ ["--m-origin" as string]: "50% 0" }}>
        <h2 id={titleId} className="visually-hidden">Go to a page, feature or section</h2>
        <div className={s.bar} data-o="CommandPalette bar">
          <svg className={s.icon} data-o="CommandPalette icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <input
            ref={inputRef}
            className={s.input}
            data-o="CommandPalette input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search pages, features, docs and settings"
            placeholder="Search pages, features, docs…"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
          />
          <button type="button" className={s.close} data-o="CommandPalette close" onClick={hide} aria-label="Esc: close search">Esc</button>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className={s.list} data-o="CommandPalette list">
          {results.map((c, i) => {
            const head = heads[i];
            return (
              <li key={c.id} role="presentation">
                {head ? <div className={s.group} data-o="CommandPalette group" role="presentation" aria-hidden="true">{head}</div> : null}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === clamped}
                  className={s.item}
                  data-o="CommandPalette item"
                  data-active={i === clamped || undefined}
                  onPointerMove={() => setActive(i)}
                  onClick={() => go(c)}
                >
                  <span className={s.label} data-o="CommandPalette label">{c.label}</span>
                  {c.hint ? <span className={s.hint} data-o="CommandPalette hint">{c.hint}</span> : null}
                  <span className="visually-hidden">, {c.group}</span>
                </div>
              </li>
            );
          })}
          {results.length === 0 ? <li className={s.empty} data-o="CommandPalette empty" role="presentation">{docs === null ? "Loading…" : `Nothing matches “${q}”.`}</li> : null}
        </ul>
        <p className={s.foot} data-o="CommandPalette foot" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</p>
        <p className="visually-hidden" aria-live="polite">{results.length} results</p>
      </div>
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Small trigger used in the nav. Shows the platform shortcut. */
export function PaletteButton({ className }: { className?: string }) {
  // Server renders "Ctrl K"; the client reads the platform without a hydration mismatch or an effect setState.
  const mac = useSyncExternalStore(noopSubscribe, () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent), () => false);
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} aria-label={`Search, ${mac ? "⌘K" : "Ctrl K"}`} aria-keyshortcuts="Control+K Meta+K">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      <kbd aria-hidden="true">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
