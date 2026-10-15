"use client";
/**
 * Full-size image viewer: shows the image at its real resolution (scrollable when larger than the screen), Esc / backdrop closes.
 * It stays its own full-screen layer (the kit Dialog is a width-capped card, wrong for a picture at 100%): an opaque canvas, the
 * kit's Buttons, Tab cycling through its controls (focus starts on Close) and returned on close.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/kit";
import css from "./Lightbox.module.css";
import la from "./link-action.module.css";
import { lockScroll } from "@/lib/ui/scroll-lock";
import { trapTab } from "@/lib/ui/focus-trap";
import { useExit } from "@/components/motion/usePresence";

export type LightboxProps = {
  src: string;
  alt: string;
  caption?: string;
  /** Link that saves the original file. */
  downloadHref?: string;
  downloadName?: string;
  onClose: () => void;
};

export function Lightbox({ src, alt, caption, downloadHref, downloadName, onClose }: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(false);
  const [dims, setDims] = useState<string | null>(null);
  const exit = useExit(onClose); // every close path fades the viewer out first
  const close = exit.close;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Tab") trapTab(e, layerRef.current); // cycle through every control (Actual size, Download, Close), not just Close
    };
    window.addEventListener("keydown", key, true);
    const release = lockScroll();
    return () => {
      window.removeEventListener("keydown", key, true);
      release();
      prev?.focus?.();
    };
  }, [close]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={layerRef} className={css.scrim} role="dialog" aria-modal="true" aria-label={alt} onClick={(e) => { if (e.target === e.currentTarget) close(); }} {...exit.motion("fade")}>
      <div className={css.bar}>
        <span className={css.cap}>{caption ?? alt}{dims ? ` · ${dims}` : ""}</span>
        <span className={css.actions}>
          <Button size="sm" variant="secondary" onClick={() => setActual((v) => !v)} aria-pressed={actual}>{actual ? "Fit to screen" : "Actual size"}</Button>
          {downloadHref ? <a className={la.act} data-variant="secondary" data-size="sm" href={downloadHref} download={downloadName ?? ""}>Download original</a> : null}
          <Button ref={closeRef} size="sm" variant="primary" onClick={close}>Close</Button>
        </span>
      </div>
      <div className={`${css.stage} ${actual ? css.actual : ""}`} onClick={(e) => { if (e.target === e.currentTarget) close(); }} data-motion="pop" data-state={exit.state} style={{ ["--m-origin" as string]: "50% 50%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- full-resolution original, deliberately not optimised */}
        <img src={src} alt={alt} className={css.img} onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} />
      </div>
    </div>,
    document.body,
  );
}
