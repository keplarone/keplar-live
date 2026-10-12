"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { KeplarSymbol } from "@/components/brand";
import { usePresence } from "@/components/motion/usePresence";
import { ModelStack } from "@/components/sky/ModelStack";
import { SkyBackdrop } from "@/components/sky/SkyBackdrop";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { brand, footerNav } from "@/lib/site";
import type { ComposerModes } from "@/lib/orchestration/types";
import { pathForView } from "./app-paths";
import type { Thread, View } from "./state/types";
import nav from "@/components/chrome/Nav.module.css";
import s from "./WelcomeBack.module.css";

/** sessionStorage key: the welcome-back screen shows once per visit (a new tab or window is a new visit). */
export const WELCOME_BACK_KEY = "keplar-welcome-back";

/** The Menu panel's app places (big links), in the sidebar's order. */
const PLACES: { view: View; label: string }[] = [
  { view: "create", label: "Create" },
  { view: "projects", label: "Projects" },
  { view: "slides", label: "Slides" },
  { view: "study", label: "Study" },
  { view: "history", label: "All chats" },
];
/** Its small links: settings and plans, then the site's Learn column; Company sits in the panel foot. */
const MORE_LINKS = [{ href: "/account", label: "Settings" }, { href: "/pricing", label: "Plans and pricing" }, ...(footerNav.find((c) => c.heading === "Learn")?.links ?? [])];
const COMPANY_LINKS = footerNav.find((c) => c.heading === "Company")?.links ?? [];

