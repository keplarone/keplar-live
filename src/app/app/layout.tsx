import type { Metadata } from "next";
import { AppBeacon } from "@/components/growth/SeoBeacon";
import { ViewportKeyboard } from "@/components/app-ui/ViewportKeyboard";
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";

/** Signed-in product. noindex, follow: crawlers may fetch it, and it is not a public page. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

/** /app has its own full-screen layout: no marketing nav or footer. `modal` is the Settings dialog slot (./@modal). */
export default function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      <DesktopTitleBar />
      <main id="main">
        {children}
        <ViewportKeyboard />
        <AppBeacon />
      </main>
      {modal}
    </>
  );
}
