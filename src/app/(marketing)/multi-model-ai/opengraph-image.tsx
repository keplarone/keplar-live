import { editorialBySlug } from "@/lib/content/editorial";
import { ogContentType, ogSize, renderOg } from "@/lib/og";

const page = editorialBySlug("multi-model-ai")!;

export const alt = page.ogTitle;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ label: page.label, title: page.ogTitle, subtitle: "One question. Multiple intelligences. One answer." });
}
