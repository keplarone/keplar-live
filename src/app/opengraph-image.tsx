import { ogContentType, ogSize, renderOg } from "@/lib/og";

export const alt = "Keplar — One question. Multiple intelligences. One answer.";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOg({ title: "Stop trusting one AI.", subtitle: "One question. Multiple intelligences. One answer." });
}
