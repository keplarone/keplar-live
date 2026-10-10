"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "./account.module.css";

export type SettingsSection = { id: string; label: string; keywords: string; node: ReactNode };

/**
 * Settings categories + search. Categories are real tabs: one panel shows at a time, the active tab is marked, and
 * the URL hash follows it (so /account#memory, /account#data and /account#usage still land on the right panel).
 * Every panel stays mounted (hidden, not removed) so form state in Memory / Devices / Your data survives tab switches
 * and searching. While searching, every matching panel is shown together and the tab row only lists matches.
 * Search matches the tab name, its keywords and the text of the panel itself.
 */
export function SettingsSections({ sections }: { sections: SettingsSection[] }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const inputId = useId();
  const root = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const picked = useRef<string | null>(null); // the tab the user just chose (not a deep link): scroll the page to its panel once
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
    picked.current = id;
    setActive(id);
    if (opts?.hash !== false) window.history.replaceState(null, "", `#${id}`);
    if (opts?.focus) tabRefs.current[id]?.focus({ preventScroll: true }); // preventScroll: focusing a sticky chip otherwise scrolls the window
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
      if (el && holder) window.setTimeout(() => el.scrollIntoView({ block: "start" }), 60);
    };
    const t = window.setTimeout(open, 0);
    window.addEventListener("hashchange", open);
    return () => { window.clearTimeout(t); window.removeEventListener("hashchange", open); };
  }, [sections]);

  // After a pick: keep the active tab in view inside the one-row (mobile) strip by scrolling ONLY that strip sideways.
  // (Element.scrollIntoView also scrolls the window, which yanked the page ~30-50px and un-stuck the tab bar on every click.)
  // If the bar is stuck (the page is scrolled past the settings header), start the new panel right under it instead of
  // letting the browser clamp the scroll position when a long panel is swapped for a short one.
  useEffect(() => {
    const strip = tabRefs.current[active]?.parentElement;
    const chip = tabRefs.current[active];
    if (strip && chip && strip.scrollWidth > strip.clientWidth + 1) {
      const target = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      strip.scrollTo({ left: Math.max(0, target), behavior: picked.current === active && !reduce ? "smooth" : "auto" });
    }
    if (picked.current !== active) return;
    picked.current = null;
    const bar = strip?.parentElement;
    const panel = document.getElementById(`sec-${active}`);
    if (bar && panel) {
      const stuckAt = parseFloat(getComputedStyle(bar).top) || 0;
      const under = stuckAt + bar.offsetHeight + 12; // the bar stays where it is; the panel starts just below it
      if (bar.getBoundingClientRect().top <= stuckAt + 1 && panel.getBoundingClientRect().top < under) window.scrollTo({ top: Math.max(0, window.scrollY + panel.getBoundingClientRect().top - under), behavior: "auto" });
    }
  }, [active]);

  const tabs = sections.filter((x) => visible.has(x.id));
  const current = visible.has(active) || !term ? active : (tabs[0]?.id ?? active);
  const searching = term.length > 0;

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = tabs.length;
    if (!n) return;
    const go = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (go < 0) return;
    e.preventDefault();
    select(tabs[go].id, { focus: true, hash: !searching });
  }

  return (
    <div className={s.settings} ref={root}>
      <div className={s.settingsSearch}>
        <label htmlFor={inputId} className={s.fieldLabel}>Search settings</label>
        <div className={s.searchWrap}>
          <input
            id={inputId}
            type="search"
            className={`${s.input} ${s.searchInput}`}
            placeholder="Search: theme, memory, export, devices, billing"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }}
            autoComplete="off"
            enterKeyHint="search"
          />
          {q ? <button type="button" className={s.searchClear} onClick={() => { setQ(""); document.getElementById(inputId)?.focus(); }} aria-label="Clear search">Clear</button> : null}
        </div>
        <p className={s.note} role="status" aria-live="polite">
          {term ? (visible.size ? `${visible.size} of ${sections.length} sections match.` : `No settings match “${q.trim()}”. Try a shorter word.`) : ""}
        </p>
      </div>
      <div className={s.settingsTabsWrap}>
        <div role="tablist" aria-label="Settings categories" className={s.settingsNav}>
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
                className={s.settingsChip}
                hidden={!visible.has(x.id)}
                ref={(el) => { tabRefs.current[x.id] = el; }}
                onKeyDown={(e) => onKey(e, i)}
                onClick={() => { if (searching) setQ(""); select(x.id); }}
              >{x.label}</button>
            );
          })}
        </div>
      </div>
      {sections.map((x) => (
        <section key={x.id} id={`sec-${x.id}`} data-sec={x.id} role="tabpanel" aria-labelledby={`tab-${x.id}`} hidden={searching ? !visible.has(x.id) : x.id !== current} className={s.settingsSection}>
          {searching && visible.size > 1 ? <h2 className={s.sectionHeading}>{x.label}</h2> : null}
          {x.node}
        </section>
      ))}
    </div>
  );
}
