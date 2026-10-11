import { ogContentType, ogSize, renderHomeOg } from "@/lib/og";

export const alt = "Keplar — Everything you can think of. One AI.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderHomeOg({
    title: "Everything you can think of.",
    accent: "One AI.",
    subtitle: "Ask, research, create, build and ship, with the AI models each task needs.",
  });
}
