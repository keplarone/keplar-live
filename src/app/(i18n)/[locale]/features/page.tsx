import type { Metadata } from "next";
import { FeaturesView } from "@/components/i18n/pages/FeaturesView";
import { localeMetadata } from "@/lib/i18n/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "features");
}

export default async function LocaleFeatures({ params }: P) {
  return <FeaturesView locale={(await params).locale} />;
}
