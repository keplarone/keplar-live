/** Hostnames we will fetch a favicon for. The path is always /favicon.ico; callers cannot pass a URL. */
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function faviconUrl(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!DOMAIN.test(d)) return null;
  if (d === "localhost" || d.endsWith(".local") || d.endsWith(".internal") || d.endsWith(".localhost")) return null;
  return `https://${d}/favicon.ico`;
}

const PNG = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const JPEG = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const GIF = (b: Buffer) => b.length > 6 && b.subarray(0, 4).toString("ascii") === "GIF8";
const ICO = (b: Buffer) => b.length > 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0;
const WEBP = (b: Buffer) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";

/** Image bytes only. SVG is refused: a same-origin SVG can carry script. */
export function faviconType(body: Buffer): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/x-icon" | null {
  if (PNG(body)) return "image/png";
  if (JPEG(body)) return "image/jpeg";
  if (GIF(body)) return "image/gif";
  if (WEBP(body)) return "image/webp";
  if (ICO(body)) return "image/x-icon";
  return null;
}
