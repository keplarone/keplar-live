import type { Metadata } from "next";
import { BusinessWorkspace } from "@/components/business-app/BusinessWorkspace";
import { geist, geistMono } from "@/components/business-site/fonts";

export const metadata: Metadata = { title: "Keplar Business", robots: { index: false, follow: false } };

/** The Keplar Business workspace (the desktop app opens it for accounts with a Business plan). */
export default function WorkPage() {
  return <BusinessWorkspace fontClass={`${geist.variable} ${geistMono.variable}`} />;
}
