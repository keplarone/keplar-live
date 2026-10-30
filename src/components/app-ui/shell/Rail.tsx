"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { KeplarSymbol } from "@/components/brand";
import { Tooltip } from "@/components/kit";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { IconAsk, IconCreate, IconHistory, IconMenu, IconPlus, IconProjects, IconSearch, IconSettings, IconStudy } from "../icons";
import type { View } from "../state/types";
import r from "./shell.module.css";

/**
 * Keplar Orbit rail (docs/design/keplar-orbit.md §4): the 56px column at the left edge of the app on wide screens, and the bottom
 * bar on phones. It only lists destinations the app already has (the Ask chat and the Create, Study, Projects and All chats ("Library") views,
 * the same routes /app/* serves); New chat, Search, the drawer toggle, theme, help and Settings sit around them on wide screens.
 * The active destination carries an accent pill that slides between items (one element, moved with translate).
 */
export type RailDest = { view: View; label: string; icon: ReactNode };

export const RAIL_DESTS: RailDest[] = [
  { view: "thread", label: "Chat", icon: <IconAsk size={18} /> },
  { view: "create", label: "Create", icon: <IconCreate size={18} /> },
  { view: "study", label: "Study", icon: <IconStudy size={18} /> },
  { view: "projects", label: "Projects", icon: <IconProjects size={18} /> },
  { view: "history", label: "Library", icon: <IconHistory size={18} /> },
];

type Props = {
  /** The destination shown now (the full view, or the surface open beside the chat). */
  active: View | null;
  mac: boolean;
  onNew: () => void;
  onSearch: () => void;
  onView: (v: View) => void;
  /** Show / hide the drawer (Ctrl/⌘+\). */
  onToggleDrawer: () => void;
  drawerShown: boolean;
  signedIn: boolean;
};

export function Rail({ active, mac, onNew, onSearch, onView, onToggleDrawer, drawerShown, signedIn }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const mod = mac ? "⌘" : "Ctrl";
  // Slide the indicator to the active item. Measured after layout; no state, no re-render.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const on = list.querySelector<HTMLElement>("[aria-current='page']");
      if (!on) {
        list.style.setProperty("--ind-o", "0");
        return;
      }
      const vertical = getComputedStyle(list).flexDirection === "column";
      list.style.setProperty("--ind-o", "1");
      list.style.setProperty("--ind-x", vertical ? "0px" : `${on.offsetLeft}px`);
      list.style.setProperty("--ind-y", vertical ? `${on.offsetTop}px` : "0px");
      list.style.setProperty("--ind-w", `${on.offsetWidth}px`);
      list.style.setProperty("--ind-h", `${on.offsetHeight}px`);
    };
    place();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    ro?.observe(list);
    return () => ro?.disconnect();
  }, [active]);

  return (
    <nav className={r.rail} aria-label="Keplar app" data-orbit-rail="">
      <div className={r.railTop}>
        <Tooltip content="Keplar home" side="right">
          <Link href="/" className={r.railBrand} aria-label="Keplar home">
            <KeplarSymbol size={22} />
          </Link>
        </Tooltip>
        <Tooltip content={drawerShown ? "Hide sidebar" : "Show sidebar"} shortcut={[mod, "\\"]} side="right">
          <button type="button" className={r.railBtn} onClick={onToggleDrawer} aria-label={drawerShown ? "Hide sidebar" : "Show sidebar"} aria-expanded={drawerShown} aria-controls="keplar-sidebar" aria-keyshortcuts={mac ? "Meta+\\" : "Control+\\"} data-drawer-toggle="" data-orbit-fx="icon">
            <IconMenu size={18} />
          </button>
        </Tooltip>
        <Tooltip content="New chat" shortcut={[mod, "⇧", "O"]} side="right">
          <button type="button" className={`${r.railBtn} ${r.railNew}`} onClick={onNew} aria-label="New chat" aria-keyshortcuts={mac ? "Meta+Shift+O" : "Control+Shift+O"} data-nav="rail-new" data-orbit-fx="primary" data-orbit-icon="plus">
            <IconPlus size={18} />
          </button>
        </Tooltip>
        <Tooltip content="Search chats" shortcut={[mod, "K"]} side="right">
          <button type="button" className={r.railBtn} onClick={onSearch} aria-label="Search chats" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"} data-nav="rail-search" data-orbit-fx="icon">
            <IconSearch size={18} />
          </button>
        </Tooltip>
      </div>

      <ul ref={listRef} className={r.railList} data-rail-dests="">
        <li className={r.railInd} aria-hidden="true" />
        {RAIL_DESTS.map((d) => (
          <li key={d.view}>
            <Tooltip content={d.label} side="right" className={r.railTip}>
              <button
                type="button"
                className={r.railDest}
                aria-current={active === d.view ? "page" : undefined}
                onClick={() => onView(d.view)}
                data-rail-view={d.view}
                data-orbit-fx="ghost"
              >
                {d.icon}
                <span className={r.railLabel}>{d.label}</span>
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>

      <div className={r.railFoot}>
        <Tooltip content="Theme" side="right">
          <ThemeToggle className={r.railBtn} />
        </Tooltip>
        <Tooltip content="Help & docs" side="right">
          <Link href="/docs" className={r.railBtn} aria-label="Help & docs" data-orbit-fx="icon">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="6.2" />
              <path d="M6.3 6.2a1.8 1.8 0 0 1 3.5.6c0 1.2-1.8 1.5-1.8 2.6" />
              <circle cx="8" cy="11.4" r="0.6" fill="currentColor" stroke="none" />
            </svg>
          </Link>
        </Tooltip>
        {signedIn ? (
          <Tooltip content="Settings" shortcut={[mod, ","]} side="right">
            <Link href="/account" className={r.railBtn} aria-label="Settings" data-nav="rail-settings" data-orbit-fx="icon">
              <IconSettings size={18} />
            </Link>
          </Tooltip>
        ) : (
          <Tooltip content="Sign in" side="right">
            <Link href="/signin" className={r.railBtn} aria-label="Sign in" data-nav="rail-signin" data-orbit-fx="icon">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <circle cx="8" cy="5.6" r="2.6" />
                <path d="M2.8 13.6c.9-2.3 2.9-3.5 5.2-3.5s4.3 1.2 5.2 3.5" />
              </svg>
            </Link>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}
