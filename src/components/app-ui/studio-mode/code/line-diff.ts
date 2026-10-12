/**
 * A line diff (pure). Used for the +/- counts, the changed-line ranges the code panel highlights, and the changes list.
 * The diff view itself renders with @codemirror/merge; this module only has to agree with it on what changed per line.
 *
 * Common prefix and suffix are trimmed first; the middle is an exact LCS when it is small enough (MAX_CELLS), otherwise the whole
 * middle counts as replaced (still exact counts of lines removed and added, just not the minimal pairing).
 */
export type DiffOp = { op: "equal" | "add" | "del"; /** 1-based line in the old text (equal/del) */ a: number; /** 1-based line in the new text (equal/add) */ b: number; count: number };
export type LineRange = { from: number; to: number };
export type DiffSummary = {
  added: number;
  removed: number;
  ops: DiffOp[];
  /** Lines in the NEW text that were added or replaced (1-based, inclusive). */
  changed: LineRange[];
  /** Lines in the NEW text right where something was only deleted (nothing added there), for a marker. */
  deletedAt: number[];
};

const MAX_CELLS = 4_000_000;

export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export function diffLines(before: string, after: string): DiffSummary {
  const a = splitLines(before);
  const b = splitLines(after);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp["op"], ai: number, bi: number) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.count++;
    else ops.push({ op, a: ai + 1, b: bi + 1, count: 1 });
  };
  for (let i = 0; i < pre; i++) push("equal", i, i);
  if (am.length * bm.length <= MAX_CELLS && am.length && bm.length) {
    // LCS table (lengths of the suffixes), then walk forward.
    const w = bm.length + 1;
    const t = new Uint32Array((am.length + 1) * w);
    for (let i = am.length - 1; i >= 0; i--) {
      for (let j = bm.length - 1; j >= 0; j--) {
        t[i * w + j] = am[i] === bm[j] ? t[(i + 1) * w + j + 1]! + 1 : Math.max(t[(i + 1) * w + j]!, t[i * w + j + 1]!);
      }
    }
    let i = 0, j = 0;
    while (i < am.length && j < bm.length) {
      if (am[i] === bm[j]) { push("equal", pre + i, pre + j); i++; j++; }
      else if (t[(i + 1) * w + j]! >= t[i * w + j + 1]!) { push("del", pre + i, pre + j); i++; }
      else { push("add", pre + i, pre + j); j++; }
    }
    while (i < am.length) { push("del", pre + i, pre + j); i++; }
    while (j < bm.length) { push("add", pre + i, pre + j); j++; }
  } else {
    for (let i = 0; i < am.length; i++) push("del", pre + i, pre);
    for (let j = 0; j < bm.length; j++) push("add", pre + am.length, pre + j);
  }
  for (let k = 0; k < suf; k++) push("equal", a.length - suf + k, b.length - suf + k);

  let added = 0, removed = 0;
  const changed: LineRange[] = [];
  const deletedAt: number[] = [];
  for (const o of ops) {
    if (o.op === "add") {
      added += o.count;
      const last = changed[changed.length - 1];
      if (last && last.to + 1 >= o.b) last.to = Math.max(last.to, o.b + o.count - 1);
      else changed.push({ from: o.b, to: o.b + o.count - 1 });
    } else if (o.op === "del") {
      removed += o.count;
    }
  }
  ops.forEach((o, i) => {
    if (o.op !== "del") return;
    const next = ops[i + 1];
    const prev = ops[i - 1];
    if (next?.op === "add" || prev?.op === "add") return;
    deletedAt.push(Math.min(Math.max(1, o.b), b.length));
  });
  return { added, removed, ops, changed, deletedAt };
}
