import type { Metadata } from "next";
import { RoadmapView } from "@/components/i18n/pages/RoadmapView";
import { localeMetadata } from "@/lib/i18n/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "roadmap");
}

export default async function LocaleRoadmap({ params }: P) {
  return <RoadmapView locale={(await params).locale} />;
}
