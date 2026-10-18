"use client";
/**
 * The Settings window. mode="modal": a dialog over the app (opened by an intercepted soft navigation to /account), closed with
 * Esc, the ✕ or a click on the backdrop — closing goes back to where you were. mode="page": the same window on its own at /account
 * (direct visits, deep links, reloads); ✕ goes back, or to the app when there is nothing to go back to.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon, IconButton } from "@/components/kit";
import s from "./account.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SettingsDialog({ mode, children }: { mode: "modal" | "page"; children: ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const modal = mode === "modal";

  const close = useCallback(() => {
    if (modal) { router.back(); return; }
    const fromHere = document.referrer && new URL(document.referrer).origin === window.location.origin;
    if (fromHere && window.history.length > 1) router.back();
    else router.push("/");
  }, [modal, router]);

  // Modal: lock the page behind, move focus in, keep Tab inside, give focus back on close.
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const el = box.current;
      if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    }, 0);
    return () => {
      window.clearTimeout(t);
      html.style.overflow = prev;
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      // A kit dialog opened from here (confirmAction) is a native <dialog> in the top layer: its Escape and Tab are its own.
      if (e.target instanceof Element && e.target.closest("dialog")) return;
      // Inner controls that use Esc themselves (search clear, menus, confirm boxes) call preventDefault first.
      if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const list = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, close]);

  const frame = (
    <div ref={box} className={s.dlg} data-product="" role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-labelledby="settings-title" data-mode={mode}>
      <header className={s.dlgHead}>
        <h1 id="settings-title" className={s.dlgTitle}>Settings</h1>
        <IconButton className={s.dlgClose} onClick={close} label="Close settings" shortcut={["Esc"]} tooltipSide="bottom" icon={<Icon name="close" size={18} />} />
      </header>
      {children}
    </div>
  );

  if (!modal) return <section className={s.dlgPage}>{frame}</section>;
  return (
    <div className={s.dlgLayer}>
      <div className={s.dlgBackdrop} onClick={close} aria-hidden="true" />
      {frame}
    </div>
  );
}
