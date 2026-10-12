import { Geist, Geist_Mono, IBM_Plex_Sans } from "next/font/google";

/** Keplar Business type: Geist and Geist Mono (storefront, account setup and the desktop workspace). */
export const geist = Geist({ subsets: ["latin"], variable: "--biz-sans", display: "swap" });
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--biz-mono", display: "swap" });
/** The "Keplar Business" wordmark: IBM Plex Sans, a technical, professional face (Plex Mono is already Keplar's code font). Self-hosted by next/font. */
export const brandSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["500", "600"], variable: "--biz-brand", display: "swap" });
