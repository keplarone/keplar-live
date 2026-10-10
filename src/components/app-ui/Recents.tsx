"use client";
import { useEffect, useId, useRef, useState } from "react";
import { IconChevron } from "./icons";
import { DeleteChatAction } from "./delete/DeleteChat";
import type { Thread, View } from "./state/types";
import s from "./App.module.css";
import cx from "./Recents.module.css";

/** How many chats the list shows. The count badge is the true total, so past this the list ends with a way to see the rest. */
export const SHOWN = 14;
const KEY = "keplar.recents.open.v1";
const storeKey = (userKey: string) => `${KEY}:${userKey}`;
const read = (userKey: string): boolean => {
  try { return window.localStorage.getItem(storeKey(userKey)) !== "0"; } catch { return true; } // open unless the person closed it
};
const write = (userKey: string, open: boolean) => {
  try { window.localStorage.setItem(storeKey(userKey), open ? "1" : "0"); } catch { /* storage unavailable: the choice lasts for this visit only */ }
};

/** The open/close height transition in Recents.module.css (.collapse), plus a frame. */
const OPEN_MS = 240;
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * After Recents opens: if fewer than ~3 chats are visible under its row, scroll ONLY the sidebar's scroll container (the nav + Recents
 * area, or the whole sidebar on short windows) so the row sits at its top. Nothing outside the sidebar is ever scrolled.
 */
function revealInSidebar(row: HTMLElement | null) {
  const nav = row?.closest("nav");
  if (!row || !nav) return;
  let box: HTMLElement | null = null;
  for (let el = row.parentElement; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) { box = el; break; }
    if (el === nav) break;
  }
  if (!box) return;
  const view = box.getBoundingClientRect();
  const top = row.getBoundingClientRect().top;
  if (top >= view.top && top + 34 * 4 <= view.bottom) return; // the row and a few chats already show: leave the scroll where it is
  const target = Math.max(0, Math.min(box.scrollTop + (top - view.top), box.scrollHeight - box.clientHeight));
  box.scrollTo({ top: target, behavior: reducedMotion() ? "auto" : "smooth" });
}

/**
 * Sidebar "Recents": the chat list, shown directly under the nav (open by default). The row (chevron, count) still folds it away;
 * that choice is remembered per person on this device. Selecting a chat from elsewhere (search, a new chat, History)
 * opens it for that moment without changing the saved choice.
 */
export function Recents({ threads, activeId, view, userKey, onOpen, onDeleteChat, onAll }: { threads: Thread[]; activeId: string | null; view: View; userKey: string | null; onOpen: (id: string) => void; onDeleteChat?: (id: string) => void; onAll?: () => void }) {
  const listId = useId();
  const [saved, setSaved] = useState(true);
  const [peek, setPeek] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The saved choice belongs to the person: read it when the account is known or changes.
  useEffect(() => {
    if (userKey === null || loadedFor.current === userKey) return;
    loadedFor.current = userKey;
    setSaved(read(userKey));
    setPeek(false);
  }, [userKey]);

  // A chat that becomes the open one (picked from search, History or a link; not the one restored on load, and not a brand-new chat the person just started) is revealed.
  const prevActive = useRef<string | null>(activeId);
  const known = useRef(new Set<string>(threads.map((t) => t.id)));
  useEffect(() => {
    if (activeId && activeId !== prevActive.current && known.current.has(activeId)) setPeek(true);
    prevActive.current = activeId;
    known.current = new Set(threads.map((t) => t.id));
  }, [activeId, threads]);

  const open = saved || peek;
  const recent = threads.slice(0, SHOWN);
  const hasActive = view === "thread" && activeId !== null && recent.some((t) => t.id === activeId);
  const toggle = () => {
    if (userKey === null) return;
    if (open) { setSaved(false); setPeek(false); write(userKey, false); }
    else {
      setSaved(true); write(userKey, true);
      // The nav above can leave little room: once the list has opened, bring the row up inside the sidebar's own scroll area.
      // Never Element.scrollIntoView: it scrolls every scrollable ancestor (the fixed app shell, the page, the visual viewport), and fired
      // 30 ms into the expand, before the sidebar had the room, it pushed the whole shell up: the logo and top bar went off screen,
      // a blank band opened under the sidebar and composer, and the wheel could never scroll it back.
      window.setTimeout(() => revealInSidebar(rootRef.current), reducedMotion() ? 0 : OPEN_MS);
    }
  };

  return (
    <div ref={rootRef} className={`${s.recent} ${cx.root}`} data-recents={open ? "open" : "closed"}>
      <button type="button" className={cx.toggle} aria-expanded={open} aria-controls={listId} onClick={toggle} disabled={userKey === null} data-recents-toggle="">
        <span className={cx.chev} aria-hidden="true"><IconChevron size={14} /></span>
        <span className={cx.label}>Recents</span>
        {!open && hasActive ? <span className={cx.here} aria-label="Open chat is inside" role="img" /> : null}
        {threads.length ? <span className={cx.count} data-recents-count="" aria-label={`${threads.length} ${threads.length === 1 ? "chat" : "chats"}`}>{threads.length > 99 ? "99+" : threads.length}</span> : null}
      </button>
      <div id={listId} role="region" aria-label="Recent chats" className={cx.collapse} data-open={open || undefined} inert={open ? undefined : true}>
        <div className={cx.inner}>
          {recent.length ? (
            <ul className={s.recentList}>
              {recent.map((t) => (
                <li key={t.id}>
                  <DeleteChatAction title={t.title} onDelete={() => onDeleteChat?.(t.id)} enabled={Boolean(onDeleteChat)}>
                    <button
                      type="button"
                      className={s.threadLink}
                      aria-current={view === "thread" && activeId === t.id ? "page" : undefined}
                      onClick={() => onOpen(t.id)}
                      title={t.title}
                    >
                      {t.title}
                    </button>
                  </DeleteChatAction>
                </li>
              ))}
              {threads.length > SHOWN && onAll ? (
                <li>
                  <button type="button" className={s.recentAll} data-recents-all="" onClick={onAll}>See all {threads.length > 99 ? "99+" : threads.length} chats</button>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className={s.recentEmpty}>Your chats will appear here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
