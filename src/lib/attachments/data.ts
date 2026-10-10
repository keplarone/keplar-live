/**
 * Tabular data: CSV/TSV parsing, JSON flattening and a statistical profile computed in code. Models are bad at arithmetic
 * over thousands of rows, so Keplar never asks them to estimate: the profile (counts, missing values, min/max, mean, median,
 * quartiles, standard deviation, sums, top categories, date ranges and the strongest correlations) is exact and travels with
 * the data, labeled as computed. Pure: shared by the extractor and the tests.
 */

export type Cell = string | number | null;
export type Table = { name: string; header: string[]; rows: Cell[][]; totalRows: number; truncated: boolean };

/* ───────────────────────── CSV ───────────────────────── */

/** The delimiter that splits the first lines most consistently. */
export function sniffDelimiter(sample: string): string {
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ",", bestScore = -1;
  for (const d of [",", "\t", ";", "|"]) {
    const counts = lines.map((l) => splitLine(l, d).length);
    if (!counts.length || counts[0] < 2) continue;
    const same = counts.filter((c) => c === counts[0]).length;
    const score = same * 10 + counts[0];
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  return parseCsv(line, d, 1)[0] ?? [];
}

/** RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. Stops after `maxRows` records. */
export function parseCsv(text: string, delimiter = ",", maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") { q = true; continue; }
    if (c === delimiter) { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (rows.length >= maxRows) return rows;
      continue;
    }
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

/* ───────────────────────── typing ───────────────────────── */

const NUM_RX = /^\(?[-+]?[$€£¥₹]?\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\)?%?$|^\(?[-+]?[$€£¥₹]?\s?\d*\.?\d+(?:e[-+]?\d+)?\)?%?$/i;
/** "1,234.5", "$12", "(30)", "45%" → number; anything else → null. */
export function toNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = v.trim();
  if (!s || !NUM_RX.test(s)) return null;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[(),$€£¥₹%\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
const DATE_RX = /^(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{2,4})$/;
export function toDate(v: Cell): number | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!DATE_RX.test(s)) return null;
  const t = Date.parse(s.includes("/") ? s : s.replace(" ", "T") + (s.length === 10 ? "T00:00:00Z" : "Z"));
  return Number.isFinite(t) ? t : null;
}
const isBlank = (v: Cell) => v == null || (typeof v === "string" && (!v.trim() || /^(na|n\/a|null|nan|none|-)$/i.test(v.trim())));

export type ColumnProfile =
  | { name: string; type: "number"; count: number; missing: number; min: number; max: number; mean: number; median: number; p25: number; p75: number; std: number; sum: number; unit?: string }
  | { name: string; type: "date"; count: number; missing: number; min: string; max: string; spanDays: number }
  | { name: string; type: "boolean"; count: number; missing: number; trueCount: number }
  | { name: string; type: "text"; count: number; missing: number; distinct: number; top: { value: string; count: number }[]; avgLength: number };

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function profileColumn(name: string, values: Cell[]): ColumnProfile {
  const present = values.filter((v) => !isBlank(v));
  const missing = values.length - present.length;
  const nums = present.map(toNumber);
  const numOk = nums.filter((n): n is number => n !== null);
  if (present.length && numOk.length / present.length >= 0.95) {
    const sorted = [...numOk].sort((a, b) => a - b);
    const sum = numOk.reduce((a, b) => a + b, 0);
    const mean = sum / numOk.length;
    const std = Math.sqrt(numOk.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, numOk.length - 1));
    const sample = present.find((v) => typeof v === "string") as string | undefined;
    const unit = sample ? (/[$€£¥₹]/.exec(sample)?.[0] ?? (sample.trim().endsWith("%") ? "%" : undefined)) : undefined;
    return { name, type: "number", count: numOk.length, missing: missing + (present.length - numOk.length), min: sorted[0], max: sorted[sorted.length - 1], mean, median: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), std, sum, ...(unit ? { unit } : {}) };
  }
  const dates = present.map(toDate).filter((d): d is number => d !== null);
  if (present.length && dates.length / present.length >= 0.95) {
    const min = Math.min(...dates), max = Math.max(...dates);
    return { name, type: "date", count: dates.length, missing, min: new Date(min).toISOString().slice(0, 10), max: new Date(max).toISOString().slice(0, 10), spanDays: Math.round((max - min) / 86_400_000) };
  }
  const bools = present.map((v) => String(v).trim().toLowerCase());
  if (present.length && bools.every((b) => /^(true|false|yes|no|y|n|0|1)$/.test(b)) && new Set(bools).size <= 4) {
    return { name, type: "boolean", count: present.length, missing, trueCount: bools.filter((b) => /^(true|yes|y|1)$/.test(b)).length };
  }
  const freq = new Map<string, number>();
  let len = 0;
  for (const v of present) {
    const s = String(v).trim();
    len += s.length;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value: value.slice(0, 60), count }));
  return { name, type: "text", count: present.length, missing, distinct: freq.size, top, avgLength: present.length ? Math.round(len / present.length) : 0 };
}

