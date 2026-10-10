"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeplarLogo } from "@/components/brand";
import { ButtonLink } from "@/components/ui/Button";
import { brand, primaryNav, signInHref, tryHref } from "@/lib/site";
import { usePlan } from "@/components/billing/usePlan";
import { PaletteButton } from "@/components/nav/CommandPalette";
import s from "./Nav.module.css";
import { lockScroll } from "@/lib/ui/scroll-lock";
import { usePresence } from "@/components/motion/usePresence";
import { useCommon, useLocale } from "@/lib/i18n/client";
import { localizedPath } from "@/lib/i18n/routing";

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const me = usePlan();
  // Labels come from the active locale's catalog (English on English pages); hrefs move to /<locale>/… where a localized page exists.
  const t = useCommon().nav;
  const locale = useLocale();
  const href = (h: string) => localizedPath(h, locale);
  const parentLabel = (l: { href: string; label: string }) => (l.href === "/features" ? t.product : t.items[l.href] ?? l.label);
  const label = (c: { href: string; label: string }) => t.items[c.href] ?? c.label;
  const sheet = usePresence(open); // the mobile sheet stays mounted while it fades out
  // Signed in: one "Account" entry. Upgrade is not in the marketing nav (it lives in the app and on /pricing).
  const [menu, setMenu] = useState<string | null>(null); // which dropdown is open (href of its parent entry)
  const menuWraps = useRef(new Map<string, HTMLLIElement>());
  const pinned = useRef(false); // opened by a click/tap (stays until Escape, outside click or blur); hover alone opens and closes it
  const closeMenu = useCallback(() => { pinned.current = false; setMenu(null); }, []);
  useEffect(() => { pinned.current = false; }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the menu whenever the route changes (state adjusted during render).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setMenu(null);
  }

  // Dropdowns: close on Escape (focus returns to its button), outside click and focus leaving it.
  useEffect(() => {
    if (!menu) return;
    const wrap = menuWraps.current.get(menu);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        wrap?.querySelector<HTMLElement>("button")?.focus();
      }
      // Arrow keys move through the open menu's links (and from its button into the menu).
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && wrap?.contains(document.activeElement)) {
        const links = [...wrap.querySelectorAll<HTMLElement>("[role=menu] a")];
        if (!links.length) return;
        e.preventDefault();
        const i = links.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % links.length : i <= 0 ? links.length - 1 : i - 1;
        links[next].focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (wrap && !wrap.contains(e.target as Node)) closeMenu();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menu, closeMenu]);

  useEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    const first = menuRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const release = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && menuRef.current) {
        const items = [...menuRef.current.querySelectorAll<HTMLElement>("a,button")];
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      release();
      toggle?.focus();
    };
  }, [open]);

  return (
    <header className={`${s.wrap} m-vt-nav`} data-keplar-drag data-scrolled={scrolled || undefined} data-open={open || undefined}>
      <nav className={`${s.capsule} lg`} aria-label={t.primary} data-keplar-drag>
        <Link href={href("/")} className={s.brand} aria-label={t.home}>
          <KeplarLogo height={26} title={brand.name} className={s.logo} />
        </Link>

        <ul className={s.links}>
          {primaryNav.map((l) => {
            if (!l.children) {
              return (
                <li key={l.href}>
                  <Link href={href(l.href)} className={s.link} aria-current={pathname === href(l.href) || pathname.startsWith(`${href(l.href)}/`) ? "page" : undefined}>
                    {label(l)}
                  </Link>
                </li>
              );
            }
            const active = l.children.some((c) => href(c.href) === pathname);
            const isOpen = menu === l.href;
            const menuId = `menu-${l.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
              <li
                key={l.href}
                ref={(el) => { if (el) menuWraps.current.set(l.href, el); else menuWraps.current.delete(l.href); }}
                className={s.menuWrap}
                onPointerEnter={(e) => { if (e.pointerType === "mouse" && !pinned.current) setMenu(l.href); }}
                onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pinned.current) setMenu((m) => (m === l.href ? null : m)); }}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && menu === l.href) closeMenu(); }}
              >
                <button type="button" className={s.link} data-active={active || undefined} aria-expanded={isOpen} aria-controls={menuId} aria-haspopup="true" onClick={() => { if (isOpen && pinned.current) closeMenu(); else { pinned.current = true; setMenu(l.href); } }}>
                  {parentLabel(l)}
                  <svg className={s.caret} viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <DropMenu id={menuId} open={isOpen} label={parentLabel(l)}>
                  {l.children.map((c) => (
                    <Link key={c.href} href={href(c.href)} role="menuitem" className={s.menuItem} aria-current={pathname === href(c.href) ? "page" : undefined}>
                      <span className={s.menuTitle}>{label(c)}</span>
                      {c.hint ? <span className={s.menuHint}>{t.hints[c.href] ?? c.hint}</span> : null}
                    </Link>
                  ))}
                </DropMenu>
              </li>
            );
          })}
        </ul>

        <div className={s.actions}>
          <PaletteButton className={s.search} />
          {me.signedIn ? (
            <Link href="/account" className={s.signIn}>
              {t.account}
            </Link>
          ) : (
            <Link href={href(signInHref)} className={s.signIn}>
              {t.signIn}
            </Link>
          )}
          <ButtonLink href={tryHref} size="sm" arrow className={s.cta}>
            {locale === "en" ? <>Try {brand.name}</> : t.try}
          </ButtonLink>
          <button
            ref={toggleRef}
            type="button"
            className={s.toggle}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t.closeMenu : t.openMenu}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={s.toggleBar} />
            <span className={s.toggleBar} />
          </button>
        </div>
      </nav>

      <div id="mobile-menu" ref={menuRef} className={s.sheet} hidden={!sheet.mounted} role="dialog" aria-modal="true" aria-label={t.siteMenu} {...sheet.motion("drop")}>
        <button type="button" className={s.sheetSearch} onClick={() => { setOpen(false); window.dispatchEvent(new Event("keplar:palette")); }}>
          {t.search}
        </button>
        <ul className={s.sheetLinks}>
          {primaryNav.flatMap((l, i) => {
            const items = l.children ?? [l];
            return items.map((c, j) => (
              <li key={`${l.href}-${c.href}`} style={{ ["--i" as string]: i + j }}>
                <Link href={href(c.href)} className={s.sheetLink} data-sub={l.children && j > 0 ? "" : undefined} aria-current={pathname === href(c.href) ? "page" : undefined}>
                  {l.children && j === 0 ? parentLabel(l) : label(c)}
                </Link>
              </li>
            ));
          })}
        </ul>
        <div className={s.sheetFoot}>
          {me.signedIn ? (
            <Link href="/account" className={s.signInMobile}>
              {t.account}
            </Link>
          ) : (
            <Link href={href(signInHref)} className={s.signInMobile}>
              {t.signIn}
            </Link>
          )}
          <ButtonLink href={tryHref} size="lg" arrow magnetic={false} className={s.cta}>
            {locale === "en" ? <>Try {brand.name}</> : t.try}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

/** A nav dropdown: pops from under its button (scale 0.96 + fade) and plays its exit before hiding. */
function DropMenu({ id, open, label, children }: { id: string; open: boolean; label: string; children: React.ReactNode }) {
  const p = usePresence(open);
  return (
    <div id={id} className={`${s.menu} lg lg-strong`} hidden={!p.mounted} role="menu" aria-label={label} {...p.motion("pop")}>
      {children}
    </div>
  );
}
