import { PageChrome } from "@/components/chrome/PageChrome";
import { Nav } from "@/components/chrome/Nav";
import { Footer } from "@/components/chrome/Footer";
import { RevealRoot } from "@/components/motion/RevealRoot";
import { AmbientRuntime } from "@/components/motion/AmbientRuntime";
import { Telemetry } from "@/components/growth/Telemetry";
import { LocaleSuggest } from "@/components/i18n/LocaleSuggest";

/** Marketing chrome: a solid bar, the page, and the footer. The chat at / and /app live outside this group. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AmbientRuntime />
      <PageChrome />
      <Nav />
      <main id="main" data-site="" style={{ position: "relative", zIndex: 0, isolation: "isolate", overflowX: "clip" }}>
        {children}
      </main>
      <Footer />
      <RevealRoot />
      <Telemetry />
      <LocaleSuggest />
    </>
  );
}
