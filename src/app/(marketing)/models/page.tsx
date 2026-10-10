import { EditorialTemplate } from "@/components/editorial/EditorialTemplate";
import { modelsPage } from "@/lib/content/models-page";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(modelsPage.path, modelsPage.metaTitle, modelsPage.metaDescription);

export default function Page() {
  return <EditorialTemplate page={modelsPage} />;
}
