"use client";
/**
 * Language picker (footer and Settings). Every language by its own name, grouped by region, with search. Choosing one saves
 * it (keplar-locale cookie, a year) and keeps the current page: /pricing → /ja/pricing. Pages that are English-only stay
 * where they are. In the app (no URL prefix) the UI switches in place.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ALL_LOCALES, localeInfo, type LocaleInfo, type Region } from "@/lib/i18n/locales";
import { localizedPath, splitLocale } from "@/lib/i18n/routing";
import { saveLocale, savedLocale, useCommon, useLocale } from "@/lib/i18n/client";
import { Icon } from "@/components/kit";
import s from "./LanguagePicker.module.css";

const REGIONS: Region[] = ["americas", "europe", "middleEast", "africa", "southAsia", "centralAsia", "eastAsia", "southeastAsia"];
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

export function LanguagePicker({ variant = "footer" }: { variant?: "footer" | "settings" }) {
  const c = useCommon().picker;
  const urlLocale = useLocale();
  const pathname = usePathname() ?? "/";
  // English-only pages (Settings, the app) have no URL locale: there the saved choice is the current one.
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (splitLocale(pathname).locale !== "en") return;
    let live = true;
    queueMicrotask(() => { if (live) setSaved(savedLocale()); });
    const on = (e: Event) => setSaved((e as CustomEvent<{ locale: string }>).detail?.locale ?? savedLocale());
    window.addEventListener("keplar:locale", on);
    return () => { live = false; window.removeEventListener("keplar:locale", on); };
  }, [pathname]);
  const current = saved && splitLocale(pathname).locale === "en" && variant === "settings" ? saved : urlLocale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const info = localeInfo(current);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const groups = useMemo(() => {
    const term = norm(q.trim());
    const match = (l: LocaleInfo) => !term || norm(`${l.native} ${l.english} ${l.code}`).includes(term);
    return REGIONS.map((r) => ({ region: r, items: ALL_LOCALES.filter((l) => l.region === r && match(l)).sort((a, b) => a.english.localeCompare(b.english, "en")) })).filter((g) => g.items.length);
  }, [q]);

  const choose = (code: string) => {
    saveLocale(code);
    setOpen(false);
    setQ("");
    if (pathname.startsWith("/app") || variant === "settings") return; // the app and Settings stay put; the choice is saved
    const { path } = splitLocale(pathname);
    const target = localizedPath(`${path}${location.search}${location.hash}`, code);
    if (target !== `${pathname}${location.search}${location.hash}`) router.push(target);
  };

  return (
    <div ref={wrap} className={s.wrap} data-variant={variant}>
      <button ref={button} type="button" className={s.trigger} data-o="LanguagePicker trigger" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M1.9 8h12.2M8 1.75c1.8 1.9 2.6 4 2.6 6.25S9.8 12.35 8 14.25C6.2 12.35 5.4 10.25 5.4 8S6.2 3.65 8 1.75z" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        <span className="visually-hidden">{c.label}: </span>
        <span lang={info.lang}>{info.native}</span>
      </button>
      {open ? (
        <div id={id} className={s.panel} role="dialog" aria-label={c.choose}>
          <div className={s.head}>
            <label className="visually-hidden" htmlFor={`${id}-q`}>{c.search}</label>
            <input ref={input} id={`${id}-q`} className={s.search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.search} autoComplete="off" spellCheck={false} />
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label={c.close}><Icon name="close" size={16} /></button>
          </div>
          <div className={s.list}>
            {groups.length === 0 ? <p className={s.none}>{c.none}</p> : null}
            {groups.map((g) => (
              <section key={g.region} className={s.group} aria-label={c.regions[g.region]}>
                <h3 className={s.region}>{c.regions[g.region]}</h3>
                <ul>
                  {g.items.map((l) => (
                    <li key={l.code}>
                      <button type="button" className={s.item} aria-current={l.code === current ? "true" : undefined} onClick={() => choose(l.code)}>
                        <span className={s.native} lang={l.lang} dir={l.dir}>{l.native}</span>
                        <span className={s.english}>{l.english}</span>
                        {l.status === "beta" ? <span className={s.beta} title={c.betaNote}>{c.beta}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className={s.note}>{c.betaNote}</p>
        </div>
      ) : null}
    </div>
  );
}
