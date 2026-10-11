"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
const query = "(max-width: 900px)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

/** One sidebar on every screen: a modal drawer on phones, a collapsible panel on desktop. */
export function useBusinessNavigation() {
  const mobile = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [requested, setRequested] = useState(false);
  const open = mobile && requested;
  const sideRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const close = () => setRequested(false);
  useEffect(() => {
    if (!open) return;
    const side = sideRef.current;
    if (!side) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () => [...side.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex='0']")].filter((el) => el.getClientRects().length > 0);
    (items()[0] ?? side).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setRequested(false); }
      if (event.key !== "Tab") return;
      const focusable = items(), first = focusable[0], last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); side.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !side.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !side.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const onResize = () => { if (!window.matchMedia(query).matches) setRequested(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      menuRef.current?.focus();
    };
  }, [open]);
  return { mobile, open, sideRef, menuRef, close, toggle: () => setRequested((value) => !value) };
}
