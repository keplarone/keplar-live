"use client";
/** Full-size image viewer: shows the image at its real resolution (scrollable when larger than the screen), Esc / backdrop closes. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import css from "./Lightbox.module.css";
import { lockScroll } from "@/lib/ui/scroll-lock";
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
  const [actual, setActual] = useState(false);
  const [dims, setDims] = useState<string | null>(null);
  const exit = useExit(onClose); // every close path fades the viewer out first
  const close = exit.close;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); }
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
    <div className={css.scrim} role="dialog" aria-modal="true" aria-label={alt} onClick={(e) => { if (e.target === e.currentTarget) close(); }} {...exit.motion("fade")}>
      <div className={css.bar}>
        <span className={css.cap}>{caption ?? alt}{dims ? ` · ${dims}` : ""}</span>
        <span className={css.actions}>
          <button type="button" className={css.btn} onClick={() => setActual((v) => !v)} aria-pressed={actual}>{actual ? "Fit to screen" : "Actual size"}</button>
          {downloadHref ? <a className={css.btn} href={downloadHref} download={downloadName ?? ""}>Download original</a> : null}
          <button ref={closeRef} type="button" className={css.btn} onClick={close}>Close</button>
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
