// Regenerates icons/icon{16,32,48,128}.png: a graphite rounded square with a light ring and a dot (an orbit). Pure Node, no dependencies.
// Run: node extension/tools/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };

function render(size) {
  const S = 4; // supersample
  const px = Buffer.alloc(size * size * 4);
  const bg = [27, 29, 34], ink = [143, 180, 255];
  const R = size * 0.22, cx = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0, rr = 0, gg = 0, bb = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const X = x + (sx + 0.5) / S, Y = y + (sy + 0.5) / S;
      const dx = Math.max(Math.abs(X - cx) - (cx - R), 0), dy = Math.max(Math.abs(Y - cx) - (cx - R), 0);
      if (Math.hypot(dx, dy) > R) continue;
      const d = Math.hypot(X - cx, Y - cx);
      const ring = Math.abs(d - size * 0.27) < size * 0.05;
      const dot = Math.hypot(X - (cx + size * 0.27 * Math.cos(-0.8)), Y - (cx + size * 0.27 * Math.sin(-0.8))) < size * 0.1;
      const c = ring || dot ? ink : bg;
      a++; rr += c[0]; gg += c[1]; bb += c[2];
    }
    const i = (y * size + x) * 4;
    if (a) { px[i] = Math.round(rr / a); px[i + 1] = Math.round(gg / a); px[i + 2] = Math.round(bb / a); px[i + 3] = Math.round((255 * a) / (S * S)); }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
for (const s of [16, 32, 48, 128]) writeFileSync(join(dir, `icon${s}.png`), render(s));
console.log("icons written to", dir);
