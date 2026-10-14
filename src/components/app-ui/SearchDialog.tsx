"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/kit";
import { IconSearch } from "./icons";
import type { Thread, View } from "./state/types";
import s from "./App.module.css";
import { saveThemePref } from "@/lib/theme";
import { rankCommands, staticCommands } from "@/lib/nav/commands";

type Group = "Go to" | "Settings" | "Pages";
type Item =
  | { kind: "thread"; id: string; title: string; snippet: string }
  | { kind: "action"; id: string; title: string; run: () => void; group: Group; keywords?: string };

const go = (href: string) => () => { window.location.assign(href); };
/** Every page of the site, for typed queries (the app's Cmd-K reaches everything the site palette does). */
const PAGES = staticCommands();

type Props = {
  threads: Thread[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onView: (v: View) => void;
};

function snippet(text: string, needle: string) {
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return "";
  const start = Math.max(0, i - 40);
  return `${start > 0 ? "…" : ""}${text.slice(start, i + needle.length + 70).replace(/[#*`|]/g, "").replace(/\s+/g, " ")}…`;
}

/**
 * Cmd+K in the app: chats, places, settings and every site page. The app renders it only while open, inside the kit Dialog
 * (a native modal <dialog>: Escape, the backdrop and Close dismiss it; focus starts in the field and returns where it was).
 */
export function SearchDialog({ threads, onClose, onOpen, onNew, onView }: Props) {
  const uid = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const actions: Item[] = [
      { kind: "action", group: "Go to", id: "new", title: "New chat", run: onNew, keywords: "ask question thread" },
      { kind: "action", group: "Go to", id: "create", title: "Create", run: () => onView("create"), keywords: "app site image video mobile build" },
      { kind: "action", group: "Go to", id: "projects", title: "Projects", run: () => onView("projects"), keywords: "folders files" },
      { kind: "action", group: "Go to", id: "slides", title: "Slides", run: () => onView("slides"), keywords: "deck presentation" },
      { kind: "action", group: "Go to", id: "study", title: "Study", run: () => onView("study"), keywords: "flashcards quiz learn" },
      { kind: "action", group: "Go to", id: "wants", title: "Keplar Wants", run: () => onView("wants"), keywords: "i want get it done order buy book build anything" },
      { kind: "action", group: "Go to", id: "deployments", title: "Deployments", run: () => onView("deployments"), keywords: "publish live sites" },
      { kind: "action", group: "Go to", id: "history", title: "All chats", run: () => onView("history"), keywords: "history past threads" },
      { kind: "action", group: "Settings", id: "settings", title: "Settings", run: go("/account"), keywords: "account preferences" },
      { kind: "action", group: "Settings", id: "plan", title: "Plan & billing", run: go("/account#plan"), keywords: "upgrade change plan subscription invoices billing" },
      { kind: "action", group: "Settings", id: "pricing", title: "Change plan", run: go("/pricing"), keywords: "upgrade pricing plans" },
      { kind: "action", group: "Settings", id: "usage", title: "Usage", run: go("/account#usage"), keywords: "credits limits left" },
      { kind: "action", group: "Settings", id: "memory", title: "Memory", run: go("/account#memory"), keywords: "remember forget" },
      { kind: "action", group: "Settings", id: "language", title: "Language", run: go("/account#language"), keywords: "translate locale" },
      { kind: "action", group: "Settings", id: "theme-dark", title: "Theme: Dark", run: () => saveThemePref("dark"), keywords: "appearance mode" },
      { kind: "action", group: "Settings", id: "theme-light", title: "Theme: Light", run: () => saveThemePref("light"), keywords: "appearance mode" },
      { kind: "action", group: "Settings", id: "theme-auto", title: "Theme: Auto", run: () => saveThemePref("auto"), keywords: "appearance mode system" },
      { kind: "action", group: "Settings", id: "docs", title: "Help & docs", run: go("/docs"), keywords: "documentation guide support" },
    ];
    const matches: Item[] = [];
    for (const t of threads) {
      if (matches.length >= 8) break;
      if (!needle || t.title.toLowerCase().includes(needle)) {
        matches.push({ kind: "thread", id: t.id, title: t.title, snippet: "" });
        continue;
      }
      for (const m of t.messages) {
        const sn = snippet(m.role === "user" ? m.text : m.answer?.markdown ?? "", needle);
        if (sn) {
          matches.push({ kind: "thread", id: t.id, title: t.title, snippet: sn });
          break;
        }
      }
    }
    const hit = (a: Item) => !needle || `${a.title} ${a.kind === "action" ? a.keywords ?? "" : ""}`.toLowerCase().includes(needle);
    const shown = actions.filter(hit);
    // Typed queries also search every site page (docs, pricing, changelog, guides…), after the app's own places.
    const titles = new Set(shown.map((a) => a.title.toLowerCase()));
    const pages: Item[] = needle ? rankCommands(PAGES, needle, 6).filter((c) => !titles.has(c.label.toLowerCase())).map((c) => ({ kind: "action", group: "Pages", id: `page:${c.href}`, title: c.label, run: go(c.href) })) : [];
    return [...matches, ...shown, ...pages];
  }, [q, threads, onNew, onView]);

  const [lastQ, setLastQ] = useState(q);
  if (lastQ !== q) {
    setLastQ(q);
    setActive(0);
  }

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === "thread") onOpen(item.id);
    else item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
    // Escape is the Dialog's (the native cancel). Tab keeps focus in the field: the list is driven by the arrows.
    else if (e.key === "Tab") { e.preventDefault(); inputRef.current?.focus(); }
  };

  const threadItems = items.filter((i) => i.kind === "thread");
  const groupItems = (g: Group) => items.filter((i) => i.kind === "action" && i.group === g);

  const renderItem = (item: Item) => {
    const idx = items.indexOf(item);
    return (
      <li
        key={`${item.kind}-${item.id}`}
        id={`${uid}-opt-${idx}`}
        role="option"
        aria-selected={idx === active}
        className={s.searchItem}
        onMouseEnter={() => setActive(idx)}
        onClick={() => choose(item)}
      >
        <span className={s.searchTitle}>{item.title}</span>
        {item.kind === "thread" && item.snippet ? <span className={s.searchSnippet}>{item.snippet}</span> : null}
      </li>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Search" size="lg" initialFocus={inputRef} className={s.search}>
      <div className={s.searchBody} onKeyDown={onKeyDown}>
        <div className={s.searchBar}>
          <IconSearch size={16} />
          <input
            ref={inputRef}
            className={s.searchInput}
            placeholder="Search chats, places and settings"
            aria-label="Search chats and Keplar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-activedescendant={items.length ? `${uid}-opt-${active}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className={s.kbd}>Esc</kbd>
        </div>
        <ul id={`${uid}-list`} role="listbox" className={s.searchList} aria-label="Results">
          {threadItems.length ? (
            <li role="presentation" className={s.searchGroup}>{q ? "Chats" : "Recent"}</li>
          ) : q ? (
            <li role="presentation" className={s.searchEmpty}>No chats match &ldquo;{q}&rdquo;.</li>
          ) : null}
          {threadItems.map(renderItem)}
          {(["Go to", "Settings", "Pages"] as const).map((g) => {
            const list = groupItems(g);
            return list.length ? [<li key={`g-${g}`} role="presentation" className={s.searchGroup}>{g}</li>, ...list.map(renderItem)] : null;
          })}
        </ul>
      </div>
    </Dialog>
  );
}
