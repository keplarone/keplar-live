import { AppBeacon } from "@/components/growth/SeoBeacon";
import { ViewportKeyboard } from "@/components/app-ui/ViewportKeyboard";
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";

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
