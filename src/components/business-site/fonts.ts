import { Geist, Geist_Mono, Google_Sans } from "next/font/google";

/** Keplar Business type: Geist and Geist Mono (storefront, account setup and the desktop workspace). */
export const geist = Geist({ subsets: ["latin"], variable: "--biz-sans", display: "swap" });
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--biz-mono", display: "swap" });
/** The "Keplar Business" wordmark: Google Sans, Keplar's own typeface (the root layout's sitewide font), so "Keplar" reads the same in Keplar One and Keplar Business. Self-hosted by next/font. */
export const brandSans = Google_Sans({ subsets: ["latin"], variable: "--biz-brand", display: "swap", adjustFontFallback: true });
