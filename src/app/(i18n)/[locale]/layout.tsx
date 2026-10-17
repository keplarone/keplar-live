import { notFound } from "next/navigation";
import { PageChrome } from "@/components/chrome/PageChrome";
import { Nav } from "@/components/chrome/Nav";
import { Footer } from "@/components/chrome/Footer";
import { RevealRoot } from "@/components/motion/RevealRoot";
import { AmbientRuntime } from "@/components/motion/AmbientRuntime";
import { Telemetry } from "@/components/growth/Telemetry";
import { LocaleSuggest } from "@/components/i18n/LocaleSuggest";
import { I18nProvider } from "@/lib/i18n/client";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/server";

/**
 * Localized marketing pages: /<locale>/... for every locale in src/lib/i18n/locales.ts (English stays at the root, in (marketing)).
 * Same chrome as the English marketing layout; the provider hands client components this locale's strings only.
 * Pages are static: rendered on first request per locale, then cached (no cookies or headers are read). <html lang/dir> comes from
 * the URL (src/components/i18n/LocaleHtml.tsx).
 */
export const dynamicParams = true;
export function generateStaticParams() {
  return []; // rendered on first request, then served from the cache; keeps the build the same size as before
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale === DEFAULT_LOCALE || !isLocale(locale)) notFound();
  const [common, client] = await Promise.all([getMessages(locale, "common"), getMessages(locale, "client")]);
  return (
    <I18nProvider locale={locale} common={common} client={client}>
      <AmbientRuntime />
      <PageChrome />
      <Nav />
      <main id="main" style={{ position: "relative", zIndex: 1, isolation: "isolate" }}>
        {children}
      </main>
      <Footer locale={locale} />
      <RevealRoot />
      <Telemetry />
      <LocaleSuggest />
    </I18nProvider>
  );
}
