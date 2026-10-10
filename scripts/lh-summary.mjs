// Summarise Lighthouse JSON files in a dir: node scripts/lh-summary.mjs <dir>
import fs from "node:fs";
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const j = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  const c = j.categories, a = j.audits;
  const v = (k) => a[k]?.displayValue ?? "n/a";
  console.log(f.replace(".json", "").padEnd(40), `perf ${Math.round(c.performance.score * 100)} a11y ${Math.round(c.accessibility.score * 100)} bp ${Math.round(c["best-practices"].score * 100)} seo ${Math.round(c.seo.score * 100)} | LCP ${v("largest-contentful-paint")} TBT ${v("total-blocking-time")} CLS ${v("cumulative-layout-shift")} FCP ${v("first-contentful-paint")} | weight ${v("total-byte-weight")}`);
}
