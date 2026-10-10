import { SkyHome } from "@/components/sky/SkyHome";
import { Pricing } from "@/components/sections/Pricing";
import { JsonLd } from "@/components/seo/JsonLd";
import { softwareApp } from "@/lib/structuredData";
import { site } from "@/lib/site";
import type { Metadata } from "next";
import { localeAlternates } from "@/lib/i18n/routing";

// Homepage description kept under ~160 characters so it is not cut off in results.
export const metadata: Metadata = {
  description: `${site.name} sends your question to multiple AI models, finds where they disagree, verifies, and gives you one synthesized answer. Free to try, no signup.`,
  // Self-canonical plus hreflang to every translated home page and x-default (src/lib/i18n/routing.ts).
  alternates: localeAlternates("/", "en"),
};

/**
 * The light home (Oct 2026 redesign, src/components/sky): hero, a product window that zooms in on scroll, the "Everything in Keplar"
 * list (src/lib/features.ts), how it works, use cases (content/use-cases), the live demo (#demo) and pricing.
 */
export default function Home() {
  return (
    <>
      <SkyHome pricing={<Pricing showCompute={false} />} />
      <JsonLd data={softwareApp()} />
    </>
  );
}
