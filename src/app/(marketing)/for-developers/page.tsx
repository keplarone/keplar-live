import { LandingTemplate } from "@/components/growth/LandingTemplate";
import { developersPage } from "@/lib/growth/developers-page";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(developersPage.path, developersPage.metaTitle, developersPage.metaDescription);

export default function Page() {
  return <LandingTemplate page={developersPage} />;
}
