import { AppBeacon } from "@/components/growth/SeoBeacon";
import { ViewportKeyboard } from "@/components/app-ui/ViewportKeyboard";
import { DesktopTitleBar } from "@/components/desktop/DesktopTitleBar";

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
    </>
  );
}
