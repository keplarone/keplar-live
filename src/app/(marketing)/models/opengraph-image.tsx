import { modelsPage } from "@/lib/content/models-page";
import { ogContentType, ogSize, renderOg } from "@/lib/og";

export const alt = modelsPage.ogTitle;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ label: modelsPage.label, title: modelsPage.ogTitle, subtitle: "One question. Multiple intelligences. One answer." });
}
