"use client";

import { Children, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "./account.module.css";

export type SettingsSection = { id: string; label: string; keywords: string; node: ReactNode };

/** One 18px line icon per category (unknown ids get a dot). Stroke uses currentColor so active/hover colors carry through. */
const ICON: Record<string, ReactNode> = {
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  general: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  appearance: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" /></>,
  accessibility: <><circle cx="12" cy="4.5" r="1.5" /><path d="M5 8l7 1.5L19 8M12 9.5V14l-3 6M12 14l3 6" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  notifications: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  personalization: <path d="M12 3l2.2 5.4L20 9l-4.5 3.8L17 19l-5-3-5 3 1.5-6.2L4 9l5.8-.6z" />,
  memory: <><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1z" /><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" /></>,
  plan: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
  usage: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  security: <><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  privacy: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.2 2.6 3.5 5.5" /></>,
  developer: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
};
const Icon = ({ id }: { id: string }) => (
  <svg className={s.navIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICON[id] ?? <circle cx="12" cy="12" r="3" />}
  </svg>
);

/**
 * Settings categories + search, laid out like a desktop settings window: the category rail on the left (a swipeable row on
 * phones), the chosen category on the right in its own scroll area. Categories are real tabs: one panel shows at a time,
 * the active tab is marked, and the URL hash follows it (so /account#memory, /account#data and /account#usage still land on the
 * right panel). Every panel stays mounted (hidden, not removed) so form state survives tab switches and searching. While
 * searching, every matching panel is shown together and the rail only lists matches. Search matches the category name, its
 * keywords and the text of the panel itself.
 */
export function SettingsSections({ sections, initial }: { sections: SettingsSection[]; initial?: string }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(initial ?? sections[0]?.id ?? "");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const inputId = useId();
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const term = q.trim().toLowerCase();

  // Index the rendered text of each panel once after mount, so "invoice", "passkey" or "delete" find the panel that says it.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next: Record<string, string> = {};
      root.current?.querySelectorAll<HTMLElement>("[data-sec]").forEach((el) => { next[el.dataset.sec ?? ""] = (el.textContent ?? "").toLowerCase(); });
      setTexts(next);
    }, 0);
    return () => window.clearTimeout(t);
  }, [sections]);

  const visible = useMemo(() => {
    if (!term) return new Set(sections.map((x) => x.id));
    const words = term.split(/\s+/);
    return new Set(sections.filter((x) => { const hay = `${x.label} ${x.keywords} ${texts[x.id] ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); }).map((x) => x.id));
  }, [sections, term, texts]);

  const select = useCallback((id: string, opts?: { focus?: boolean; hash?: boolean }) => {
    setActive(id);
    if (opts?.hash !== false) window.history.replaceState(window.history.state, "", `#${id}`);
    if (opts?.focus) tabRefs.current[id]?.focus({ preventScroll: true }); // preventScroll: never move the page behind the dialog
    pane.current?.scrollTo({ top: 0 }); // each category starts at its top
  }, []);

  // Deep links: #memory, #data, #usage, #sec-plan … open the panel that contains that element.
  useEffect(() => {
    const open = () => {
      const raw = decodeURIComponent(window.location.hash.slice(1));
      if (!raw) return;
      const el = document.getElementById(raw);
      const holder = el?.closest<HTMLElement>("[data-sec]");
      const id = holder?.dataset.sec ?? sections.find((x) => x.id === raw)?.id;
      if (!id) return;
      setQ("");
      setActive(id);
      if (el && holder && el !== holder) window.setTimeout(() => el.scrollIntoView({ block: "start" }), 60); // scrolls the pane, which is the nearest scroller
    };
    const t = window.setTimeout(open, 0);
    window.addEventListener("hashchange", open);
    return () => { window.clearTimeout(t); window.removeEventListener("hashchange", open); };
  }, [sections]);

  // Phones: the rail is one sideways-scrolling row; keep the active tab in view by scrolling ONLY that strip
  // (Element.scrollIntoView would also scroll the page).
  useEffect(() => {
    const chip = tabRefs.current[active];
    const strip = chip?.parentElement;
    if (!strip || !chip || strip.scrollWidth <= strip.clientWidth + 1) return;
    const target = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  const tabs = sections.filter((x) => visible.has(x.id));
  const current = visible.has(active) || !term ? active : (tabs[0]?.id ?? active);
  const searching = term.length > 0;
  const currentLabel = sections.find((x) => x.id === current)?.label ?? "";

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = tabs.length;
    if (!n) return;
    const go = e.key === "ArrowDown" || e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (go < 0) return;
    e.preventDefault();
    select(tabs[go].id, { focus: true, hash: !searching });
  }

  return (
    <div className={s.settings} ref={root}>
      <aside className={s.rail}>
        <div className={s.settingsSearch}>
          <label htmlFor={inputId} className="visually-hidden">Search settings</label>
          <div className={s.searchWrap}>
            <svg className={s.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input
              id={inputId}
              type="search"
              className={`${s.input} ${s.searchInput}`}
              placeholder="Search settings"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }}
              autoComplete="off"
              enterKeyHint="search"
            />
            {q ? <button type="button" className={s.searchClear} onClick={() => { setQ(""); document.getElementById(inputId)?.focus(); }} aria-label="Clear search">✕</button> : null}
          </div>
        </div>
        <div role="tablist" aria-label="Settings categories" aria-orientation="vertical" className={s.settingsNav}>
          {sections.map((x) => {
            const i = tabs.findIndex((t) => t.id === x.id);
            const on = !searching && x.id === current;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`tab-${x.id}`}
                aria-selected={x.id === current}
                aria-controls={`sec-${x.id}`}
                tabIndex={x.id === current ? 0 : -1}
                data-on={on || undefined}
                className={s.navItem}
                hidden={!visible.has(x.id)}
                ref={(el) => { tabRefs.current[x.id] = el; }}
                onKeyDown={(e) => onKey(e, i)}
                onClick={() => { if (searching) setQ(""); select(x.id); }}
              ><Icon id={x.id} /><span>{x.label}</span></button>
            );
          })}
        </div>
        <p className={searching && !visible.size ? s.note : "visually-hidden"} role="status" aria-live="polite">{!searching ? "" : visible.size ? `${visible.size} of ${sections.length} categories match.` : `No settings match “${q.trim()}”.`}</p>
      </aside>
      <div className={s.pane} ref={pane}>
        {!searching ? <h2 className={s.paneTitle}>{currentLabel}</h2> : null}
        {sections.map((x) => (
          <section key={x.id} id={`sec-${x.id}`} data-sec={x.id} role="tabpanel" aria-labelledby={`tab-${x.id}`} hidden={searching ? !visible.has(x.id) : x.id !== current} className={s.settingsSection}>
            {searching ? <h2 className={s.paneTitle}>{x.label}</h2> : null}
            {Children.toArray(x.node) /* keys the parts: a server-rendered fragment arrives as a plain array */}
          </section>
        ))}
        {searching && !visible.size ? <p className={s.note}>Try a shorter word, like “theme”, “memory” or “billing”.</p> : null}
      </div>
    </div>
  );
}
