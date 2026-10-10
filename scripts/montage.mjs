// Dev helper: tile screenshots into one contact sheet. node scripts/montage.mjs out.png cols w a.png b.png ...
import sharp from "sharp";
const [out, colsArg, wArg, ...files] = process.argv.slice(2);
const cols = +colsArg, w = +wArg;
const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
const h = Math.round((metas[0].height / metas[0].width) * w);
const tiles = await Promise.all(files.map((f) => sharp(f).resize(w, h).toBuffer()));
const rows = Math.ceil(files.length / cols);
await sharp({ create: { width: cols * w + (cols - 1) * 6, height: rows * h + (rows - 1) * 6, channels: 3, background: "#777" } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * (w + 6), top: Math.floor(i / cols) * (h + 6) })))
  .png().toFile(out);
