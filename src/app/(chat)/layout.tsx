import { AppBeacon } from "@/components/growth/SeoBeacon";
import { ViewportKeyboard } from "@/components/app-ui/ViewportKeyboard";
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";
import { Telemetry } from "@/components/growth/Telemetry";

/** The site home is the chat app: no marketing nav or footer. /app keeps the same shell in its own layout. */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DesktopTitleBar />
      <main id="main" data-app-root="">
        {children}
        <ViewportKeyboard />
        <AppBeacon />
      </main>
      {/* The home is the site's most visited landing page: page views, Web Vitals, campaign tags and the landing-page funnel run here
          too, and only after the visitor allowed Analytics (src/components/growth/Telemetry.tsx). /app keeps no telemetry. */}
      <Telemetry />
    </>
  );
}
