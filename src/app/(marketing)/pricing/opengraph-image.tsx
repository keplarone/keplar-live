import { ogContentType, ogSize, renderOg } from "@/lib/og";

export const alt = "Keplar pricing — Free, Lite $20, Plus $45, Pro $99, Business custom.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ label: "Pricing", title: "Start free. Upgrade when you need more.", subtitle: "Free · Lite $20 · Plus $45 · Pro $99 · Business custom" });
}
