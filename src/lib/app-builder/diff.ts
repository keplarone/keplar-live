/**
 * Line diffs between two versions of a generated app, for the studio's Changes view (what a follow-up prompt changed).
 * Myers' O(ND) algorithm on lines; very large or completely rewritten files fall back to "replaced" instead of spending
 * seconds on the main thread. Pure (no DOM), shared by tests.
 */
export type DiffOp = { t: "=" | "+" | "-"; text: string };
export type Hunk = { oldStart: number; newStart: number; ops: DiffOp[] };
export type FileChange = { path: string; status: "added" | "removed" | "changed"; added: number; removed: number };

const splitLines = (s: string) => (s === "" ? [] : s.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n"));

/** Line diff of a -> b. `maxEdits` bounds the work; past it the whole file is reported as removed + added. */
export function diffLines(a: string, b: string, maxEdits = 4000): DiffOp[] {
  const A = splitLines(a);
  const B = splitLines(b);
  // Trim the common prefix/suffix first: edits are usually local.
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const mid = myers(a2, b2, maxEdits) ?? [...a2.map((text) => ({ t: "-" as const, text })), ...b2.map((text) => ({ t: "+" as const, text }))];
  return [...A.slice(0, pre).map((text) => ({ t: "=" as const, text })), ...mid, ...A.slice(A.length - suf).map((text) => ({ t: "=" as const, text }))];
}

function myers(a: string[], b: string[], maxEdits: number): DiffOp[] | null {
  const n = a.length;
  const m = b.length;
  if (!n) return b.map((text) => ({ t: "+", text }));
  if (!m) return a.map((text) => ({ t: "-", text }));
  const max = Math.min(n + m, maxEdits);
  const off = max + 1;
  let v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    const nv = v.slice();
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      nv[off + k] = x;
      if (x >= n && y >= m) {
        trace.push(nv);
        return backtrack(trace, a, b, off);
      }
    }
    v = nv;
  }
  return null;
}

function backtrack(trace: Int32Array[], a: string[], b: string[], off: number): DiffOp[] {
  const out: DiffOp[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 2; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : v[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ t: "=", text: a[--x] });
      y--;
    }
    if (d === 0) break;
    if (x === prevX) out.push({ t: "+", text: b[--y] });
    else out.push({ t: "-", text: a[--x] });
  }
  while (x > 0 && y > 0) {
    out.push({ t: "=", text: a[--x] });
    y--;
  }
  return out.reverse();
}

/** Groups a diff into hunks with `context` unchanged lines around each change (like `diff -u`). */
export function toHunks(ops: DiffOp[], context = 3): Hunk[] {
  const hunks: Hunk[] = [];
  let oldLine = 1;
  let newLine = 1;
  let cur: Hunk | null = null;
  let tail = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.t !== "=") {
      if (!cur) {
        const back = [];
        for (let j = i - 1; j >= 0 && back.length < context && ops[j].t === "="; j--) back.unshift(ops[j]);
        cur = { oldStart: oldLine - back.length, newStart: newLine - back.length, ops: back };
        hunks.push(cur);
      }
      cur.ops.push(op);
      tail = 0;
    } else if (cur) {
      // Look ahead: keep the hunk open if another change is within 2*context lines.
      let nextChange = -1;
      for (let j = i; j < ops.length && j <= i + context * 2; j++) if (ops[j].t !== "=") { nextChange = j; break; }
      if (nextChange >= 0 || tail < context) {
        cur.ops.push(op);
        tail++;
        if (nextChange < 0 && tail >= context) cur = null;
      } else cur = null;
    }
    if (op.t !== "+") oldLine++;
    if (op.t !== "-") newLine++;
  }
  return hunks;
}

/** Which files a version changed relative to the previous one, with added/removed line counts. Unchanged files are left out. */
export function compareVersions(prev: Record<string, string>, next: Record<string, string>): FileChange[] {
  const out: FileChange[] = [];
  for (const path of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[path];
    const b = next[path];
    if (a === b) continue;
    if (a === undefined) out.push({ path, status: "added", added: splitLines(b).length, removed: 0 });
    else if (b === undefined) out.push({ path, status: "removed", added: 0, removed: splitLines(a).length });
    else {
      const ops = diffLines(a, b);
      out.push({ path, status: "changed", added: ops.filter((o) => o.t === "+").length, removed: ops.filter((o) => o.t === "-").length });
    }
  }
  const rank = { changed: 0, added: 1, removed: 2 } as const;
  return out.sort((x, y) => rank[x.status] - rank[y.status] || y.added + y.removed - (x.added + x.removed) || x.path.localeCompare(y.path));
}
