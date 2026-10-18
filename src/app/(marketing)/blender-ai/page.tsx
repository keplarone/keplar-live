import { LandingTemplate } from "@/components/growth/LandingTemplate";
import { JsonLd } from "@/components/seo/JsonLd";
import { landingBySlug } from "@/lib/content/landing";
import { pageMeta } from "@/lib/seo";
import { studioBlenderApp } from "@/lib/structuredData";

const page = landingBySlug("blender-ai")!;

export const metadata = pageMeta(page.path, page.metaTitle, page.metaDescription);

export default function Page() {
  return (
    <>
      <LandingTemplate page={page} />
      <JsonLd data={studioBlenderApp()} />
    </>
  );
}
