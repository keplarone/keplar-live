import { breadcrumbs } from "@/lib/seo-graph";
import { EditorialTemplate } from "@/components/editorial/EditorialTemplate";
import { JsonLd } from "@/components/seo/JsonLd";
import { aboutPage } from "@/lib/content/about-page";
import { pageMeta } from "@/lib/seo";
import { aboutGraph } from "@/lib/structuredData";

export const metadata = pageMeta(aboutPage.path, aboutPage.metaTitle, aboutPage.metaDescription);

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "About", path: "/about" }])} />
      <EditorialTemplate page={aboutPage} />
      {/* AboutPage + Organization with both co-founders as two separate Person nodes (no birth dates or ages). */}
      <JsonLd data={aboutGraph()} />
    </>
  );
}
