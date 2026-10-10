/** Line diff between two versions of a site's files. Pure; used by the History "Compare" view. */
export type Op = { t: " " | "+" | "-"; s: string };
export type FileDiff = { path: string; status: "added" | "removed" | "changed" | "same"; plus: number; minus: number };

/** Longest-common-subsequence line diff; trims shared head/tail first. Over `limit` middle lines on both sides it degrades to "all removed, all added" rather than spend O(n*m). */
export function lineDiff(a: string, b: string, limit = 2500): Op[] {
  const x = a === "" ? [] : a.split("\n");
  const y = b === "" ? [] : b.split("\n");
  let head = 0;
  while (head < x.length && head < y.length && x[head] === y[head]) head++;
  let tail = 0;
  while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++;
  const mx = x.slice(head, x.length - tail);
  const my = y.slice(head, y.length - tail);
  const ops: Op[] = x.slice(0, head).map((s) => ({ t: " ", s }));
  if (mx.length > limit || my.length > limit) {
    for (const s of mx) ops.push({ t: "-", s });
    for (const s of my) ops.push({ t: "+", s });
  } else {
    const n = mx.length, m = my.length;
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = mx[i] === my[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (mx[i] === my[j]) { ops.push({ t: " ", s: mx[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: "-", s: mx[i++] });
      else ops.push({ t: "+", s: my[j++] });
    }
    while (i < n) ops.push({ t: "-", s: mx[i++] });
    while (j < m) ops.push({ t: "+", s: my[j++] });
  }
  for (const s of x.slice(x.length - tail)) ops.push({ t: " ", s });
  return ops;
}

export function diffFiles(from: Record<string, string>, to: Record<string, string>): FileDiff[] {
  const paths = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort((p, q) => (p === "index.html" ? -1 : q === "index.html" ? 1 : p.localeCompare(q)));
  return paths.map((path) => {
    const a = from[path], b = to[path];
    if (a === undefined) return { path, status: "added" as const, plus: b === "" ? 0 : b.split("\n").length, minus: 0 };
    if (b === undefined) return { path, status: "removed" as const, plus: 0, minus: a === "" ? 0 : a.split("\n").length };
    if (a === b) return { path, status: "same" as const, plus: 0, minus: 0 };
    const ops = lineDiff(a, b);
    return { path, status: "changed" as const, plus: ops.filter((o) => o.t === "+").length, minus: ops.filter((o) => o.t === "-").length };
  });
}

/** Only the changed lines with `ctx` lines of context around them; gaps become a "…" marker. Capped at `max` rows. */
export function hunks(ops: Op[], ctx = 2, max = 200): { rows: (Op | { t: "…"; s: string })[]; truncated: boolean } {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((o, i) => { if (o.t !== " ") for (let k = Math.max(0, i - ctx); k <= Math.min(ops.length - 1, i + ctx); k++) keep[k] = true; });
  const rows: (Op | { t: "…"; s: string })[] = [];
  let gap = false;
  for (let i = 0; i < ops.length; i++) {
    if (!keep[i]) { gap = rows.length > 0; continue; }
    if (gap) { rows.push({ t: "…", s: "" }); gap = false; }
    rows.push(ops[i]);
    if (rows.length >= max) return { rows, truncated: true };
  }
  return { rows, truncated: false };
}
