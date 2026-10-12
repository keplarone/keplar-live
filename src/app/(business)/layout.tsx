import type { Metadata } from "next";
import { brandSans, geist, geistMono } from "@/components/business-site/fonts";
import { BUSINESS_ICONS, BUSINESS_MANIFEST_PATH } from "@/lib/business-site";
import s from "@/components/business-site/business-site.module.css";

export const metadata: Metadata = {
  title: { default: "Keplar Business", template: "%s · Keplar Business" },
  applicationName: "Keplar Business",
  openGraph: { siteName: "Keplar Business" },
  icons: BUSINESS_ICONS,
  manifest: BUSINESS_MANIFEST_PATH,
};

/**
 * Keplar Business storefront pages (business.keplar.one/ and /account): their own permanently dark chrome in Geist, separate
 * from Keplar One. No Keplar One nav, footer or study/consumer links. The workspace has its own layout ((business-app)).
 */
export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className={`${s.root} ${geist.variable} ${geistMono.variable} ${brandSans.variable}`} data-business="">
      {children}
    </main>
  );
}
