import type { Metadata } from "next";
import { Storefront } from "@/components/business-site/Storefront";
import { JsonLd } from "@/components/seo/JsonLd";
import { BUSINESS_DESCRIPTION, BUSINESS_ORIGIN, BUSINESS_TITLE, businessGraph } from "@/lib/business/seo";

const share = { url: `${BUSINESS_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "Keplar Business" };

export const metadata: Metadata = {
  title: { absolute: BUSINESS_TITLE },
  description: BUSINESS_DESCRIPTION,
  alternates: { canonical: `${BUSINESS_ORIGIN}/` },
  // Its own card: before, shares of business.keplar.one showed Keplar One's.
  openGraph: { title: BUSINESS_TITLE, description: BUSINESS_DESCRIPTION, url: `${BUSINESS_ORIGIN}/`, siteName: "Keplar Business", type: "website", locale: "en_US", images: [share] },
  twitter: { card: "summary_large_image", title: BUSINESS_TITLE, description: BUSINESS_DESCRIPTION, images: [share.url] },
};

/** business.keplar.one/ (src/proxy.ts maps it to /biz): pricing, account status, the workspace, download and sales inquiries. */
export default function BusinessLanding() {
  return (
    <>
      <JsonLd data={businessGraph()} />
      <Storefront />
    </>
  );
}
