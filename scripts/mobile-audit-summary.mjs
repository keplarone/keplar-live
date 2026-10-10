// node scripts/audit-summary.mjs <chromium.json> [other.json]   -> unique findings across widths
import fs from "node:fs";
const load = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const sum = (rows) => {
  const m = new Map();
  const add = (k, r) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(r.route + "@" + r.w); };
  for (const r of rows) {
    if (r.over > 1) add(`H-OVERFLOW`, r);
    for (const c of r.cut || []) add(`CUT "${c.t}" by ${c.by}`, r);
    for (const c of (r.clipped || []).filter((c) => c.cw > 2 && c.ch > 2)) add(`CLIP ${c.s}`, r);
    for (const t of (r.small || []).filter((t) => !t.inline)) add(`TAP<44 ${t.s.replace(/ ".*/, "")}`, r);
    for (const i of r.inputs || []) add(`INPUT<16 ${i.s.replace(/".*/, "").slice(0, 60)}`, r);
  }
  return m;
};
const a = sum(load(process.argv[2]));
const rows = [...a].sort((x, y) => y[1].size - x[1].size);
let tap = 0, other = 0;
for (const [k, v] of rows) { if (k.startsWith("TAP")) tap++; else other++; console.log(String(v.size).padStart(3), k.slice(0, 150), "|", [...v].slice(0, 2).join(", ")); }
console.log(`\n${rows.length} unique findings (${tap} tap-target, ${other} other) over ${load(process.argv[2]).length} cells`);
