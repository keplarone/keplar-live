"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A small glass label for an icon control, shown on hover (after 400ms) and on keyboard focus, hidden on Escape, leave, blur,
 * press or scroll. The wrapper is display: contents (it adds no box); the control (the first child element) is linked to the
 * label with aria-describedby. Styles: .sp-tip in src/styles/space.css.
 * The app's dense chrome keeps the kit's Tooltip (src/components/kit), which reads the same Space tokens.
 */
export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" }) {
  const id = useId();
  const host = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = host.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const show = (delay: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: side === "top" ? r.top - 8 : r.bottom + 8 });
      }, delay);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      setPos(null);
    };
    const enter = (e: PointerEvent) => { if (e.pointerType === "mouse") show(400); };
    const focus = () => { if (el.matches(":focus-visible")) show(0); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    el.setAttribute("aria-describedby", id);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", hide);
    el.addEventListener("pointerdown", hide);
    el.addEventListener("focus", focus);
    el.addEventListener("blur", hide);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    return () => {
      window.clearTimeout(timer.current);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", hide);
      el.removeEventListener("pointerdown", hide);
      el.removeEventListener("focus", focus);
      el.removeEventListener("blur", hide);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, { capture: true });
    };
  }, [id, side]);

  return (
    <span ref={host} style={{ display: "contents" }}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="sp-tip"
        data-motion="none"
        hidden={!pos}
        style={pos ? { left: pos.x, top: pos.y, translate: side === "top" ? "-50% -100%" : "-50% 0" } : undefined}
      >
        {content}
      </span>
    </span>
  );
}
