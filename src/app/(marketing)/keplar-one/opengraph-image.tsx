import { brand } from "@/lib/site";
import { ogContentType, ogSize, renderOg } from "@/lib/og";

export const alt = `${brand.engineName} — the intelligence behind the intelligences.`;
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ label: `${brand.engineName}`, title: "The intelligence behind the intelligences.", subtitle: "Classify. Route. Compare. Verify. Synthesize." });
}
