import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/page/RoutePlaceholder";
import { Nav } from "@/components/chrome/Nav";
import { Footer } from "@/components/chrome/Footer";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <>
      <Nav />
      <main id="main">
    <RoutePlaceholder
      label="404"
      title="Nothing converged here."
      lede="The page you were looking for doesn't exist or has moved."
      cta={{ href: "/", label: "Back to Keplar" }}
    />
      </main>
      <Footer />
    </>
  );
}
