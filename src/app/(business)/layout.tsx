import type { Metadata } from "next";
import { BUSINESS_ICONS, BUSINESS_MANIFEST_PATH } from "@/lib/business-site";
import s from "@/components/business-site/business-site.module.css";
import "@/components/business-site/tokens.css";
import { SkyBackdrop } from "@/components/sky/SkyBackdrop";

export const metadata: Metadata = {
  title: { default: "Keplar Business", template: "%s · Keplar Business" },
  applicationName: "Keplar Business",
  openGraph: { siteName: "Keplar Business" },
  icons: BUSINESS_ICONS,
  manifest: BUSINESS_MANIFEST_PATH,
};

/**
 * Keplar Business storefront pages (business.keplar.one/ and /account): their own chrome over the site's shared weather sky,
 * separate from Keplar One, in the family's Space UI and Montserrat (the root layout's font). No Keplar One nav, footer or study/consumer
 * links. The workspace has its own layout ((business-app)).
 */
export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkyBackdrop />
      <main id="main" className={s.root} data-business="" data-kb="">
        {children}
      </main>
    </>
  );
}
