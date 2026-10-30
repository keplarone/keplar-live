"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { brand, footerNav, primaryNav, signInHref, tryHref } from "@/lib/site";
import { usePlan } from "@/components/billing/usePlan";
import s from "./Nav.module.css";
import { useCommon, useLocale } from "@/lib/i18n/client";
import { localizedPath } from "@/lib/i18n/routing";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CtaLabel } from "@/components/ui/CtaLabel";
import { lockScroll } from "@/lib/ui/scroll-lock";
import { usePresence } from "@/components/motion/usePresence";

/**
 * Site header (Keplar Orbit, docs/design/keplar-orbit.md §4): the Keplar mark and name on the left; on wide screens the four
 * primary links centred; on the right search, theme, Sign in and the one primary CTA. A Menu button opens a panel under the bar
 * with every place (product, learn, company, search); on phones it is the only way to the links.
 * The bar is flat across the 1200px grid at the top of a page and condenses into a floating pill once the page scrolls.
 * Escape, an outside click, a route change or the Menu button closes the sheet; focus moves into it on open and back on close.
 */
export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const me = usePlan();
  const common = useCommon();
  const t = common.nav;
  const links = common.footer.links;
  const locale = useLocale();
  const href = (h: string) => localizedPath(h, locale);
  const label = (c: { href: string; label: string }) => t.items[c.href] ?? links[c.href] ?? c.label;
  const en = locale === "en";
  const panel = usePresence(open); // the sheet stays mounted while its exit plays (shared overlay pattern)

  // Close whenever the route changes (state adjusted during render).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const toggle = toggleRef.current;
    const first = sheetRef.current?.querySelector<HTMLElement>("a, button");
    const focusTimer = window.setTimeout(() => first?.focus({ preventScroll: true }), 60);
    const release = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      // Arrow keys move through the sheet's links.
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && sheetRef.current?.contains(document.activeElement)) {
        const items = [...sheetRef.current.querySelectorAll<HTMLElement>("a, button")];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1;
        items[next].focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (sheetRef.current?.contains(target) || toggle?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.clearTimeout(focusTimer);
      release();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      toggle?.focus({ preventScroll: true });
    };
  }, [open]);

  const inline = primaryNav.map((l) => ({ href: l.href, label: l.children ? t.product : label(l) }));
  const product = primaryNav.flatMap((l) => (l.children ? l.children : [l]));
  const learn = (footerNav.find((c) => c.heading === "Learn")?.links ?? []).filter((c) => !product.some((p) => p.href === c.href));
  const company = footerNav.find((c) => c.heading === "Company")?.links ?? [];
  const current = (h: string) => (pathname === href(h) ? "page" : undefined);
  const search = () => { setOpen(false); window.dispatchEvent(new Event("keplar:palette")); };

  return (
    <header className={`${s.wrap} m-vt-nav`} data-keplar-drag data-scrolled={scrolled || undefined} data-open={open || undefined}>
      <div className={s.bar}>
        <Link href={href("/")} className={s.brand} aria-label={t.home} data-orbit-fx="ghost">
          <KeplarSymbol size={22} className={s.mark} />
          <span className={s.word}>{brand.name}</span>
        </Link>

        <nav className={s.links} aria-label={t.siteMenu}>
          <ul>
            {inline.map((l) => (
              <li key={l.href}>
                <Link href={href(l.href)} className={s.link} aria-current={current(l.href)} data-orbit-fx="ghost">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={s.actions}>
          <button type="button" className={`${s.icon} ${s.searchBtn}`} data-orbit-fx="icon" onClick={search} aria-label={en ? "Search" : t.search}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
          </button>
          <ThemeToggle className={`${s.icon} ${s.theme}`} />
          <Link href={me.signedIn ? "/account" : href(signInHref)} className={s.signIn} data-orbit-fx="ghost">
            {me.signedIn ? t.account : t.signIn}
          </Link>
          {/* "Try Keplar" signed out, "Open Keplar" signed in (CtaLabel: both in the HTML, CSS shows one from <html data-signed>). */}
          <Link href={tryHref} className={s.cta} data-orbit-fx="primary">
            <CtaLabel tryText={en ? `Try ${brand.name}` : t.try} openText={t.open} />
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className={`${s.icon} ${s.toggle}`}
            data-orbit-fx="icon"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? t.closeMenu : t.openMenu}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={s.toggleIcon} aria-hidden="true"><i /><i /></span>
          </button>
        </div>
      </div>

      <nav ref={sheetRef} id="site-menu" className={s.sheet} aria-label={t.siteMenu} hidden={!panel.mounted} {...panel.motion("drop")}>
        <div className={s.cols}>
          <div className={s.col}>
            <p className={s.colHead}>{t.product}</p>
            <ul className={s.bigLinks}>
              {product.map((c) => (
                <li key={c.href}><Link href={href(c.href)} aria-current={current(c.href)}>{label(c)}</Link></li>
              ))}
            </ul>
          </div>
          <div className={s.col}>
            <p className={s.colHead}>{common.footer.headings.Learn ?? "Learn"}</p>
            <ul className={s.smallLinks}>
              {learn.map((c) => (
                <li key={c.href}><Link href={href(c.href)} aria-current={current(c.href)}>{label(c)}</Link></li>
              ))}
            </ul>
          </div>
          <div className={s.col}>
            <p className={s.colHead}>{common.footer.headings.Company ?? "Company"}</p>
            <ul className={s.smallLinks}>
              {company.map((c) => (
                <li key={c.href}><Link href={href(c.href)} aria-current={current(c.href)}>{label(c)}</Link></li>
              ))}
            </ul>
          </div>
        </div>
        <div className={s.sheetFoot}>
          <button type="button" className={s.searchWide} onClick={search}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
            {en ? "Search" : t.search}
          </button>
          {/* Phones under 400px: the bar has no room for it, so the theme switch lives here (Nav.module.css .panelTheme). */}
          <ThemeToggle className={`${s.icon} ${s.theme} ${s.panelTheme}`} />
          <Link href={me.signedIn ? "/account" : href(signInHref)} className={s.sheetSignIn}>
            {me.signedIn ? t.account : t.signIn}
          </Link>
        </div>
      </nav>
    </header>
  );
}