/** Starters: each fills the composer with a beginning to finish (the person still writes the question), and may switch a mode on. */
const STARTERS: { label: string; seed: string; tone: string; icon: React.ReactNode; modes?: Partial<ComposerModes> }[] = [
  { label: "Research a topic", seed: "Research ", modes: { deepResearch: true }, tone: "teal", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></> },
  { label: "Compare options", seed: "Compare ", tone: "amber", icon: <path d="M7 7h10M7 12h10M7 17h6" /> },
  { label: "Check a claim", seed: "Is this true: ", tone: "green", icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  { label: "Write", seed: "Help me write ", tone: "brown", icon: <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" /> },
  { label: "Code", seed: "Help me with this code: ", tone: "rose", icon: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" /> },
];

const dayGreeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

function ago(ts: number, now: number): string {
  const day = 86_400_000;
  const d = Math.floor((now - ts) / day);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "Last week";
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Whether to show it: once per visit, for signed-in people who already have chats. */
export function shouldWelcomeBack(): boolean {
  try { return sessionStorage.getItem(WELCOME_BACK_KEY) === null; } catch { return false; }
}

function markSeen() {
  try { sessionStorage.setItem(WELCOME_BACK_KEY, "1"); } catch { /* private mode: it may show again, harmless */ }
}

type Props = {
  firstName: string;
  plan: string;
  threads: Thread[];
  /** The app's own Composer (attachments, drag and drop, paste, voice, every mode, the model picker): the same box as in a chat. */
  composer: React.ReactNode;
  /** A starter chip: fill the composer here (and switch a mode on), without leaving the screen. */
  onStarter: (text: string, modes: Partial<ComposerModes>) => void;
  onOpenThread: (id: string) => void;
  onOpenChats: () => void;
  /** A place from the Menu panel (Create, Projects, ...). */
  onView: (view: View) => void;
  onNewChat: () => void;
  onSearch: () => void;
  onClose: () => void;
};

/**
 * The screen a signed-in person sees when they come back to Keplar (Keplar Canvas, Page 1 "Home"): a greeting by name, one
 * question box, quick starters and the last three chats, over the home page's moving backdrop (SkyBackdrop). The top pills are
 * the site nav's (Nav.module.css): the logo grows to show the wordmark on hover, and Menu morphs into a panel of app places.
 * Anything they do here moves into the app and the screen does not come back until their next visit. Escape closes the menu
 * first, then the screen.
 */
export function WelcomeBack({ firstName, plan, threads, composer, onStarter, onOpenThread, onOpenChats, onView, onNewChat, onSearch, onClose }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const panel = usePresence(menuOpen); // stays mounted while its exit plays
  const morphRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuOpenRef = useRef(menuOpen);
  useEffect(() => { menuOpenRef.current = menuOpen; });
  const [now] = useState(() => Date.now());
  const [hour] = useState(() => new Date().getHours());
  const titleId = useId();
  const recent = threads.filter((t) => !t.private && t.title.trim()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);

  const leave = (after: () => void) => {
    markSeen();
    setLeaving(true);
    window.setTimeout(after, 180);
  };

  useEffect(() => {
    // Seen once it has shown: a reload in the same visit goes straight to the app.
    markSeen();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (menuOpenRef.current) { setMenuOpen(false); return; }
      markSeen();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The open menu (as in Nav.tsx): focus its first link, arrow keys move through it, an outside click closes it, focus returns to the pill.
  useEffect(() => {
    if (!menuOpen) return;
    const toggle = toggleRef.current;
    const first = morphRef.current?.querySelector<HTMLElement>("[data-panel] a");
    const focusTimer = window.setTimeout(() => first?.focus({ preventScroll: true }), 160);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && morphRef.current?.contains(document.activeElement)) {
        const items = [...morphRef.current.querySelectorAll<HTMLElement>("[data-panel] a, [data-panel] button")];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[e.key === "ArrowDown" ? (i + 1) % items.length : i <= 0 ? items.length - 1 : i - 1].focus();
      }
    };
    const onDown = (e: PointerEvent) => { if (morphRef.current && !morphRef.current.contains(e.target as Node)) setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      toggle?.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  /** Same-tab clicks stay in the app shell; modified clicks open the real route in a new tab (like the sidebar). */
  const place = (e: MouseEvent, go: () => void) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    leave(go);
  };
  let i = 0; // stagger index for the panel links

  return (
    <div className={s.screen} role="dialog" aria-modal="true" aria-labelledby={titleId} data-leaving={leaving || undefined}>
      <div className={s.sky} aria-hidden="true"><SkyBackdrop /></div>

      <header className={s.top}>
        <button type="button" className={nav.brand} onClick={() => leave(onOpenChats)} aria-label="Open chats">
          <KeplarSymbol size={22} className={nav.mark} />
          <span className={nav.word} aria-hidden="true">{brand.name}</span>
        </button>

        <div ref={morphRef} className={nav.morph} data-open={menuOpen || undefined}>
          <button ref={toggleRef} type="button" className={nav.toggle} aria-expanded={menuOpen} aria-controls={`${titleId}-menu`} aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((v) => !v)}>
            <span className={nav.toggleIcon} aria-hidden="true"><i /><i /></span>
            <span className={nav.toggleLabel}>{menuOpen ? "Close" : "Menu"}</span>
          </button>

          <nav id={`${titleId}-menu`} className={nav.panel} aria-label="Keplar" data-panel hidden={!panel.mounted} {...panel.motion("drop")}>
            <div className={nav.cols}>
              <div className={nav.col}>
                <p className={nav.colHead}>{brand.name}</p>
                <ul className={nav.bigLinks}>
                  <li style={{ ["--i" as string]: i++ }}>
                    <Link href="/app" onClick={(e) => place(e, onNewChat)}>New chat</Link>
                  </li>
                  {PLACES.map((p) => (
                    <li key={p.view} style={{ ["--i" as string]: i++ }}>
                      <Link href={pathForView(p.view)} onClick={(e) => place(e, () => onView(p.view))}>{p.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={nav.col}>
                <p className={nav.colHead}>More</p>
                <ul className={nav.smallLinks}>
                  {MORE_LINKS.map((c) => (
                    <li key={c.href} style={{ ["--i" as string]: i++ }}>
                      <Link href={c.href} onClick={markSeen}>{c.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className={nav.panelFoot} style={{ ["--i" as string]: i++ }}>
              <button type="button" className={nav.search} onClick={() => leave(onSearch)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
                Search chats
              </button>
              <ul className={nav.footLinks}>
                {COMPANY_LINKS.map((c) => (
                  <li key={c.href}><Link href={c.href} onClick={markSeen}>{c.label}</Link></li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className={s.actions}>
          <ThemeToggle className={nav.theme} />
          {plan === "free" ? <Link href="/pricing" className={nav.cta} onClick={markSeen}>Upgrade</Link> : null}
        </div>
      </header>

      <main className={s.body}>
        <div className={s.hero}>
          <p className={s.models}>
            <ModelStack />
            <span>Top AI models, one answer</span>
          </p>
          <h1 id={titleId} className={s.title}>
            <span>{dayGreeting(hour)}{firstName ? `, ${firstName}` : ""}</span>
            <span className={s.titleGrey}>What should we look into?</span>
          </h1>
          <p className={s.lede}>Ask once. Keplar sends your question to several AI models, compares what they say, and gives you one clear answer.</p>
        </div>

        <div className={s.ask}>{composer}</div>

        <div className={s.chips}>
          {STARTERS.map((c) => (
            <button key={c.label} type="button" className={s.chip} data-tone={c.tone} onClick={() => onStarter(c.seed, c.modes ?? {})}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{c.icon}</svg>
              {c.label}
            </button>
          ))}
        </div>

        {recent.length ? (
          <section className={s.recent} aria-labelledby={`${titleId}-r`}>
            <h2 id={`${titleId}-r`} className={s.recentTitle}>Pick up where you left off</h2>
            <div className={s.recentGrid}>
              {recent.map((t) => (
                <button key={t.id} type="button" className={s.recentCard} onClick={() => leave(() => onOpenThread(t.id))}>
                  <span className={s.recentName}>{t.title}</span>
                  <span className={s.recentWhen}>{ago(t.updatedAt, now)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <p className={s.foot}>Keplar compares several AI models. Check important answers.</p>
    </div>
  );
}