/** Pearson r for two numeric columns over rows where both are present. */
export function pearson(a: (number | null)[], b: (number | null)[]): { r: number; n: number } {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x == null || y == null) continue;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  const cov = sab - (sa * sb) / Math.max(1, n);
  const va = saa - (sa * sa) / Math.max(1, n), vb = sbb - (sb * sb) / Math.max(1, n);
  return { r: n > 2 && va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0, n };
}

/* ───────────────────────── tables ───────────────────────── */

/** First row is a header when it is all non-numeric text and the next rows contain numbers somewhere. */
export function looksLikeHeader(rows: Cell[][]): boolean {
  const first = rows[0] ?? [];
  if (!first.length) return false;
  const textual = first.every((v) => v != null && typeof v === "string" && v.trim() !== "" && toNumber(v) === null);
  if (!textual) return false;
  if (new Set(first.map((v) => String(v).trim().toLowerCase())).size !== first.length) return false;
  return true;
}

export function tableFrom(name: string, raw: Cell[][], maxRows: number): Table {
  const width = Math.min(200, Math.max(0, ...raw.slice(0, 50).map((r) => r.length)));
  const header = looksLikeHeader(raw) ? raw[0].slice(0, width).map((v, i) => String(v ?? "").trim() || `column_${i + 1}`) : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
  const body = looksLikeHeader(raw) ? raw.slice(1) : raw;
  const rows = body.slice(0, maxRows).map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? null : r[i])));
  return { name, header, rows, totalRows: body.length, truncated: body.length > maxRows };
}

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "n/a";
  const a = Math.abs(n);
  const v = a >= 1e6 || a === 0 || Number.isInteger(n) ? n : a >= 100 ? +n.toFixed(2) : +n.toPrecision(4);
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

/** The exact profile as text: one line per column, then correlations. */
export function profileText(t: Table): { text: string; columns: ColumnProfile[] } {
  const cols = t.header.map((h, i) => profileColumn(h, t.rows.map((r) => r[i])));
  const lines = [`Table "${t.name}": ${t.totalRows.toLocaleString("en-US")} rows × ${t.header.length} columns${t.truncated ? ` (statistics over the first ${t.rows.length.toLocaleString("en-US")} rows)` : ""}.`];
  for (const c of cols) {
    const miss = c.missing ? `, missing ${c.missing}` : "";
    if (c.type === "number") lines.push(`- ${c.name} (number${c.unit ? `, ${c.unit}` : ""}): n=${c.count}${miss}; min ${fmt(c.min)}, p25 ${fmt(c.p25)}, median ${fmt(c.median)}, mean ${fmt(c.mean)}, p75 ${fmt(c.p75)}, max ${fmt(c.max)}; std ${fmt(c.std)}; sum ${fmt(c.sum)}`);
    else if (c.type === "date") lines.push(`- ${c.name} (date): n=${c.count}${miss}; from ${c.min} to ${c.max} (${c.spanDays} days)`);
    else if (c.type === "boolean") lines.push(`- ${c.name} (yes/no): n=${c.count}${miss}; true ${c.trueCount} (${Math.round((c.trueCount / Math.max(1, c.count)) * 100)}%)`);
    else lines.push(`- ${c.name} (text): n=${c.count}${miss}; ${c.distinct} distinct${c.top.length ? `; most common: ${c.top.map((x) => `"${x.value}" ×${x.count}`).join(", ")}` : ""}`);
  }
  const numeric = cols.map((c, i) => ({ c, i })).filter((x) => x.c.type === "number").slice(0, 12);
  const pairs: { a: string; b: string; r: number; n: number }[] = [];
  for (let x = 0; x < numeric.length; x++)
    for (let y = x + 1; y < numeric.length; y++) {
      const col = (i: number) => t.rows.map((r) => toNumber(r[i]));
      const { r, n } = pearson(col(numeric[x].i), col(numeric[y].i));
      if (Math.abs(r) >= 0.5 && n >= 8) pairs.push({ a: numeric[x].c.name, b: numeric[y].c.name, r, n });
    }
  pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  if (pairs.length) lines.push(`Strongest correlations (Pearson r): ${pairs.slice(0, 4).map((p) => `${p.a} ↔ ${p.b} r=${p.r.toFixed(2)}`).join("; ")}.`);
  return { text: lines.join("\n"), columns: cols };
}

