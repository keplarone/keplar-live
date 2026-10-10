import { Geist, Geist_Mono } from "next/font/google";
import s from "@/components/business-site/business-site.module.css";

const geist = Geist({ subsets: ["latin"], variable: "--biz-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--biz-mono", display: "swap" });

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
