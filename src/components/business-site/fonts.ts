import { Geist, Geist_Mono, Inter } from "next/font/google";

/** Keplar Business type: Geist and Geist Mono (storefront, account setup and the desktop workspace). */
export const geist = Geist({ subsets: ["latin"], variable: "--biz-sans", display: "swap" });
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--biz-mono", display: "swap" });
/** The "Keplar Business" wordmark: Inter, the usual professional product face (self-hosted by next/font, like Geist). */
export const brandSans = Inter({ subsets: ["latin"], weight: ["500", "600"], variable: "--biz-brand", display: "swap" });
