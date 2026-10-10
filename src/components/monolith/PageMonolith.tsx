"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { variantFor } from "@/field/monolith/math";
import type { MonolithCanvasProps } from "./MonolithCanvas";
import { afterPaint } from "@/lib/perf/after-paint";
import { probeCaps, softwareRenderer } from "@/field/caps";
import s from "./PageMonolith.module.css";

/**
 * The page-wide Monolith layer behind every marketing, docs, legal and blog page: one fixed canvas, a different scene variant per family
 * of pages, the camera tied to how far you have scrolled. Home draws its own full-bleed stage; the app, Create, admin and account
 * (dense working screens) and published sites get nothing. While it runs, <html data-field> lets sections show it through.
 *
 * The canvas module (and three.js) stay out of the first paint: we wait for idle / first interaction via afterPaint, then dynamic-import.
 * No-WebGL, Save-Data and CPU-GL skip the download entirely and leave the CSS background; reduced motion gets one still frame.
 */
export function PageMonolith() {
  const path = usePathname() || "/";
  const variant = variantFor(path);
  const page = variant && variant !== "home" ? variant : null;
  const [Canvas, setCanvas] = useState<ComponentType<MonolithCanvasProps> | null>(null);
  const [downFor, setDownFor] = useState<string | null>(null);
  const down = downFor === page;

  useEffect(() => {
    // Docs (also docs.keplar.one, where the visible path has no /docs prefix) are flat white: no field. The head script sets data-docs.
    // The light theme (the default since the Oct 2026 redesign) uses the flat aura backdrop instead of the 3D scene.
    if (!page || document.documentElement.getAttribute("data-docs") === "1" || document.documentElement.getAttribute("data-theme") === "light") return;
    let cancelled = false;
    const caps = probeCaps();
    const skip = !caps.webgl || caps.saveData || softwareRenderer(); // reduced motion still gets one still frame (MonolithCanvas)
    const stop = afterPaint(() => {
      if (skip) { if (!cancelled) setDownFor(page); return; }
      void import("./MonolithCanvas")
        .then((m) => { if (!cancelled) setCanvas(() => m.MonolithCanvas); })
        .catch(() => { if (!cancelled) setDownFor(page); });
    }, { timeout: 3000, minDelay: 80 });
    return () => { cancelled = true; stop(); };
  }, [page]);

  useEffect(() => {
    const root = document.documentElement;
    if (page && !down && Canvas) root.setAttribute("data-field", "page");
    else if (root.getAttribute("data-field") === "page") root.removeAttribute("data-field");
    return () => { if (root.getAttribute("data-field") === "page") root.removeAttribute("data-field"); };
  }, [page, down, Canvas]);

  if (!page || down || !Canvas) return null;
  return <Canvas variant={page} className={s.layer} onUnavailable={() => setDownFor(page)} />;
}
