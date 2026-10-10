import { createLanding as page } from "@/lib/growth/create-landing";
import { ogContentType, ogSize, renderOg } from "@/lib/og";

export const alt = page.ogTitle;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ label: page.label, title: page.ogTitle, subtitle: "Planned, built, tested in a real browser, fixed." });
}
