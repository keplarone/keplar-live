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

/**
 * Floating nav: three separate pills over the page (logo, Menu, actions).
 *  - The logo pill grows sideways on hover/focus to reveal the wordmark while the mark turns a little.
 *  - The Menu pill morphs in place into a panel (width and height ease out, the label swaps to Close, then the links fade in one by one).
 * Escape, an outside click, a route change or the Close pill closes it; focus moves into the panel on open and back to the pill on close.
 * Motion lives in Nav.module.css and stops under prefers-reduced-motion.
 */
export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const morphRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const me = usePlan();
  const common = useCommon();
  const t = common.nav;
  const links = common.footer.links;
  const locale = useLocale();
  const href = (h: string) => localizedPath(h, locale);
  const label = (c: { href: string; label: string }) => t.items[c.href] ?? links[c.href] ?? c.label;
  const en = locale === "en";

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
    const first = morphRef.current?.querySelector<HTMLElement>("[data-panel] a");
    const focusTimer = window.setTimeout(() => first?.focus({ preventScroll: true }), 160);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (morphRef.current && !morphRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      toggle?.focus({ preventScroll: true });
    };
  }, [open]);

  const product = primaryNav.flatMap((l) => (l.children ? l.children : [l]));
  const learn = (footerNav.find((c) => c.heading === "Learn")?.links ?? []).filter((c) => !product.some((p) => p.href === c.href));
  const company = footerNav.find((c) => c.heading === "Company")?.links ?? [];
  let i = 0; // stagger index for the panel links

  return (
    <header className={`${s.wrap} m-vt-nav`} data-scrolled={scrolled || undefined} data-open={open || undefined}>
      <Link href={href("/")} className={s.brand} aria-label={t.home}>
        <KeplarSymbol size={22} className={s.mark} />
        <span className={s.word} aria-hidden="true">{brand.name}</span>
      </Link>

      <div ref={morphRef} className={s.morph} data-open={open || undefined}>
        <button
          ref={toggleRef}
          type="button"
          className={s.toggle}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? t.closeMenu : t.openMenu}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={s.toggleIcon} aria-hidden="true">
            <i />
            <i />
          </span>
          <span className={s.toggleLabel}>{open ? (en ? "Close" : t.closeMenu) : en ? "Menu" : t.siteMenu}</span>
        </button>

        <nav id="site-menu" className={s.panel} aria-label={t.siteMenu} data-panel hidden={!open}>
          <div className={s.cols}>
            <div className={s.col}>
              <p className={s.colHead}>{t.product}</p>
              <ul className={s.bigLinks}>
                {product.map((c) => (
                  <li key={c.href} style={{ ["--i" as string]: i++ }}>
                    <Link href={href(c.href)} aria-current={pathname === href(c.href) ? "page" : undefined}>
                      {label(c)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className={s.col}>
              <p className={s.colHead}>{common.footer.headings.Learn ?? "Learn"}</p>
              <ul className={s.smallLinks}>
                {learn.map((c) => (
                  <li key={c.href} style={{ ["--i" as string]: i++ }}>
                    <Link href={href(c.href)} aria-current={pathname === href(c.href) ? "page" : undefined}>
                      {label(c)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className={s.panelFoot} style={{ ["--i" as string]: i++ }}>
            <button type="button" className={s.search} onClick={() => { setOpen(false); window.dispatchEvent(new Event("keplar:palette")); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
              {en ? "Search" : t.search}
            </button>
            <ul className={s.footLinks}>
              {company.map((c) => (
                <li key={c.href}>
                  <Link href={href(c.href)}>{label(c)}</Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <div className={s.actions}>
        <Link href={me.signedIn ? "/account" : href(signInHref)} className={s.signIn}>
          {me.signedIn ? t.account : t.signIn}
        </Link>
        <Link href={tryHref} className={s.cta}>
          {en ? <>Try {brand.name}</> : t.try}
        </Link>
      </div>
    </header>
  );
}
