import type { Metadata } from "next";
import { LocaleHome } from "@/components/home/LocaleHome";
import { Chapters } from "@/components/landing/Chapters";
import { ChapterSync } from "@/components/landing/ChapterSync";
import { Pricing } from "@/components/sections/Pricing";
import { JsonLd } from "@/components/seo/JsonLd";
import { softwareApp } from "@/lib/structuredData";
import { localeMetadata } from "@/lib/i18n/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "home");
}

/** The home page in a locale, on the same UI v2 system as / (docs/ui-v2.md): the hero and how it works, then the chapters, with translated copy. */
export default async function LocalizedHomePage({ params }: P) {
  const { locale } = await params;
  return (
    <>
      <LocaleHome />
      <Chapters locale={locale} beforeClose={<Pricing showCompute={false} locale={locale} />} />
      <ChapterSync />
      <JsonLd data={softwareApp()} />
    </>
  );
}
