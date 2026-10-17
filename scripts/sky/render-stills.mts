/**
 * Renders the weather sky's first-paint stills (public/sky) with the live renderer itself (src/lib/sky/renderer.ts) in headless
 * Chromium (software WebGL via SwiftShader), so the still a visitor sees first is the same picture the live canvas continues.
 * Every variant x theme, at 1600x1000 (desktop, landscape) and 800x1000 (phones, portrait crop of the same camera), each the
 * average of several jittered frames (noise-free), saved as AVIF + WebP.
 *
 *   node --import tsx scripts/sky/render-stills.mts                       # everything into public/sky
 *   node --import tsx scripts/sky/render-stills.mts --only rain:dark --out /tmp/x --png   # one look, for iterating
 *
 * Env: SKY_CHROMIUM=<path to chrome or headless_shell> (default: Playwright's bundled Chromium).
 */
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SKY_VARIANTS, STILL_LARGE, STILL_SMALL, stillName, type SkyTheme, type SkyVariant } from "../../src/lib/sky/variants";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = path.resolve(import.meta.dirname, "../..");
const out = path.resolve(opt("out") ?? path.join(root, "public/sky"));
const only = opt("only")?.split(",").map((s) => s.split(":") as [SkyVariant, SkyTheme]);
const sizes = (opt("sizes") ?? "large,small").split(",");
const frames = Number(opt("frames") ?? 8);
const steps = Number(opt("steps") ?? 64);
const png = args.includes("--png");
const time = Number(opt("time") ?? 0);

const bundle = await build({
  stdin: {
    contents: `import { SkyRenderer } from "./src/lib/sky/renderer"; (window as any).SkyRenderer = SkyRenderer;`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  write: false,
  alias: { "@": path.join(root, "src") },
  logLevel: "error",
});
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c"></canvas><script>${bundle.outputFiles[0]!.text}</script>`;

const browser = await chromium.launch({
  executablePath: process.env.SKY_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
await page.setContent(html);
await page.evaluate(async () => {
  type W = Window & { SkyRenderer: typeof import("../../src/lib/sky/renderer").SkyRenderer; sky?: unknown };
  const w = window as unknown as W;
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  const r = w.SkyRenderer.create(canvas, { scale: 1, steps: 64, history: 1, px: 1 }, { preserveDrawingBuffer: true, powerPreference: "default" });
  if (!r) throw new Error("no WebGL2");
  await r.bake(() => new Promise((res) => setTimeout(res, 0)), 8);
  w.sky = r;
});

mkdirSync(out, { recursive: true });
const jobs: [SkyVariant, SkyTheme][] = only ?? SKY_VARIANTS.flatMap((v) => (["light", "dark"] as const).map((t) => [v, t] as [SkyVariant, SkyTheme]));
for (const [variant, theme] of jobs) {
  for (const size of sizes) {
    const small = size === "small";
    const preview = Number(opt("preview") ?? 1); // e.g. 0.5 renders at half size for quick looks
    const base = small ? STILL_SMALL : STILL_LARGE;
    const dim = { width: Math.round(base.width * preview), height: Math.round(base.height * preview) };
    const t0 = Date.now();
    const dataUrl = await page.evaluate(
      ({ variant, theme, dim, small, frames, steps, time }) => {
        const r = (window as unknown as { sky: import("../../src/lib/sky/renderer").SkyRenderer }).sky;
        r.opts = { scale: 1, steps, history: 1, px: small ? 1.2 : 1, refAspect: dim.width / dim.height };
        r.setLook(variant, theme, 1);
        r.resize(dim.width, dim.height);
        for (let i = 0; i < frames; i++) r.clouds(time, 1 / (i + 1)); // running average of jittered frames
        r.composite({ time });
        r.gl.finish();
        return (r.gl.canvas as HTMLCanvasElement).toDataURL("image/png");
      },
      { variant, theme, dim, small, frames, steps, time },
    );
    const buf = Buffer.from(dataUrl.split(",")[1]!, "base64");
    const stem = path.join(out, stillName(variant, theme, small));
    if (png) writeFileSync(`${stem}.png`, buf);
    const img = sharp(buf);
    const avif = await img.clone().avif({ quality: small ? 50 : 52, effort: 7, chromaSubsampling: "4:2:0" }).toBuffer();
    const webp = await img.clone().webp({ quality: 72, effort: 6, smartSubsample: true }).toBuffer();
    writeFileSync(`${stem}.avif`, avif);
    writeFileSync(`${stem}.webp`, webp);
    console.log(`${stillName(variant, theme, small)}: avif ${(avif.length / 1024).toFixed(1)} KB, webp ${(webp.length / 1024).toFixed(1)} KB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
}
await browser.close();
