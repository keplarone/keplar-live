import { aboutPage } from "@/lib/content/about-page";
import { ogContentType, ogSize, renderOg } from "@/lib/og";

export const alt = aboutPage.ogTitle;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ label: aboutPage.label, title: aboutPage.ogTitle, subtitle: "Created by two co-founders, Hassen and Hussain Keder." });
}
