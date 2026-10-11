import type { Metadata } from "next";
import { BusinessWorkspace } from "@/components/business-app/BusinessWorkspace";
import { geist, geistMono } from "@/components/business-site/fonts";

export const metadata: Metadata = { title: "Workspace", robots: { index: false, follow: false } };

/** business.keplar.one/work: the Keplar Business workspace (it shows its own sign-in and plan gate). */
export default function WorkPage() {
  return <BusinessWorkspace fontClass={`${geist.variable} ${geistMono.variable}`} />;
}
