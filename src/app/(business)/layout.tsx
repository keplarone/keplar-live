import { geist, geistMono } from "@/components/business-site/fonts";
import s from "@/components/business-site/business-site.module.css";

/**
 * Keplar Business pages (business.keplar.one storefront, keplar.one/business-account): their own permanently dark chrome in
 * Geist, separate from Keplar One's light marketing layout. No Keplar One nav, footer or study/consumer links.
 */
export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className={`${s.root} ${geist.variable} ${geistMono.variable}`} data-business="">
      {children}
    </main>
  );
}
