import { LandingTemplate } from "@/components/growth/LandingTemplate";
import { landingBySlug } from "@/lib/content/landing";
import { pageMeta } from "@/lib/seo";

const page = landingBySlug("for-small-business")!;

export const metadata = pageMeta(page.path, page.metaTitle, page.metaDescription);

export default function Page() {
  return <LandingTemplate page={page} />;
}
