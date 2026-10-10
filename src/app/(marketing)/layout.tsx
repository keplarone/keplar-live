import { PageChrome } from "@/components/chrome/PageChrome";
import { Nav } from "@/components/chrome/Nav";
import { Footer } from "@/components/chrome/Footer";
import { RevealRoot } from "@/components/motion/RevealRoot";
import { AmbientRuntime } from "@/components/motion/AmbientRuntime";
import { Telemetry } from "@/components/growth/Telemetry";
import { LocaleSuggest } from "@/components/i18n/LocaleSuggest";

/** Marketing chrome (floating nav + footer). /app and internal previews live outside this group. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AmbientRuntime />
      <PageChrome />
      <Nav />
      <main id="main" style={{ position: "relative", zIndex: 0 }}>
        {children}
      </main>
      <Footer />
      <RevealRoot />
      <Telemetry />
      <LocaleSuggest />
    </>
  );
}