/** Rows as CSV text (the material for row-level questions), cut to a character budget. */
export function rowsText(t: Table, budget: number): { text: string; rows: number } {
  const esc = (v: Cell) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [t.header.map(esc).join(",")];
  let len = out[0].length;
  let n = 0;
  for (const r of t.rows) {
    const line = r.map(esc).join(",");
    if (len + line.length + 1 > budget) break;
    out.push(line);
    len += line.length + 1;
    n++;
  }
  return { text: out.join("\n"), rows: n };
}

/** Profile + data block for the models. */
export function tableBlock(t: Table, budget: number): { text: string; summary: string; truncated: boolean } {
  const p = profileText(t);
  const room = Math.max(1000, budget - p.text.length - 300);
  const r = rowsText(t, room);
  const partial = r.rows < t.totalRows;
  const text = `[Statistics computed exactly by Keplar from the file — use these numbers, do not estimate]\n${p.text}\n\n[Rows${partial ? ` 1–${r.rows.toLocaleString("en-US")} of ${t.totalRows.toLocaleString("en-US")}` : ""} as CSV]\n${r.text}`;
  return { text, summary: `${t.totalRows.toLocaleString("en-US")} rows · ${t.header.length} columns`, truncated: partial };
}

/* ───────────────────────── JSON ───────────────────────── */

const flatObj = (o: Record<string, unknown>, prefix = "", out: Record<string, Cell> = {}, depth = 0): Record<string, Cell> => {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && depth < 2) flatObj(v as Record<string, unknown>, key, out, depth + 1);
    else out[key] = v == null ? null : typeof v === "number" ? v : typeof v === "object" ? JSON.stringify(v).slice(0, 200) : String(v);
  }
  return out;
};

/** Array of records inside a JSON value (the value itself, or its largest array-of-objects property). */
export function recordsIn(v: unknown): { path: string; records: Record<string, unknown>[] } | null {
  const isRecs = (a: unknown): a is Record<string, unknown>[] => Array.isArray(a) && a.length >= 2 && a.slice(0, 20).every((x) => x && typeof x === "object" && !Array.isArray(x));
  if (isRecs(v)) return { path: "$", records: v };
  // The largest array of objects up to three levels down (e.g. { data: { items: [...] } }).
  let best: { path: string; records: Record<string, unknown>[] } | null = null;
  const walk = (x: unknown, path: string, depth: number) => {
    if (!x || typeof x !== "object" || Array.isArray(x) || depth > 3) return;
    for (const [k, y] of Object.entries(x as Record<string, unknown>).slice(0, 200)) {
      const p = path ? `${path}.${k}` : k;
      if (isRecs(y)) { if (!best || y.length > best.records.length) best = { path: p, records: y }; }
      else walk(y, p, depth + 1);
    }
  };
  walk(v, "", 1);
  return best;
}

export function recordsTable(name: string, recs: Record<string, unknown>[], maxRows: number): Table {
  const flat = recs.slice(0, maxRows).map((r) => flatObj(r));
  const keys: string[] = [];
  for (const r of flat.slice(0, 500)) for (const k of Object.keys(r)) if (!keys.includes(k) && keys.length < 60) keys.push(k);
  return { name, header: keys, rows: flat.map((r) => keys.map((k) => (k in r ? r[k] : null))), totalRows: recs.length, truncated: recs.length > maxRows };
}

/** Shape of any JSON value: keys, types and array sizes, a few levels deep. */
export function jsonShape(v: unknown, depth = 0, indent = ""): string {
  if (depth > 3) return `${indent}…`;
  if (Array.isArray(v)) return `${indent}array[${v.length}]${v.length ? `\n${jsonShape(v[0], depth + 1, indent + "  ")}` : ""}`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).slice(0, 30);
    return entries.map(([k, x]) => (x && typeof x === "object" ? `${indent}${k}: ${Array.isArray(x) ? `array[${x.length}]` : "object"}\n${jsonShape(Array.isArray(x) ? x[0] : x, depth + 1, indent + "  ")}` : `${indent}${k}: ${x === null ? "null" : typeof x}`)).join("\n");
  }
  return `${indent}${v === null ? "null" : typeof v}`;
}
