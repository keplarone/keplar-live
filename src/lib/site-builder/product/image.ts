/**
 * Checks and prepares one imported image (an upload or a download from a product page).
 * Rules: only real PNG / JPEG / WebP / GIF / AVIF bytes (sniffed, never trusted from headers; SVG and everything else is
 * refused); bounded pixels (no decompression bombs); the original bytes are kept untouched whenever they are PNG/JPEG/WebP,
 * at most 4096 px on the long edge and under the storage cap. Otherwise: GIF/AVIF become PNG (lossless), oversized pixels
 * are scaled down once, and an over-cap file loses resolution before quality. A JPEG that carries GPS location is
 * re-encoded without metadata (q98, 4:4:4) because the image will be public.
 */
import sharp, { type Metadata } from "sharp";
import { MAX_ASSET_BYTES, MAX_ASSET_EDGE } from "./limits";

export class ImageRejected extends Error {}

export type PreparedImage = { bytes: Buffer; contentType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number; original: boolean; notes: string[] };

export type Sniffed = "png" | "jpeg" | "webp" | "gif" | "avif";
export function sniff(b: Buffer): Sniffed | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.toString("latin1", 0, 4) === "GIF8") return "gif";
  if (b.toString("latin1", 4, 8) === "ftyp" && /avif|avis/.test(b.toString("latin1", 8, 16))) return "avif";
  return null;
}

/** True when an EXIF block holds a GPS IFD (tag 0x8825 in IFD0). */
export function exifHasGps(exif: Buffer | undefined): boolean {
  if (!exif || exif.length < 20) return false;
  const o = exif.toString("latin1", 0, 4) === "Exif" ? 6 : 0;
  const le = exif.toString("latin1", o, o + 2) === "II";
  const u16 = (p: number) => (le ? exif.readUInt16LE(p) : exif.readUInt16BE(p));
  const u32 = (p: number) => (le ? exif.readUInt32LE(p) : exif.readUInt32BE(p));
  try {
    const ifd = o + u32(o + 4);
    const n = u16(ifd);
    for (let i = 0; i < n && i < 200; i++) if (u16(ifd + 2 + i * 12) === 0x8825) return true;
  } catch {
    return false;
  }
  return false;
}

const TYPE = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

export async function prepareImage(input: Buffer, opts: { minEdge?: number } = {}): Promise<PreparedImage> {
  const kind = sniff(input);
  if (!kind) throw new ImageRejected("That file isn't a PNG, JPG, WebP, GIF or AVIF image.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 80_000_000, failOn: "error" }).metadata();
  } catch {
    throw new ImageRejected("That image couldn't be read, or it is too large to process.");
  }
  const w0 = meta.width ?? 0;
  const h0 = meta.height ?? 0;
  const orient = meta.orientation ?? 1;
  const w = orient >= 5 ? h0 : w0;
  const h = orient >= 5 ? w0 : h0;
  if (!w || !h) throw new ImageRejected("That image has no size.");
  if (Math.min(w, h) < (opts.minEdge ?? 32)) throw new ImageRejected("That image is too small to use.");
  const notes: string[] = [];
  const long = Math.max(w, h);
  const gps = kind !== "png" && exifHasGps(meta.exif);
  const rotated = orient !== 1;
  const keep = (kind === "png" || kind === "jpeg" || kind === "webp") && long <= MAX_ASSET_EDGE && input.length <= MAX_ASSET_BYTES && !gps && !(kind === "jpeg" && rotated);
  if (keep) return { bytes: input, contentType: TYPE[kind], width: w, height: h, original: true, notes };

  const hasAlpha = Boolean(meta.hasAlpha);
  const base = () => sharp(input, { limitInputPixels: 80_000_000, failOn: "error", animated: false }).rotate();
  const scale = long > MAX_ASSET_EDGE ? MAX_ASSET_EDGE / long : 1;
  if (scale < 1) notes.push(`Scaled down to ${MAX_ASSET_EDGE}px on the long edge.`);
  if (gps) notes.push("Location data was removed from the photo.");
  const dims = (f: number) => ({ width: Math.max(1, Math.round(w * f)), height: Math.max(1, Math.round(h * f)) });
  const encode = async (f: number, pass: number) => {
    const d = dims(f);
    let p = base();
    if (f < 1) p = p.resize({ width: d.width, height: d.height, kernel: "lanczos3", fit: "fill" });
    // Pass 0 stays as close to the source as possible; later passes trade quality, never below q88.
    if (kind === "png" || kind === "gif") {
      if (pass === 0) return { buf: await p.png({ compressionLevel: 9, effort: 8 }).toBuffer(), type: "image/png" as const, d };
      return { buf: await p.webp({ quality: 95, alphaQuality: 100, effort: 5 }).toBuffer(), type: "image/webp" as const, d };
    }
    if (kind === "webp" || (kind === "avif" && hasAlpha)) return { buf: await p.webp({ quality: pass === 0 ? 98 : 92, alphaQuality: 100, effort: 5 }).toBuffer(), type: "image/webp" as const, d };
    return { buf: await p.jpeg({ quality: pass === 0 ? 98 : pass === 1 ? 94 : 90, chromaSubsampling: "4:4:4", mozjpeg: false }).toBuffer(), type: "image/jpeg" as const, d };
  };
  let f = scale;
  for (let pass = 0; pass < 8; pass++) {
    const out = await encode(f, Math.min(pass, 3));
    if (out.buf.length <= MAX_ASSET_BYTES) {
      if (kind === "gif" || kind === "avif") notes.push(`Converted from ${kind.toUpperCase()}.`);
      if (f < scale) notes.push("Reduced in resolution to fit the storage limit.");
      return { bytes: out.buf, contentType: out.type, width: out.d.width, height: out.d.height, original: false, notes };
    }
    f *= 0.85;
  }
  throw new ImageRejected("That image is too large to store. Try a smaller export.");
}
