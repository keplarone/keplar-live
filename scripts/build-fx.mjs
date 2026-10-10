// Builds the vendored Keplar site-effects runtime into public/fx (committed output, so deploys need no build step).
// kfx.src.js -> kfx.<v>.js (loader, minified); gl.src.ts + three (tree-shaken) -> kfx-gl.<v>.js (IIFE exposing window.__kfxGL).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const V = readFileSync("src/lib/site-builder/fx/types.ts", "utf8").match(/FX_VERSION = "(\d+)"/)[1];
mkdirSync("public/fx", { recursive: true });
const common = { bundle: true, minify: true, target: ["es2019"], legalComments: "none", logLevel: "warning" };
await build({ ...common, entryPoints: ["src/lib/site-builder/fx/kfx.src.js"], outfile: `public/fx/kfx.${V}.js`, format: "iife" });
await build({
  ...common,
  entryPoints: ["src/lib/site-builder/fx/gl.src.ts"],
  outfile: `public/fx/kfx-gl.${V}.js`,
  format: "iife",
  globalName: "__kfxGLmod",
  footer: { js: "window.__kfxGL=__kfxGLmod;" },
  define: { "process.env.NODE_ENV": '"production"' },
});
const manifest = {};
for (const f of [`kfx.${V}.js`, `kfx-gl.${V}.js`]) {
  const b = readFileSync(`public/fx/${f}`);
  manifest[f] = { bytes: statSync(`public/fx/${f}`).size, gzip: gzipSync(b).length, sha256: createHash("sha256").update(b).digest("hex").slice(0, 16) };
}
writeFileSync("public/fx/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(manifest);
