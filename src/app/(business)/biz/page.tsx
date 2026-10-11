import type { Metadata } from "next";
import { Storefront } from "@/components/business-site/Storefront";

export const metadata: Metadata = {
  title: { absolute: "Keplar Business: the AI operating system for your business" },
  description: "Research, design, build, automate and deploy from one desktop workspace. Plans from $199.99 a month, Enterprise by contract.",
  alternates: { canonical: "https://business.keplar.one/" },
};

/** business.keplar.one/ (src/proxy.ts maps it to /biz): pricing, account status, the workspace, download and sales inquiries. */
export default function BusinessLanding() {
  return <Storefront />;
}
