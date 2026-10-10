import { MonolithHome } from "@/components/home/MonolithHome";
import { Chapters } from "@/components/landing/Chapters";
import { ChapterSync } from "@/components/landing/ChapterSync";
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
 * One screen: the sentence, the prompt, and the particle field, then seven chapters that cover the whole product: Ask (live demo),
 * Understand, Create, Build together, Ship, Platform, Trust. Every feature is one row linking to its real route, with an honest
 * status (src/lib/features.ts). ChapterSync tells the space scene which chapter is on screen.
 */
export default function Home() {
  return (
    <>
      <MonolithHome />
      <Chapters beforeClose={<Pricing showCompute={false} />} />
      <ChapterSync />
      <JsonLd data={softwareApp()} />
    </>
  );
}
