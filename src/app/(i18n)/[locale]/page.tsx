import type { Metadata } from "next";
import { CalmOverview } from "@/components/marketing/CalmOverview";
import { JsonLd } from "@/components/seo/JsonLd";
import { softwareApp } from "@/lib/structuredData";
import { localeMetadata } from "@/lib/i18n/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "home");
}

/** A localized home is the same calm overview as /overview. The chat itself is at /. */
export default async function LocaleHome({ params }: P) {
  const { locale } = await params;
  return (
    <>
      <CalmOverview locale={locale} />
      <JsonLd data={softwareApp()} />
    </>
  );
}
