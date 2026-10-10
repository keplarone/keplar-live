import { EditorialTemplate } from "@/components/editorial/EditorialTemplate";
import { editorialBySlug } from "@/lib/content/editorial";
import { pageMeta } from "@/lib/seo";

const page = editorialBySlug("superintelligence")!;

export const metadata = {
  ...pageMeta(page.path, page.metaTitle, page.metaDescription, { article: { published: page.published, modified: page.updated } }),
};

export default function Page() {
  return <EditorialTemplate page={page} />;
}
