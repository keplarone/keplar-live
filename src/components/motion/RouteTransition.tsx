"use client";

import { ViewTransition, type ReactNode } from "react";

/**
 * Page transition for a route template (template.tsx remounts on every navigation, so this boundary enters and exits).
 * Next.js route navigations are React transitions, so the browser's View Transitions API animates them: the old page leaves
 * in 120ms, the new one fades and rises 4px (classes kp-route-out / kp-route-in, src/styles/motion.css). default="none"
 * keeps unrelated transitions (Suspense reveals, refreshes) still. Browsers without the API just swap pages instantly.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="kp-route-in" exit="kp-route-out" default="none">
      {children}
    </ViewTransition>
  );
}
