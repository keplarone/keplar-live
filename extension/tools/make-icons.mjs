// Regenerates icons/icon{16,32,48,128}.png: the Keplar mark (rounded square, triangle, circle; the geometry in
// src/components/brand/geometry.ts, same as the site's favicon) in white on a near-black rounded tile, so it reads on light
// and dark browser toolbars. The 128 px store and install icon keeps the 16 px transparent margin the Chrome Web Store asks
// for (96 px artwork); toolbar sizes fill their square. Run: node extension/tools/make-icons.mjs
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The mark in its own 398 x 398 box (src/components/brand/geometry.ts markShapes).
const MARK = 398;
const SHAPES = `
  <rect x="0" y="0" width="229" height="229" rx="70"/>
  <path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z"/>
  <circle cx="281" cy="281" r="117"/>`;

/** `pad`: transparent margin around the tile. `inset`: the mark's margin inside the tile, as a share of the tile. */
function svg(size, pad = 0) {
  const tile = size - 2 * pad;
  const inset = tile * (size <= 16 ? 0.16 : 0.2);
  const scale = (tile - 2 * inset) / MARK;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${tile}" height="${tile}" rx="${tile * 0.24}" fill="#0a0a0a"/>
  <g fill="#ffffff" transform="translate(${pad + inset} ${pad + inset}) scale(${scale})">${SHAPES}</g>
</svg>`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
for (const [size, pad] of [[16, 0], [32, 0], [48, 0], [128, 16]]) {
  await sharp(Buffer.from(svg(size, pad)), { density: 72 * 8 }).resize(size, size).png({ compressionLevel: 9 }).toFile(join(dir, `icon${size}.png`));
}
console.log("icons written to", dir);
