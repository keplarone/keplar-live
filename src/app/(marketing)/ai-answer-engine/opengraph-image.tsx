import { landingBySlug } from "@/lib/content/landing";
import { ogContentType, ogSize, renderOg } from "@/lib/og";

const page = landingBySlug("ai-answer-engine")!;

export const alt = page.ogTitle;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ label: page.label, title: page.ogTitle, subtitle: "One question. Multiple intelligences. One answer." });
}
