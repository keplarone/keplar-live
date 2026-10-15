import type { Metadata } from "next";
import { MonolithHome } from "@/components/home/MonolithHome";
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

/** The home page in a locale: the same one-screen hero and chapters as /, with translated copy. */
export default async function LocaleHome({ params }: P) {
  const { locale } = await params;
  return (
    <>
      <MonolithHome />
      <Chapters locale={locale} beforeClose={<Pricing showCompute={false} locale={locale} phoneFeatures={3} />} />
      <ChapterSync />
      <JsonLd data={softwareApp()} />
    </>
  );
}
