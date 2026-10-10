// Builds the Keplar Apps browser runtime into public/fx (committed output, so deploys need no build step):
// kapp.<v>.js (window.keplar SDK), kapp-ui.<v>.js (Preact + hooks + htm as window.kui), kapp-three.<v>.js (window.THREE).
// Needs the dev dependencies preact and htm (or KAPP_VENDOR_PATH pointing at a node_modules that has them).
import { build } from "esbuild";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const V = readFileSync("src/lib/app-builder/runtime-paths.ts", "utf8").match(/KAPP_VERSION = "(\d+)"/)[1];
const common = { bundle: true, minify: true, target: ["es2019"], legalComments: "none", logLevel: "warning", format: "iife", nodePaths: process.env.KAPP_VENDOR_PATH ? [process.env.KAPP_VENDOR_PATH] : [], define: { "process.env.NODE_ENV": '"production"' } };
const out = { [`kapp.${V}.js`]: "src/lib/app-builder/sdk/kapp.src.js", [`kapp-ui.${V}.js`]: "src/lib/app-builder/sdk/kapp-ui.src.js", [`kapp-three.${V}.js`]: "src/lib/app-builder/sdk/kapp-three.src.js" };
for (const [file, entry] of Object.entries(out)) await build({ ...common, entryPoints: [entry], outfile: `public/fx/${file}` });
const manifestPath = "public/fx/manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const f of Object.keys(out)) {
  const b = readFileSync(`public/fx/${f}`);
  manifest[f] = { bytes: statSync(`public/fx/${f}`).size, gzip: gzipSync(b).length, sha256: createHash("sha256").update(b).digest("hex").slice(0, 16) };
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(Object.fromEntries(Object.keys(out).map((f) => [f, manifest[f]])));
