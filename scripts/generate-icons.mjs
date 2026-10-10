// Generates favicon.ico, icon.png, apple-icon.png and manifest icons from the
// founder-supplied favicon artwork (assets/keplar-favicon.png).
// Tiny sizes (16/32/48 + icon.png) use a tighter crop of the SAME artwork so the
// mark stays legible in a browser tab; large sizes keep the founder's padding.
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const SRC = "assets/keplar-favicon.png";
const APP = "src/app";
const PUB = "public/icons";
mkdirSync(PUB, { recursive: true });

// Artwork bounds measured from the 512px source: shapes span ~91..420 on both axes.
const TIGHT = { left: 70, top: 70, width: 372, height: 372 };

const flat = () => sharp(SRC).flatten({ background: "#ffffff" });
const tight = (size) =>
  flat().extract(TIGHT).resize(size, size, { kernel: "lanczos3" }).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();
const full = (size) => flat().resize(size, size, { kernel: "lanczos3" }).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();

// Minimal ICO encoder with PNG-compressed entries (supported by all modern browsers).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.buf)]);
}

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(icoSizes.map(async (size) => ({ size, buf: await tight(size) })));
writeFileSync(`${APP}/favicon.ico`, ico(icoImages));
writeFileSync(`${APP}/icon.png`, await tight(96));
writeFileSync(`${APP}/apple-icon.png`, await full(180));
writeFileSync(`${PUB}/icon-192.png`, await full(192));
writeFileSync(`${PUB}/icon-512.png`, await full(512));
// Maskable: the artwork shrunk into the 80% safe zone on a white field.
writeFileSync(
  `${PUB}/icon-512-maskable.png`,
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#ffffff" } })
    .composite([{ input: await flat().extract(TIGHT).resize(330, 330).png().toBuffer(), gravity: "center" }])
    .png()
    .toBuffer(),
);

// Legibility previews (not shipped): 16 and 32 upscaled with nearest-neighbour.
mkdirSync("screenshots/icons", { recursive: true });
for (const s of [16, 32]) {
  await sharp(await tight(s)).resize(s * 8, s * 8, { kernel: "nearest" }).toFile(`screenshots/icons/preview-${s}.png`);
  await sharp(await full(s)).resize(s * 8, s * 8, { kernel: "nearest" }).toFile(`screenshots/icons/preview-${s}-padded.png`);
}
console.log("icons written");
