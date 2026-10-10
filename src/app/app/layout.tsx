import { AppBeacon } from "@/components/growth/SeoBeacon";
import { ViewportKeyboard } from "@/components/app-ui/ViewportKeyboard";

/** /app has its own full-screen layout: no marketing nav or footer. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main">
      {children}
      <ViewportKeyboard />
      <AppBeacon />
    </main>
  );
}
