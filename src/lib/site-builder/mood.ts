/**
 * Mood board colors. A reference image is read once for its dominant colors and thrown away: it is never stored, shown on the
 * site or sent to a model (copyright-safe inspiration only). Up to five distinct, usable colors come back.
 */
import sharp from "sharp";
import { toHex } from "./color";

export class MoodError extends Error {}

export async function paletteOf(bytes: Buffer, max = 5): Promise<string[]> {
  let raw: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    const img = sharp(bytes, { limitInputPixels: 80_000_000 });
    const meta = await img.metadata();
    if (!meta.format || !["jpeg", "png", "webp", "gif", "avif"].includes(meta.format)) throw new MoodError("Use a JPEG, PNG, WebP, GIF or AVIF image.");
    raw = await img.rotate().resize(48, 48, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (e) {
    throw e instanceof MoodError ? e : new MoodError("That image couldn't be read.");
  }
  const { data, info } = raw;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++; cur.r += r; cur.g += g; cur.b += b;
    buckets.set(key, cur);
  }
  const cand = [...buckets.values()].map((c) => ({ n: c.n, r: Math.round(c.r / c.n), g: Math.round(c.g / c.n), b: Math.round(c.b / c.n) })).sort((a, b) => b.n - a.n);
  const chosen: { r: number; g: number; b: number }[] = [];
  const dist = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  for (const c of cand) {
    if (chosen.every((x) => dist(x, c) > 54)) chosen.push(c);
    if (chosen.length >= max) break;
  }
  return chosen.map((c) => toHex([c.r, c.g, c.b]));
}
