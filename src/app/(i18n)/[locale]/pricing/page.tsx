import type { Metadata } from "next";
import Link from "next/link";
import { HeroField } from "@/components/motion/HeroField";
import { Pricing } from "@/components/sections/Pricing";
import { PlanFit } from "@/components/growth/pricing/PlanFit";
import { PricingClosing } from "@/components/growth/pricing/PricingClosing";
import { JsonLd } from "@/components/seo/JsonLd";
import { TrackOnMount } from "@/components/growth/TrackOnMount";
import s from "@/components/growth/pricing/pricing.module.css";
import { softwareApp } from "@/lib/structuredData";
import { breadcrumbs } from "@/lib/seo-graph";
import { localeMetadata } from "@/lib/i18n/seo";
import { getMessages } from "@/lib/i18n/server";
import { localizedPath } from "@/lib/i18n/routing";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  return localeMetadata((await params).locale, "pricing");
}

/**
 * Pricing in a locale: plans (names and USD prices untranslated), who each plan is for, and the closing. The full
 * feature-by-feature comparison and the pricing FAQ stay on the English page for now; this page links to them.
 */
export default async function LocalePricing({ params }: P) {
  const { locale } = await params;
  const p = (await getMessages(locale, "marketing")).pricing;
  return (
    <div style={{ paddingTop: "var(--s-16)" }}>
      <HeroField variant="pricing" />
      <Pricing headingLevel="h1" showCompute={false} locale={locale} />
      <PlanFit locale={locale} />
      <section className={s.section} aria-labelledby="compare-title">
        <div className={s.inner}>
          <h2 id="compare-title" className={s.title}>{p.compareTitle}</h2>
          <p className={s.lede}>{p.compareLede} <Link href="/pricing#compare-title" hrefLang="en">{p.compareLink}</Link></p>
        </div>
      </section>
      <PricingClosing locale={locale} />
      <JsonLd data={softwareApp()} />
      <JsonLd data={breadcrumbs([{ name: p.label, path: localizedPath("/pricing", locale) }])} />
      <TrackOnMount event="pricing_view" />
    </div>
  );
}
