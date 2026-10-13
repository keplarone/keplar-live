"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import s from "./App.module.css";
import { KLoader } from "@/components/loader/KLoader";
import type { View } from "./state/types";

/**
 * The app reads threads from localStorage on first render, so it only renders
 * on the client. The fallback matches the shell so there is no layout jump.
 * `initialView` comes from the /app/… route (see app-paths.ts).
 */
const KeplarApp = dynamic(() => import("./KeplarApp"), {
  ssr: false,
  loading: () => (
    // Same shell as app/app/loading.tsx. On a slow phone the app's scripts take seconds; the loader fades in after 150ms so
    // a fast load never flashes it and a slow one never shows an empty frame.
    <div className={s.app} aria-busy="true" aria-label="Loading Keplar">
      <div className={s.sideWrap} />
      <div className={s.main} style={{ display: "grid", placeItems: "center" }}>
        <span className="m-delayed"><KLoader size={24} label="Loading Keplar" /></span>
      </div>
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
