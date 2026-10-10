import type { Metadata } from "next";
import { ShowcaseView } from "@/components/i18n/pages/ShowcaseView";
import { localeMetadata } from "@/lib/i18n/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "showcase");
}

export default async function LocaleShowcase({ params }: P) {
  return <ShowcaseView locale={(await params).locale} />;
}
