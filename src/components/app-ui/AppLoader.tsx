"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import s from "./App.module.css";
import type { View } from "./state/types";

/**
 * The app reads threads from localStorage on first render, so it only renders
 * on the client. The fallback matches the shell so there is no layout jump.
 * `initialView` comes from the /app/… route (see app-paths.ts).
 */
const KeplarApp = dynamic(() => import("./KeplarApp"), {
  ssr: false,
  loading: () => (
    <div className={s.app} aria-busy="true" aria-label="Loading Keplar">
      <div className={s.sideWrap} />
      <div className={s.main} />
    </div>
  ),
});

export function AppLoader({ initialView }: { initialView?: View }) {
  // The studio for this route is split out of the app bundle; start its download alongside the app so opening it does not wait twice.
  useEffect(() => {
    if (initialView === "create") void import("@/components/create/CreateStudio");
    else if (initialView === "slides") void import("@/components/slides/SlidesStudio");
    else if (initialView === "study") void import("@/components/study/StudyMode");
  }, [initialView]);
  return <KeplarApp initialView={initialView} />;
}
