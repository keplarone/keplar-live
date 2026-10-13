import type { Metadata } from "next";
import { OverlayShell } from "@/components/app-ui/studio-mode/workspace/OverlayShell";

export const metadata: Metadata = { title: "Keplar · Studio overlay" };

/** The page the desktop app's always-on-top Studio overlay window loads (keplar-desktop src/main/studio/overlay.ts). */
export default function Page() {
  return (
    <>
      {/* Mark the page before first paint so the transparent window never flashes the site background. */}
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.setAttribute("data-overlay","")` }} />
      <OverlayShell />
    </>
  );
}
